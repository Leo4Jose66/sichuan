#  -*- coding: utf-8 -*-
"""
Cloud Excel Sync Service
- Background thread for scheduled daily download + import
- Manual trigger for immediate sync
- ETag / Last-Modified incremental detection
"""
import hashlib
import logging
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

from . import config
from .database import SessionLocal
from .importer import import_to_db
from .models import ImportBatch

log = logging.getLogger("cloud_sync")


class SyncStatus:
    """Sync status (in-memory, initialized on startup)"""
    def __init__(self):
        self.last_run_at: Optional[datetime] = None
        self.last_result: str = "never"          #  success / failed / skipped
        self.last_message: str = ""
        self.last_inserted: int = 0
        self.last_duration_ms: int = 0
        self.next_run_at: Optional[datetime] = None
        self.is_running: bool = False
        self.last_etag: Optional[str] = None
        self.last_modified: Optional[str] = None
        self.history: list[dict] = []           #  Recent 20 records

    def to_dict(self) -> dict:
        return {
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "last_result": self.last_result,
            "last_message": self.last_message,
            "last_inserted": self.last_inserted,
            "last_duration_ms": self.last_duration_ms,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
            "is_running": self.is_running,
            "last_etag": self.last_etag,
            "last_modified": self.last_modified,
            "history": self.history[:20],
            "config": {
                "url": config.settings.cloud_excel_url,
                "time": config.settings.cloud_sync_time,
                "enabled": config.settings.cloud_sync_enabled,
                "transit_enabled": config.settings.cloud_sync_transit_enabled,
                "transit_url": config.settings.cloud_sync_transit_url,
                "transit_strategy": config.settings.cloud_sync_transit_strategy,
                "transit_selector": config.settings.cloud_sync_transit_selector,
            },
        }


class SyncService:
    """
    Cloud sync service (singleton)
    - start(): Launch background scheduler thread
    - sync_now(): Immediate sync (manual trigger)
    - get_status(): Get status
    """
    _instance: Optional["SyncService"] = None

    def __init__(self):
        self.status = SyncStatus()
        self._lock = threading.Lock()
        self._scheduler_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        #  Calculate next sync time
        self.status.next_run_at = self._calc_next_run()

    @classmethod
    def instance(cls) -> "SyncService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    #  ============================================================
    #  Public methods
    #  ============================================================
    def start(self):
        """Start background scheduler thread"""
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            log.info("[Sync] Scheduler already running")
            return
        self._stop_event.clear()
        self._scheduler_thread = threading.Thread(
            target=self._scheduler_loop,
            name="cloud-sync-scheduler",
            daemon=True,
        )
        self._scheduler_thread.start()
        log.info(f"[Sync] Scheduler started, next sync: {self.status.next_run_at}")

    def stop(self):
        """Stop scheduler (called on process exit)"""
        self._stop_event.set()

    def sync_now(self, force: bool = False) -> dict:
        """Manual trigger for immediate sync
        - force=True: 忽略 ETag 缓存,强制下载
        """
        if self.status.is_running:
            return {"success": False, "message": "Sync task in progress, please wait"}
        with self._lock:
            if self.status.is_running:
                return {"success": False, "message": "Sync task in progress, please wait"}
            self.status.is_running = True
        try:
            return self._do_sync(force=force)
        finally:
            self.status.is_running = False

    def get_status(self) -> dict:
        return self.status.to_dict()

    def update_config(self, url: str, time: str, enabled: bool,
                      token: str = "", headers: dict = None,
                      transit_enabled: bool = False,
                      transit_url: str = "",
                      transit_strategy: str = "auto",
                      transit_selector: str = "",
                      transit_cookie: str = "") -> dict:
        """Update sync config"""
        #  Validate time format HH:MM
        try:
            datetime.strptime(time, "%H:%M")
        except ValueError:
            return {"success": False, "message": f"Time format error: {time},should be HH:MM"}
        if url and not (url.startswith("http://") or url.startswith("https://")):
            return {"success": False, "message": "URL must start with http:// or https://"}
        if transit_url and not (transit_url.startswith("http://") or transit_url.startswith("https://")):
            return {"success": False, "message": "中转页 URL must start with http:// or https://"}

        config.settings.cloud_excel_url = url
        config.settings.cloud_sync_time = time
        config.settings.cloud_sync_enabled = enabled
        if token:
            config.settings.cloud_sync_token = token
        if headers:
            config.settings.cloud_sync_headers = headers
        #  Transit page settings
        config.settings.cloud_sync_transit_enabled = transit_enabled
        config.settings.cloud_sync_transit_url = transit_url
        config.settings.cloud_sync_transit_strategy = transit_strategy
        config.settings.cloud_sync_transit_selector = transit_selector
        config.settings.cloud_sync_transit_cookie = transit_cookie
        #  Recalculate next run time
        self.status.next_run_at = self._calc_next_run()
        return {"success": True, "message": "Config updated", "config": self.status.to_dict()["config"]}

    #  ============================================================
    #  Internal methods
    #  ============================================================
    def _scheduler_loop(self):
        """Scheduler loop - check every 30s if scheduled"""
        while not self._stop_event.is_set():
            try:
                if config.settings.cloud_sync_enabled and config.settings.cloud_excel_url:
                    now = datetime.now()
                    if self.status.next_run_at and now >= self.status.next_run_at:
                        log.info("[Sync] Scheduled sync triggered")
                        self.sync_now(force=False)
                        #  Recalculate (tomorrow 08:30)
                        self.status.next_run_at = self._calc_next_run()
                        log.info(f"[Sync] Next sync: {self.status.next_run_at}")
            except Exception as e:
                log.exception(f"[Sync] Scheduler error: {e}")
            #  Brief sleep then continue
            self._stop_event.wait(timeout=30)

    def _calc_next_run(self) -> Optional[datetime]:
        """Calculate next scheduled sync time"""
        if not config.settings.cloud_sync_time:
            return None
        try:
            hh, mm = config.settings.cloud_sync_time.split(":")
            now = datetime.now().replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
            if now <= datetime.now():
                now += timedelta(days=1)
            return now
        except Exception:
            return None

    def _do_sync(self, force: bool = False) -> dict:
        """Download + import"""
        start = time.time()
        #  Check transit or direct mode
        if config.settings.cloud_sync_transit_enabled and config.settings.cloud_sync_transit_url:
            return self._do_transit_sync(force=force, start=start)
        url = config.settings.cloud_excel_url
        if not url:
            msg = "Cloud URL not configured"
            self._record_result("failed", msg, 0, int((time.time()-start)*1000))
            return {"success": False, "message": msg}

        log.info(f"[Sync] Start sync: {url}, force={force}")

        #  Prepare headers
        headers = dict(config.settings.cloud_sync_headers or {})
        if config.settings.cloud_sync_token:
            headers["Authorization"] = f"Bearer {config.settings.cloud_sync_token}"
        if self.status.last_etag and not force:
            headers["If-None-Match"] = self.status.last_etag
        if self.status.last_modified and not force:
            headers["If-Modified-Since"] = self.status.last_modified

        #  1. GET (ETag check, 304 = unchanged)
        file_bytes = None
        last_err = None
        try:
            resp = self._http_get(url, headers)
            if resp.status_code == 304:
                msg = f"File unchanged (ETag: {self.status.last_etag[:16]}...)"
                self._record_result("skipped", msg, 0, int((time.time()-start)*1000))
                return {"success": True, "message": msg, "skipped": True}
            resp.raise_for_status()
            file_bytes = resp.content
            #  Save ETag/Last-Modified
            self.status.last_etag = resp.headers.get("ETag")
            self.status.last_modified = resp.headers.get("Last-Modified")
        except Exception as e:
            last_err = e
            #  Retry (exponential backoff)
            for i in range(config.settings.cloud_sync_retry):
                time.sleep(2 ** i)
                try:
                    log.info(f"[Sync] Retry {i+2}...")
                    resp = self._http_get(url, headers)
                    resp.raise_for_status()
                    file_bytes = resp.content
                    self.status.last_etag = resp.headers.get("ETag")
                    self.status.last_modified = resp.headers.get("Last-Modified")
                    break
                except Exception as e2:
                    last_err = e2
                    log.warning(f"[Sync] Retry {i+2} 失败: {e2}")
            if file_bytes is None:
                msg = self._classify_error(last_err, url)
                self._record_result("failed", msg, 0, int((time.time()-start)*1000))
                return {"success": False, "message": msg}

        if not file_bytes or len(file_bytes) < 100:
            msg = f"Download too small ({len(file_bytes) if file_bytes else 0} bytes), might not be valid Excel"
            self._record_result("failed", msg, 0, int((time.time()-start)*1000))
            return {"success": False, "message": msg}

        #  2. Parse + import
        try:
            from datetime import datetime
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"cloud_sync_{ts}.xlsx"
            db = SessionLocal()
            try:
                batch = import_to_db(
                    db, file_bytes, filename,
                    operator="cloud-sync", replace=True,
                )
                inserted = batch.row_count
                skipped = batch.skipped_count
                msg = f"Sync {inserted} rows, skipped {skipped} 条"
                self._record_result("success", msg, inserted, int((time.time()-start)*1000))
                log.info(f"[Sync] {msg}")
                return {"success": True, "message": msg, "inserted": inserted, "skipped": skipped}
            finally:
                db.close()
        except Exception as e:
            msg = f"Import failed: {e}"
            log.exception(msg)
            self._record_result("failed", msg, 0, int((time.time()-start)*1000))
            return {"success": False, "message": msg}

    def _do_transit_sync(self, force: bool = False, start: float = 0) -> dict:
        """中转页模式同步:打开页面 → 点击下载 → 拿 Excel"""
        if start == 0:
            start = time.time()
        page_url = config.settings.cloud_sync_transit_url
        strategy = config.settings.cloud_sync_transit_strategy
        selector = config.settings.cloud_sync_transit_selector
        cookie_str = config.settings.cloud_sync_transit_cookie
        log.info(f"[Sync] Transit mode: {page_url} (strategy={strategy})")
        try:
            downloader = TransitDownloader(timeout=config.settings.cloud_sync_timeout)
            file_bytes = downloader.download(
                page_url=page_url, strategy=strategy,
                selector=selector, cookie_str=cookie_str,
            )
        except RuntimeError as e:
            msg = str(e)
            self._record_result("failed", msg, 0, int((time.time()-start)*1000))
            return {"success": False, "message": msg}
        except Exception as e:
            msg = self._classify_transit_error(e)
            log.exception(msg)
            self._record_result("failed", msg, 0, int((time.time()-start)*1000))
            return {"success": False, "message": msg}

        if not file_bytes or len(file_bytes) < 100:
            msg = f"Download too small ({len(file_bytes) if file_bytes else 0} bytes), might not be valid Excel"
            self._record_result("failed", msg, 0, int((time.time()-start)*1000))
            return {"success": False, "message": msg}

        #  
        try:
            from .database import SessionLocal
            from .importer import import_to_db
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"cloud_transit_{ts}.xlsx"
            db = SessionLocal()
            try:
                batch = import_to_db(
                    db, file_bytes, filename,
                    operator="cloud-transit", replace=True,
                )
                inserted = batch.row_count
                skipped = batch.skipped_count
                # 查一条示例数据返回给前端预览
                from .models import Project
                sample = db.query(Project).first()
                sample_dict = None
                if sample:
                    sample_dict = {
                        "project_no": sample.project_no,
                        "opportunity_name": sample.opportunity_name,
                        "customer": sample.customer,
                        "owner": sample.owner,
                        "industry": sample.industry,
                        "track": sample.track,
                        "confidence": sample.confidence,
                        "predict_month": sample.predict_month,
                        "software_budget": sample.software_budget,
                        "cloud_budget": sample.cloud_budget,
                    }
                msg = f"Transit sync {inserted} rows, skipped {skipped}"
                self._record_result("success", msg, inserted, int((time.time()-start)*1000))
                log.info(f"[Sync] {msg}")
                return {
                    "success": True,
                    "message": msg,
                    "inserted": inserted,
                    "skipped": skipped,
                    "sample": sample_dict,
                }
            finally:
                db.close()
        except Exception as e:
            msg = f"Import failed: {e}"
            log.exception(msg)
            self._record_result("failed", msg, 0, int((time.time()-start)*1000))
            return {"success": False, "message": msg}

    def _http_get(self, url: str, headers: dict):
        """HTTP GET. PP_CLOUD_PROXY set -> use it. Empty -> bypass system proxy (direct)"""
        proxy_url = getattr(config.settings, "cloud_sync_proxy", "")
        if proxy_url:
            proxies = {"http": proxy_url, "https": proxy_url}
        else:
            #  Pass None to bypass system proxy (common on Windows corp networks)
            proxies = {"http": None, "https": None}
        return requests.get(
            url,
            headers=headers,
            timeout=config.settings.cloud_sync_timeout,
            allow_redirects=True,
            proxies=proxies,
        )

    def _classify_transit_error(self, err: Exception) -> str:
        """Classify Playwright/transit errors to user-friendly Chinese messages"""
        s = str(err)
        # Playwright 浏览器二进制没装
        if "Executable doesn't exist" in s or "playwright install" in s or "chrome-headless-shell" in s:
            return ("Playwright 浏览器未安装。\n"
                    "请在 backend 目录执行:\n"
                    "  pip install playwright\n"
                    "  playwright install chromium\n"
                    f"\n原始错误: {s[:120]}")
        # Playwright Python 包没装
        if "playwright" in s.lower() and "No module" in s:
            return ("Playwright 未安装。\n"
                    "请在 backend 目录执行: pip install playwright && playwright install chromium")
        # Timeout - 点击后没触发下载
        if "Timeout" in s and ("download" in s.lower() or "expect" in s.lower()):
            return ("点击后未触发下载。\n"
                    "可能原因:\n"
                    "1. 选择的下载按钮不对,试试换 text 策略或改 selector\n"
                    "2. 页面需要登录,填入 Cookie\n"
                    "3. 页面需等待 JS 加载完成\n"
                    f"\n原始错误: {s[:150]}")
        # Selector 找不到元素
        if "Timeout" in s and "selector" in s.lower():
            return f"未找到元素 (选择器不存在或不可点击)。\n原始错误: {s[:200]}"
        # 默认
        return f"中转页下载失败: {type(err).__name__}: {s[:200]}"

    def _classify_error(self, err: Exception, url: str) -> str:
        """把异常分类成人话-避免堆一串堆栈"""
        import re
        s = str(err)
        #  Proxy error
        if "ProxyError" in s or "Tunnel connection failed" in s:
            return ("无法连接代理服务器(检查企业代理是否在线,或设置 PP_CLOUD_PROXY 绕过)."
                    f"Original error: {s[:80]}")
        #  DNS / Connection error
        if "ConnectionError" in s or "NameResolutionError" in s or "NewConnectionError" in s:
            return (f"无法连接主机(检查 URL/网络).Original error: {s[:80]}")
        #  Timeout
        if "Timeout" in s:
            return (f"请求Timeout({config.settings.cloud_sync_timeout}秒).Original error: {s[:80]}")
        #  404 / 403 / 401
        m = re.search(r"(\d{3})\s*Client Error", s)
        if m:
            code = m.group(1)
            hint = {401: "Auth required (check Token)", 403: "Forbidden (check permission)", 404: "Not found (check URL)"}.get(code, "")
            return f"HTTP {code} {hint}.Original error: {s[:80]}"
        m = re.search(r"(\d{3})\s*Server Error", s)
        if m:
            return f"Server error HTTP {m.group(1)}.Original error: {s[:80]}"
        return f"下载失败: {s[:120]}"

    def test_connection(self, url: str = None, token: str = None,
                        headers: dict = None) -> dict:
        """测试 URL 是否可访问(GET 请求一次)-不实际入库"""
        url = url or config.settings.cloud_excel_url
        if not url:
            return {"success": False, "message": "URL not provided"}
        if not (url.startswith("http://") or url.startswith("https://")):
            return {"success": False, "message": "URL must start with http:// or https://"}
        h = dict(headers or config.settings.cloud_sync_headers or {})
        if token or config.settings.cloud_sync_token:
            h["Authorization"] = f"Bearer {token or config.settings.cloud_sync_token}"
        try:
            resp = self._http_get(url, h)
            if resp.status_code == 200:
                size = len(resp.content)
                ct = resp.headers.get("Content-Type", "unknown")
                etag = resp.headers.get("ETag", "")
                return {
                    "success": True,
                    "message": f"Connected, returned {size} bytes, Content-Type: {ct}",
                    "status_code": resp.status_code,
                    "size": size,
                    "etag": etag,
                }
            else:
                return {
                    "success": False,
                    "message": f"HTTP {resp.status_code} {resp.reason}",
                    "status_code": resp.status_code,
                }
        except Exception as e:
            return {"success": False, "message": self._classify_error(e, url)}

    def _record_result(self, result: str, message: str, inserted: int, duration_ms: int):
        self.status.last_run_at = datetime.now()
        self.status.last_result = result
        self.status.last_message = message
        self.status.last_inserted = inserted
        self.status.last_duration_ms = duration_ms
        self.status.history.insert(0, {
            "at": self.status.last_run_at.isoformat(),
            "result": result,
            "message": message,
            "inserted": inserted,
            "duration_ms": duration_ms,
        })
        self.status.history = self.status.history[:20]


#  ============================================================
#  Transit page downloader - download files from pages requiring click
#  ============================================================
class TransitDownloader:
    """Download files from click-required pages. Open URL, find download button (auto/text/selector), click and capture
    """

    def __init__(self, headless: bool = True, timeout: int = 60):
        self.headless = headless
        self.timeout = timeout * 1000  #  Playwright uses ms
        self._playwright = None
        self._browser = None

    def _ensure_browser(self):
        """Init Playwright. Priority: msedge (uses installed Edge) > chromium-headless-shell > chromium"""
        if self._browser is not None:
            return
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise RuntimeError(
                "Transit needs Playwright. Install: pip install playwright && playwright install chromium"
            )
        proxy_url = getattr(config.settings, "cloud_sync_proxy", "")
        launch_kwargs = {"headless": self.headless}
        if proxy_url:
            launch_kwargs["proxy"] = {"server": proxy_url}
        browser_pref = getattr(config.settings, "cloud_sync_browser", "auto")
        self._playwright = sync_playwright().start()
        last_err = None
        # Browser priority: Edge (channel=msedge, uses installed Edge) > chromium-headless-shell > chromium
        attempts = []
        if browser_pref in ("auto", "msedge"):
            attempts.append(("msedge", {"channel": "msedge"}))
        if browser_pref in ("auto", "chromium"):
            attempts.append(("chromium", {}))
        for name, extra in attempts:
            try:
                kw = {**launch_kwargs, **extra}
                log.info(f"[Transit] launching browser: {name}")
                self._browser = self._playwright.chromium.launch(**kw)
                log.info(f"[Transit] browser {name} started")
                return
            except Exception as e:
                last_err = e
                log.warning(f"[Transit] {name} failed: {str(e)[:120]}")
                continue
        # All failed
        hint = ("Install one of:\n"
                "1. Microsoft Edge (default on Win10/11) - 0 download, uses existing Edge\n"
                "2. Playwright chromium: playwright install chromium\n")
        raise RuntimeError(
            f"No available browser. Last error: {type(last_err).__name__}: {str(last_err)[:150]}\n\n{hint}"
        )

    def download(self, page_url: str, strategy: str = "auto",
                 selector: str = "", cookie_str: str = "") -> bytes:
        """Main entry. page_url, strategy, selector, cookie_str
        """
        self._ensure_browser()
        try:
            ctx = self._browser.new_context(
                accept_downloads=True,
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ProjectPulse/1.0",
            )
            #  Inject preset cookies
            if cookie_str:
                self._inject_cookies(ctx, page_url, cookie_str)
            page = ctx.new_page()
            log.info(f"[Transit] Open transit page: {page_url}")
            page.goto(page_url, timeout=self.timeout, wait_until="domcontentloaded")
            #  Wait for page stable
            page.wait_for_load_state("networkidle", timeout=self.timeout)

            #  1) Find .xlsx links directly
            if strategy == "auto":
                #  Find first link to .xlsx/.xls
                href = page.evaluate("""() => {
                    const links = Array.from(document.querySelectorAll('a[href]'));
                    for (const a of links) {
                        const h = a.href || '';
                        if (h.match(/\\.xlsx?($|\\?)/i)) return h;
                    }
                    return null;
                }""")
                if href:
                    log.info(f"[Transit] auto found xlsx link: {href[:100]}")
                    return self._download_via_href(ctx, href)
                #  /
                return self._click_text_button(page, ctx)

            elif strategy == "text":
                return self._click_text_button(page, ctx)

            elif strategy == "selector":
                if not selector:
                    raise RuntimeError("strategy=selector requires CSS selector")
                log.info(f"[Transit] Click by selector: {selector}")
                with page.expect_download(timeout=self.timeout) as dl_info:
                    page.click(selector, timeout=self.timeout)
                download = dl_info.value
                path = download.path()
                if not path:
                    raise RuntimeError("Browser did not provide download path")
                with open(path, "rb") as f:
                    return f.read()

            else:
                raise RuntimeError(f"unknown策略: {strategy}")
        finally:
            try:
                self._browser.close()
            except Exception:
                pass
            try:
                self._playwright.stop()
            except Exception:
                pass
            self._browser = None
            self._playwright = None
            log.info("[Transit] Browser closed")

    def _click_text_button(self, page, ctx) -> bytes:
        """点“下载/导出/Download”文本的按钮"""
        keywords = ["下载", "导出", "Download", "Export", "Save", "保存"]
        #  Use Playwright get_by_role for these keywords
        for kw in keywords:
            try:
                loc = page.get_by_role("button", name=kw).first
                if loc.count() > 0:
                    with page.expect_download(timeout=self.timeout) as dl_info:
                        loc.click()
                    download = dl_info.value
                    log.info(f"[Transit] 点击「{kw}」按钮成功")
                    return self._read_download(download)
            except Exception:
                pass
            try:
                loc = page.get_by_role("link", name=kw).first
                if loc.count() > 0:
                    href = loc.get_attribute("href")
                    if href and (".xlsx" in href.lower() or ".xls" in href.lower()):
                        return self._download_via_href(ctx, href)
                    with page.expect_download(timeout=self.timeout) as dl_info:
                        loc.click()
                    download = dl_info.value
                    log.info(f"[Transit] 点击「{kw}」链接成功")
                    return self._read_download(download)
            except Exception:
                pass
        raise RuntimeError("未找到任何「下载/导出」按钮或链接")

    def _download_via_href(self, ctx, href: str) -> bytes:
        """GET the URL in current context"""
        #  Use Playwright context request (with cookies)
        api_request = ctx.request
        proxy_url = getattr(config.settings, "cloud_sync_proxy", "")
        resp = api_request.get(href, timeout=self.timeout)
        if not resp.ok:
            raise RuntimeError(f"Download failed HTTP {resp.status}: {href[:80]}")
        return resp.body()

    def _read_download(self, download) -> bytes:
        path = download.path()
        if not path:
            raise RuntimeError("Browser did not provide download path")
        with open(path, "rb") as f:
            return f.read()

    def _inject_cookies(self, ctx, page_url, cookie_str: str):
        """Parse and inject cookies: name1=v1; name2=v2"""
        from urllib.parse import urlparse
        domain = urlparse(page_url).netloc
        cookies = []
        for pair in cookie_str.split(";"):
            pair = pair.strip()
            if "=" not in pair:
                continue
            name, value = pair.split("=", 1)
            cookies.append({"name": name.strip(), "value": value.strip(),
                            "domain": domain, "path": "/"})
        if cookies:
            ctx.add_cookies(cookies)
            log.info(f"[Transit] Injected {len(cookies)} cookies")


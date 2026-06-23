# -*- coding: utf-8 -*-
"""
应用配置
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """应用配置项"""
    app_name: str = "Project Pulse - 项目规模分析平台"
    debug: bool = True

    # 数据库
    database_url: str = f"sqlite:///{BASE_DIR}/data/project_pulse.db"

    # 文件存储
    upload_dir: str = str(BASE_DIR / "data" / "uploads")

    # 字段映射配置
    field_mapping_path: str = str(BASE_DIR / "field_mapping.yaml")

    # ============ 云端同步配置 ============
    cloud_excel_url: str = ""           # 远程 Excel 地址 (空=禁用云同步)
    cloud_sync_time: str = "08:30"      # 每日自动同步时间 (HH:MM)
    cloud_sync_enabled: bool = True     # 是否启用定时同步
    cloud_sync_timeout: int = 60        # 下载超时(秒)
    cloud_sync_retry: int = 3           # 失败重试次数
    cloud_sync_token: str = ""          # 可选：Authorization Bearer Token
    cloud_sync_headers: dict = {}       # 可选：自定义请求头
    cloud_sync_proxy: str = ""          # 可选：HTTP 代理 (如 http://127.0.0.1:7890)
    cloud_sync_browser: str = "auto"   # auto / msedge (用本机 Edge) / chromium (用 Playwright 下载的)
    # ============ 中转页模式 (从需要点击的页面下载) ============
    cloud_sync_transit_enabled: bool = False   # 是否启用中转页模式
    cloud_sync_transit_url: str = ""          # 中转页 URL
    cloud_sync_transit_strategy: str = "auto" # 策略: auto(找 .xlsx 链接) / text(找含“下载/导出”文本的按钮) / selector(按 CSS 选择器)
    cloud_sync_transit_selector: str = ""     # 自定义 CSS 选择器
    cloud_sync_transit_cookie: str = ""       # 可选: 预设 Cookie (name1=value1; name2=value2)

    # CORS - 本地开发,放行所有
    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(env_prefix="PP_", env_file=".env")


settings = Settings()
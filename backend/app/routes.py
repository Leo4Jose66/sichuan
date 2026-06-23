# -*- coding: utf-8 -*-
"""
API 路由 - 6 个核心接口 + 辅助接口
"""
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

import io
import csv

from .database import get_db
from .models import Project, ImportBatch
from .schemas import (
    KPISummary, DimSummary, ProjectItem,
    ProjectListResponse, ImportResponse,
)
from .analytics import (
    get_kpi_summary,
    aggregate_by_dimension,
    aggregate_by_time,
)
from .importer import import_to_db, reload_field_mapping
from .seed import generate_demo_data


router = APIRouter()


# ============================================
# 健康检查
# ============================================
@router.get("/health")
def health(db: Session = Depends(get_db)):
    count = db.query(Project).count()
    return {"status": "ok", "project_count": count}


# ============================================
# 统一数据加载端点 - 兼容前端的 demo_data.json 结构
# 同一数据源，避免前后端两套逻辑
# ============================================
@router.get("/api/data")
def api_data(db: Session = Depends(get_db)):
    """返回完整数据集 - 兼容 demo_data.json 结构，供前端一次性加载"""
    projects = db.query(Project).all()
    # 转为 demo_data.json 格式
    items = []
    for p in projects:
        items.append({
            "project_no": p.project_no,
            "opportunity_name": p.opportunity_name,
            "customer": p.customer,
            "owner": p.owner,
            "partner": p.partner,
            "industry": p.industry,
            "track": p.track,
            "deployment_mode": p.deployment_mode,
            "stage": p.stage,
            "confidence": p.confidence,
            "po_ho": p.po_ho,
            "predict_month": p.predict_month,
            "software_budget": p.software_budget or 0,
            "cloud_budget": p.cloud_budget or 0,
            "scale_amount": p.scale_amount or 0,
            "progress_note": p.progress_note,
            "risk_note": p.risk_note,
        })
    # 计算 options (各字段可选值)
    def unique(field):
        s = sorted({x[field] for x in items if x.get(field)})
        return s
    options = {
        "confidence": unique("confidence"),
        "partner": unique("partner"),
        "po_ho": unique("po_ho"),
        "owner": unique("owner"),
        "industry": unique("industry"),
        "track": unique("track"),
        "deployment_mode": unique("deployment_mode"),
        "stage": unique("stage"),
        "predict_month": unique("predict_month"),
    }
    # 业务排序
    if "已下单" in options["confidence"]:
        order = ["已下单", "保底", "机会", "风险", "关闭"]
        options["confidence"] = [c for c in order if c in options["confidence"]] + [c for c in options["confidence"] if c not in order]
    if "PO" in options["po_ho"]:
        order = ["PO", "HO"]
        options["po_ho"] = [c for c in order if c in options["po_ho"]] + [c for c in options["po_ho"] if c not in order]
    return {
        "projects": items,
        "options": options,
        "version": "1.0",
        "source": "api",
    }


# ============================================
# KPI 汇总
# ============================================
@router.get("/api/kpi", response_model=KPISummary)
def api_kpi(db: Session = Depends(get_db)):
    """顶部 KPI 卡数据"""
    return get_kpi_summary(db)


# ============================================
# 维度分析 - 统一接口
# 注意:time 维度要单独处理,所以放在 generic 路由之前
# ============================================
@router.get("/api/dim/time", response_model=DimSummary)
def api_dim_time(
    start: Optional[str] = Query(None, description="起始月份 YYYY-MM"),
    end: Optional[str] = Query(None, description="截止月份 YYYY-MM"),
    db: Session = Depends(get_db),
):
    """按预测下单月份趋势"""
    return aggregate_by_time(db, start=start, end=end)


@router.get("/api/dim/{dim}", response_model=DimSummary)
def api_dim(
    dim: str,
    top_n: Optional[int] = Query(None, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """
    按维度聚合统计
    dim 取值: confidence / partner / po_ho / industry / track / deployment_mode / stage
    """
    try:
        return aggregate_by_dimension(db, dim, top_n=top_n)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================
# 项目明细 - 支持筛选 + 分页 + 排序
# ============================================
@router.get("/api/projects", response_model=ProjectListResponse)
def api_projects(
    confidence: Optional[str] = Query(None),
    partner: Optional[str] = Query(None),
    po_ho: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    track: Optional[str] = Query(None),
    predict_month: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None, description="模糊搜索:项目名/客户/编号"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_by: str = Query("scale_amount", description="排序字段"),
    sort_desc: bool = Query(True),
    db: Session = Depends(get_db),
):
    """项目明细 - 支持多维度筛选 + 分页 + 排序"""
    query = db.query(Project)

    # 筛选
    if confidence:
        query = query.filter(Project.confidence == confidence)
    if partner:
        query = query.filter(Project.partner == partner)
    if po_ho:
        query = query.filter(Project.po_ho == po_ho)
    if industry:
        query = query.filter(Project.industry == industry)
    if track:
        query = query.filter(Project.track == track)
    if predict_month:
        query = query.filter(Project.predict_month == predict_month)
    if owner:
        query = query.filter(Project.owner == owner)
    if keyword:
        like = f"%{keyword}%"
        query = query.filter(or_(
            Project.opportunity_name.like(like),
            Project.customer.like(like),
            Project.project_no.like(like),
        ))

    total = query.count()

    # 排序
    sort_field = getattr(Project, sort_by, Project.scale_amount)
    if sort_desc:
        sort_field = sort_field.desc()
    query = query.order_by(sort_field)

    # 分页
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()

    return ProjectListResponse(
        items=[ProjectItem(**p.to_dict()) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


# ============================================
# 项目导出 CSV
# ============================================
@router.get("/api/projects/export")
def api_export(
    confidence: Optional[str] = Query(None),
    partner: Optional[str] = Query(None),
    po_ho: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """导出筛选结果为 CSV"""
    query = db.query(Project)
    if confidence:
        query = query.filter(Project.confidence == confidence)
    if partner:
        query = query.filter(Project.partner == partner)
    if po_ho:
        query = query.filter(Project.po_ho == po_ho)
    if industry:
        query = query.filter(Project.industry == industry)

    items = query.order_by(Project.scale_amount.desc()).all()

    # 生成 CSV
    output = io.StringIO()
    # 写入 BOM,让 Excel 正确识别中文
    output.write("\ufeff")
    writer = csv.writer(output)

    headers = [
        "项目编号", "机会点名称", "客户", "负责人", "伙伴",
        "行业", "赛道", "部署方式", "把握度", "项目阶段",
        "PO/HO", "预测下单月份",
        "软件预算(万)", "云资源(万)", "总规模(万)",
        "项目进展", "风险",
    ]
    writer.writerow(headers)

    for p in items:
        writer.writerow([
            p.project_no, p.opportunity_name, p.customer, p.owner, p.partner,
            p.industry, p.track, p.deployment_mode, p.confidence, p.stage,
            p.po_ho, p.predict_month,
            p.software_budget, p.cloud_budget, p.scale_amount,
            p.progress_note, p.risk_note,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=projects_export.csv"},
    )


# ============================================
# 导入 - Excel 上传
# ============================================
@router.post("/api/import", response_model=ImportResponse)
async def api_import(
    file: UploadFile = File(...),
    operator: str = Query("user"),
    db: Session = Depends(get_db),
):
    """Excel 上传导入"""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx / .xls 文件")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="文件为空")

    try:
        batch = import_to_db(
            db, content, file.filename,
            operator=operator, replace=True,
        )
        inserted = batch.row_count
        skipped = batch.skipped_count
        return ImportResponse(
            success=True,
            batch_id=batch.batch_id,
            inserted=inserted,
            updated=0,  # 覆盖模式
            skipped=skipped,
            row_count=inserted,        # 兼容旧字段名
            skipped_count=skipped,     # 兼容旧字段名
            errors=batch.note.split(' | ') if batch.note else [],
            message=f"成功导入 {inserted} 条，跳过 {skipped} 条",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败：{e}")


# ============================================
# 演示数据生成
# ============================================
@router.post("/api/seed")
def api_seed(
    count: int = Query(200, ge=10, le=2000),
    db: Session = Depends(get_db),
):
    """生成演示数据 - 用于初始化或重置"""
    batch_id = generate_demo_data(db, count=count, operator="demo")
    return {"success": True, "batch_id": batch_id, "count": count, "message": f"已生成 {count} 条演示数据"}


# ============================================
# 批次历史
# ============================================
@router.get("/api/batches")
def api_batches(db: Session = Depends(get_db)):
    """导入批次列表"""
    batches = db.query(ImportBatch).order_by(ImportBatch.imported_at.desc()).limit(20).all()
    return {"items": [b.to_dict() for b in batches]}


# ============================================
# 配置热更新
# ============================================
@router.post("/api/config/reload")
def api_reload_config():
    """重新加载字段映射配置(YAML 修改后调用)"""
    mapping = reload_field_mapping()
    return {"success": True, "fields": list(mapping.get("fields", {}).keys())}


# ============================================
# 筛选选项字典
# ============================================
@router.get("/api/options")
def api_options(db: Session = Depends(get_db)):
    """下拉筛选的所有可选值"""
    def distinct_values(field):
        rows = db.query(field).filter(field.isnot(None), field != "").distinct().all()
        return sorted([r[0] for r in rows])

    return {
        "confidence": distinct_values(Project.confidence),
        "partner": distinct_values(Project.partner),
        "po_ho": distinct_values(Project.po_ho),
        "industry": distinct_values(Project.industry),
        "track": distinct_values(Project.track),
        "deployment_mode": distinct_values(Project.deployment_mode),
        "stage": distinct_values(Project.stage),
        "owner": distinct_values(Project.owner),
        "predict_month": sorted(distinct_values(Project.predict_month)),
    }

# ============================================
# 云端同步 - 手动/自动同步 Excel
# ============================================
from .cloud_sync import SyncService
from pydantic import BaseModel


class SyncConfigPayload(BaseModel):
    url: str
    time: str
    enabled: bool
    token: str = ""
    headers: dict = {}
    # 中转页模式
    transit_enabled: bool = False
    transit_url: str = ""
    transit_strategy: str = "auto"
    transit_selector: str = ""
    transit_cookie: str = ""


@router.get("/api/sync/status")
def api_sync_status():
    """获取云端同步状态(上次同步时间/结果/下次时间)"""
    return SyncService.instance().get_status()


@router.post("/api/sync/trigger")
def api_sync_trigger(force: bool = Query(False, description="强制下载,忽略 ETag 缓存")):
    """手动触发立即同步
    - force=False: 增量(ETag 没变就跳过)
    - force=True: 强制(忽略缓存,重新下载)
    """
    result = SyncService.instance().sync_now(force=force)
    return result


@router.get("/api/sync/config")
def api_sync_get_config():
    """获取当前同步配置"""
    return SyncService.instance().get_status()["config"]


@router.put("/api/sync/config")
def api_sync_update_config(payload: SyncConfigPayload):
    """更新同步配置(云端地址 + 时间 + 启用)"""
    return SyncService.instance().update_config(
        url=payload.url,
        time=payload.time,
        enabled=payload.enabled,
        token=payload.token,
        headers=payload.headers,
        transit_enabled=payload.transit_enabled,
        transit_url=payload.transit_url,
        transit_strategy=payload.transit_strategy,
        transit_selector=payload.transit_selector,
        transit_cookie=payload.transit_cookie,
    )


@router.post("/api/sync/test")
def api_sync_test(payload: SyncConfigPayload | None = None):
    """测试连接(不实际入库)"""
    svc = SyncService.instance()
    # 中转页模式 - 走 Playwright 测试
    if payload and payload.transit_enabled and payload.transit_url:
        try:
            from .cloud_sync import TransitDownloader
            downloader = TransitDownloader(timeout=30)
            data = downloader.download(
                page_url=payload.transit_url,
                strategy=payload.transit_strategy or "auto",
                selector=payload.transit_selector or "",
                cookie_str=payload.transit_cookie or "",
            )
            size = len(data)
            is_xlsx = (size >= 4 and data[:2] == b'PK') or b'spreadsheetml' in data[:200].lower()
            return {
                "success": True,
                "message": f"中转页下载成功,返回 {size} 字节" + (" · 识别为 Excel" if is_xlsx else " · ⚠️ 可能是非 Excel 格式"),
                "size": size,
                "is_xlsx": is_xlsx,
            }
        except Exception as e:
            return {"success": False, "message": f"中转页测试失败: {type(e).__name__}: {str(e)[:200]}"}
    # 直连模式
    return svc.test_connection(
        url=(payload.url if payload else None) or None,
        token=(payload.token if payload else None) or None,
        headers=(payload.headers if payload else None) or None,
    )


@router.post("/api/sync/inspect")
def api_sync_inspect(payload: SyncConfigPayload | None = None):
    """诊断·下载文件并返回实际列名与示例行(不实际入库)"""
    svc = SyncService.instance()
    is_transit = payload and payload.transit_enabled and payload.transit_url
    try:
        if is_transit:
            from .cloud_sync import TransitDownloader
            downloader = TransitDownloader(timeout=30)
            data = downloader.download(
                page_url=payload.transit_url,
                strategy=payload.transit_strategy or "auto",
                selector=payload.transit_selector or "",
                cookie_str=payload.transit_cookie or "",
            )
        else:
            url = (payload.url if payload else None) or svc.status.to_dict()["config"].get("url")
            if not url:
                return {"success": False, "message": "未提供 URL"}
            data = svc._http_get(url, {}).content
        # 解析列名
        import openpyxl
        from io import BytesIO
        try:
            wb = openpyxl.load_workbook(BytesIO(data), data_only=True, read_only=True)
        except Exception as e:
            return {"success": False, "message": f"不是有效 Excel: {e}", "size": len(data)}
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return {"success": False, "message": "Excel 为空", "size": len(data)}
        headers = [str(c).strip() if c is not None else "" for c in rows[0]]
        sample_row = list(rows[1]) if len(rows) > 1 else []
        # 与 field_mapping 比对
        import yaml
        from pathlib import Path
        mapping_path = Path(__file__).resolve().parent.parent / "field_mapping.yaml"
        with open(mapping_path, encoding="utf-8") as f:
            mapping = yaml.safe_load(f)
        expected = {cfg["excel"]: key for key, cfg in mapping["fields"].items() if cfg.get("excel")}
        matched = []
        unmatched = []
        for h in headers:
            if h in expected:
                matched.append(f"{h} → {expected[h]}")
            else:
                unmatched.append(h)
        return {
            "success": True,
            "size": len(data),
            "total_rows": len(rows) - 1,
            "excel_columns": headers,
            "matched_columns": matched,
            "unmatched_columns": unmatched,
            "sample_row": [str(v)[:50] if v is not None else None for v in sample_row],
            "hint": f"匹配 {len(matched)} 个字段。未匹配 {len(unmatched)} 列 (如需可加到 field_mapping.yaml)"
                  if unmatched else f"✅ 所有列都匹配上 field_mapping.yaml",
        }
    except Exception as e:
        return {"success": False, "message": f"诊断失败: {type(e).__name__}: {str(e)[:200]}"}


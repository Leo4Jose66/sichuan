# -*- coding: utf-8 -*-
"""
分析服务 - 维度聚合、KPI 计算
"""
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from .models import Project
from .schemas import BucketItem, DimSummary, KPISummary


# 维度字段映射
DIM_FIELDS = {
    "confidence": Project.confidence,
    "partner": Project.partner,
    "po_ho": Project.po_ho,
    "industry": Project.industry,
    "track": Project.track,
    "deployment_mode": Project.deployment_mode,
    "stage": Project.stage,
}

# 把握度顺序(展示用)
CONFIDENCE_ORDER = ["已下单", "保底", "机会", "风险", "关闭"]
PO_HO_ORDER = ["PO", "HO"]


def aggregate_by_dimension(
    db: Session,
    dim: str,
    top_n: Optional[int] = None,
) -> DimSummary:
    """
    按维度聚合统计
    返回 [{key, count, amount}, ...] + 总计
    """
    field = DIM_FIELDS.get(dim)
    if field is None:
        raise ValueError(f"不支持的维度: {dim}")

    # 排除空值 + 按维度分组聚合
    query = (
        db.query(
            field.label("key"),
            func.count(Project.id).label("count"),
            func.coalesce(func.sum(Project.scale_amount), 0).label("amount"),
        )
        .filter(field.isnot(None))
        .filter(field != "")
        .group_by(field)
    )

    rows = query.all()

    buckets = []
    for row in rows:
        amount = float(row.amount or 0)
        count = int(row.count or 0)
        avg = round(amount / count, 2) if count > 0 else 0
        buckets.append(BucketItem(
            key=row.key,
            label=row.key,
            count=count,
            amount=round(amount, 2),
            avg_amount=avg,
        ))

    # 排序:把握度用业务顺序,其他按金额倒序
    if dim == "confidence":
        order_map = {k: i for i, k in enumerate(CONFIDENCE_ORDER)}
        buckets.sort(key=lambda b: order_map.get(b.key, 999))
    elif dim == "po_ho":
        order_map = {k: i for i, k in enumerate(PO_HO_ORDER)}
        buckets.sort(key=lambda b: order_map.get(b.key, 999))
    else:
        buckets.sort(key=lambda b: b.amount, reverse=True)

    if top_n:
        buckets = buckets[:top_n]

    total_count = sum(b.count for b in buckets)
    total_amount = round(sum(b.amount for b in buckets), 2)

    return DimSummary(
        buckets=buckets,
        total_count=total_count,
        total_amount=total_amount,
    )


def aggregate_by_time(
    db: Session,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> DimSummary:
    """按时间(预测下单月份)聚合"""
    query = (
        db.query(
            Project.predict_month.label("key"),
            func.count(Project.id).label("count"),
            func.coalesce(func.sum(Project.scale_amount), 0).label("amount"),
        )
        .filter(Project.predict_month.isnot(None))
        .filter(Project.predict_month != "")
    )

    if start:
        query = query.filter(Project.predict_month >= start)
    if end:
        query = query.filter(Project.predict_month <= end)

    query = query.group_by(Project.predict_month).order_by(Project.predict_month)

    rows = query.all()

    buckets = []
    for row in rows:
        amount = float(row.amount or 0)
        count = int(row.count or 0)
        avg = round(amount / count, 2) if count > 0 else 0
        buckets.append(BucketItem(
            key=row.key,
            label=row.key,
            count=count,
            amount=round(amount, 2),
            avg_amount=avg,
        ))

    total_count = sum(b.count for b in buckets)
    total_amount = round(sum(b.amount for b in buckets), 2)

    return DimSummary(
        buckets=buckets,
        total_count=total_count,
        total_amount=total_amount,
    )


def get_kpi_summary(db: Session) -> KPISummary:
    """顶部 KPI 卡数据"""
    # 按把握度聚合
    rows = (
        db.query(
            Project.confidence,
            func.count(Project.id).label("count"),
            func.coalesce(func.sum(Project.scale_amount), 0).label("amount"),
        )
        .filter(Project.confidence.isnot(None))
        .group_by(Project.confidence)
        .all()
    )

    stats = {row.confidence: (int(row.count), float(row.amount or 0)) for row in rows}

    signed = stats.get("已下单", (0, 0))
    guaranteed = stats.get("保底", (0, 0))
    opportunity = stats.get("机会", (0, 0))
    at_risk = stats.get("风险", (0, 0))
    closed = stats.get("关闭", (0, 0))

    total_count = sum(v[0] for v in stats.values())
    total_amount = round(sum(v[1] for v in stats.values()), 2)

    # 赢率 = 已下单 / (总 - 关闭)
    non_closed = total_count - closed[0]
    win_rate = round(signed[0] / non_closed * 100, 2) if non_closed > 0 else 0

    # 平均单笔 = 总规模 / 总项目数
    avg_deal = round(total_amount / total_count, 2) if total_count > 0 else 0

    # 漏斗价值
    pipeline = round(signed[1] + guaranteed[1] + opportunity[1], 2)

    return KPISummary(
        total_projects=total_count,
        signed_projects=signed[0],
        guaranteed_projects=guaranteed[0],
        opportunity_projects=opportunity[0],
        at_risk_projects=at_risk[0],
        closed_projects=closed[0],
        total_amount=total_amount,
        signed_amount=round(signed[1], 2),
        guaranteed_amount=round(guaranteed[1], 2),
        opportunity_amount=round(opportunity[1], 2),
        risk_amount=round(at_risk[1], 2),
        win_rate=win_rate,
        avg_deal_size=avg_deal,
        pipeline_value=pipeline,
    )
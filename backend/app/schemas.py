# -*- coding: utf-8 -*-
"""
Pydantic 数据模式 - API 入参出参
"""
from pydantic import BaseModel, Field
from typing import Optional


class BucketItem(BaseModel):
    """维度分桶统计项"""
    key: str = Field(..., description="维度值")
    label: Optional[str] = Field(None, description="维度显示名")
    count: int = Field(..., description="项目数量")
    amount: float = Field(..., description="项目总规模(万)")
    avg_amount: float = Field(0, description="平均规模(万)")


class DimSummary(BaseModel):
    """维度汇总"""
    buckets: list[BucketItem]
    total_count: int
    total_amount: float


class KPISummary(BaseModel):
    """KPI 汇总"""
    total_projects: int
    signed_projects: int
    guaranteed_projects: int  # 保底
    opportunity_projects: int
    at_risk_projects: int
    closed_projects: int

    total_amount: float
    signed_amount: float
    guaranteed_amount: float
    opportunity_amount: float
    risk_amount: float

    # 衍生指标
    win_rate: float = Field(..., description="赢率(已下单/总非关闭)")
    avg_deal_size: float = Field(..., description="平均单笔规模")
    pipeline_value: float = Field(..., description="漏斗价值(保底+机会+已下单)")


class ProjectItem(BaseModel):
    """项目明细项"""
    id: int
    project_no: str
    owner: Optional[str] = None
    opportunity_name: Optional[str] = None
    customer: Optional[str] = None
    partner: Optional[str] = None
    industry: Optional[str] = None
    track: Optional[str] = None
    deployment_mode: Optional[str] = None
    confidence: Optional[str] = None
    stage: Optional[str] = None
    po_ho: Optional[str] = None
    predict_month: Optional[str] = None
    software_budget: float = 0
    cloud_budget: float = 0
    scale_amount: float = 0
    progress_note: Optional[str] = None
    risk_note: Optional[str] = None


class ProjectListResponse(BaseModel):
    """项目列表响应"""
    items: list[ProjectItem]
    total: int
    page: int
    page_size: int


class ImportResponse(BaseModel):
    """导入响应"""
    success: bool
    batch_id: str
    inserted: int = 0            # 新增/导入行数
    updated: int = 0             # 更新行数(覆盖模式始终为 0)
    skipped: int = 0             # 跳过/错误行数
    row_count: int = 0           # @deprecated 用 inserted 代替
    skipped_count: int = 0       # @deprecated 用 skipped 代替
    errors: list[str] = []       # 详细错误信息
    message: str
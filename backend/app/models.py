# -*- coding: utf-8 -*-
"""
SQLAlchemy 数据模型
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, Index
from sqlalchemy.sql import func
from .database import Base


class Project(Base):
    """项目主表"""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # === 基础信息 ===
    project_no = Column(String(64), index=True, comment="项目编号")
    owner = Column(String(64), index=True, comment="负责人")

    # === 金额(万元) ===
    software_budget = Column(Float, default=0.0, comment="软件预算(万)")
    cloud_budget = Column(Float, default=0.0, comment="云资源预算(万)")
    scale_amount = Column(Float, default=0.0, index=True, comment="项目总规模(万)")

    # === 项目信息 ===
    handoff_person = Column(String(64), comment="交接人")
    opportunity_name = Column(String(255), comment="机会点名称")
    deployment_mode = Column(String(64), index=True, comment="部署方式")
    track = Column(String(64), index=True, comment="赛道")
    customer = Column(String(255), comment="客户名称")

    # === 时间 ===
    predict_month = Column(String(7), index=True, comment="预测下单月份(YYYY-MM)")

    # === 状态 ===
    confidence = Column(String(32), index=True, comment="把握度")
    stage = Column(String(16), index=True, comment="项目阶段")
    progress_note = Column(Text, comment="项目进展")

    # === 分类标记 ===
    in_eco_map = Column(String(8), comment="是否生态地图方案")
    po_ho = Column(String(8), index=True, comment="PO/HO")
    pce_entered = Column(String(32), comment="PCE录入")
    pce_reason = Column(Text, comment="未录入原因")

    # === 系统字段 ===
    opp_id = Column(String(64), comment="机会点ID")
    opp_status = Column(String(64), comment="机会点状态")

    # === 业务分类 ===
    industry = Column(String(64), index=True, comment="行业")
    scenario = Column(String(128), comment="场景")
    partner = Column(String(128), index=True, comment="伙伴名称")
    partner_category = Column(String(128), comment="伙伴类型")
    standard_solution = Column(String(255), comment="标准方案名称")
    risk_note = Column(Text, comment="风险及求助")

    # === 派生标记 ===
    is_signed = Column(Boolean, default=False, index=True, comment="是否已签单")
    is_at_risk = Column(Boolean, default=False, index=True, comment="是否风险项目")

    # === 元数据 ===
    imported_at = Column(DateTime, server_default=func.now(), comment="导入时间")
    batch_id = Column(String(64), index=True, comment="导入批次ID")

    # === 复合索引 - 加速常见统计查询 ===
    __table_args__ = (
        Index("idx_confidence_predict_month", "confidence", "predict_month"),
        Index("idx_partner_confidence", "partner", "confidence"),
        Index("idx_po_ho_confidence", "po_ho", "confidence"),
    )

    def to_dict(self):
        """转字典 - 给 API 返回"""
        return {
            "id": self.id,
            "project_no": self.project_no,
            "owner": self.owner,
            "software_budget": self.software_budget or 0,
            "cloud_budget": self.cloud_budget or 0,
            "scale_amount": self.scale_amount or 0,
            "handoff_person": self.handoff_person,
            "opportunity_name": self.opportunity_name,
            "deployment_mode": self.deployment_mode,
            "track": self.track,
            "customer": self.customer,
            "predict_month": self.predict_month,
            "confidence": self.confidence,
            "stage": self.stage,
            "progress_note": self.progress_note,
            "in_eco_map": self.in_eco_map,
            "po_ho": self.po_ho,
            "pce_entered": self.pce_entered,
            "pce_reason": self.pce_reason,
            "opp_id": self.opp_id,
            "opp_status": self.opp_status,
            "industry": self.industry,
            "scenario": self.scenario,
            "partner": self.partner,
            "partner_category": self.partner_category,
            "standard_solution": self.standard_solution,
            "risk_note": self.risk_note,
            "is_signed": self.is_signed,
            "is_at_risk": self.is_at_risk,
            "imported_at": self.imported_at.isoformat() if self.imported_at else None,
            "batch_id": self.batch_id,
        }


class ImportBatch(Base):
    """导入批次表 - 支持历史回溯与多版本对比"""
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(String(64), unique=True, index=True, comment="批次UUID")
    filename = Column(String(255), comment="原始文件名")
    row_count = Column(Integer, comment="导入行数")
    skipped_count = Column(Integer, default=0, comment="跳过行数")
    operator = Column(String(64), comment="操作人")
    imported_at = Column(DateTime, server_default=func.now(), comment="导入时间")
    note = Column(Text, comment="备注")

    def to_dict(self):
        return {
            "id": self.id,
            "batch_id": self.batch_id,
            "filename": self.filename,
            "inserted": self.row_count,           # 别名·供前端用
            "skipped": self.skipped_count,        # 别名·供前端用
            "row_count": self.row_count,          # 原始字段
            "skipped_count": self.skipped_count,  # 原始字段
            "operator": self.operator,
            "created_at": self.imported_at.isoformat() if self.imported_at else None,  # 别名·供前端用
            "imported_at": self.imported_at.isoformat() if self.imported_at else None,  # 原始字段
            "note": self.note,
        }
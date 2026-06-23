# -*- coding: utf-8 -*-
"""
演示数据生成器 - 用于工具上线初期的体验数据
后续接入真实 Excel 后,可以通过 POST /api/import 覆盖
"""
import random
import uuid
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from faker import Faker

from .models import Project, ImportBatch


# 业务侧真实术语 - 让演示数据"长得像真的"
OWNERS = ["张磊", "李娜", "王强", "陈静", "刘洋", "赵敏", "孙浩", "周婷", "吴军", "郑爽"]
CUSTOMERS = [
    "一汽集团", "比亚迪", "海尔智家", "美的集团", "永辉超市", "京东物流",
    "招商银行", "中信证券", "中国人寿", "国家电网", "中石油", "中国移动",
    "三一重工", "徐工集团", "中联重科", "广联达", "用友网络", "金蝶国际",
    "石药集团", "恒瑞医药", "君实生物", "微医集团", "平安好医生", "阿里健康",
    "字节跳动", "美团", "小红书", "B站", "知乎", "网易",
    "上海市政府", "杭州市政府", "深圳市政府", "成都市政府", "武汉市政府",
]
TRACKS = ["工业互联网", "智慧政务", "金融科技", "智慧医疗", "智慧零售", "智慧教育", "智慧能源", "智慧交通"]
INDUSTRIES = ["制造", "零售", "政府", "医药", "金融", "教育", "能源", "交通", "互联网"]
DEPLOYMENT_MODES = ["独立部署", "SAAS", "政务云", "混合云", "专有云"]
CONFIDENCE_LEVELS = ["已下单", "保底", "机会", "风险", "关闭"]
STAGES = [f"SS{i}" for i in range(1, 9)]
PO_HO = ["PO", "HO"]
SCENARIOS = ["AI应用", "企业管控", "智能客服", "数据治理", "智能制造", "智慧办公", "安全合规"]
PARTNERS = [
    "中软国际", "软通动力", "神州数码", "东软集团", "太极股份", "中国系统",
    "亚信安全", "东方国信", "拓尔思", "美亚柏科", "华宇软件", "久其软件",
    "致远互联", "蓝凌软件", "泛微网络", "新华三", "浪潮信息", "中科曙光",
    "用友网络", "金蝶国际",
]
INDUSTRY_PREFIX = {
    "制造": ["智能工厂", "MES", "供应链", "设备联网", "能耗优化"],
    "零售": ["会员体系", "全渠道", "智慧门店", "营销自动化"],
    "政府": ["一网通办", "政务大数据", "智慧城市", "应急指挥"],
    "医药": ["药物研发", "临床数据", "合规追溯", "AI影像"],
    "金融": ["风控", "反欺诈", "智能投顾", "开放银行"],
    "教育": ["智慧课堂", "教学评测", "校园云", "在线教育"],
    "能源": ["智能电网", "油气AI", "能耗优化", "新能源运维"],
    "交通": ["车路协同", "智慧高速", "物流调度", "港口数字化"],
    "互联网": ["推荐系统", "内容审核", "用户增长", "AIGC应用"],
}
IN_ECO_MAP = ["是", "否", "是", "否", "否", "是", "否"]  # 偏向"否",符合实际分布
PCE_STATUS = ["已录入", "已录入", "已录入", "未录入", "未录入", "录入中"]
PCE_REASONS = ["", "", "", "等待客户合同", "资料不全", "审批中", "项目暂停"]
OPP_STATUS = ["更新进展", "签单完成", "更新进展", "更新进展", "取消", "更新进展"]
INDUSTRY_AMOUNT_RANGE = {
    # 不同行业的典型项目金额区间(万元) - 头部高、尾部低
    "金融": (200, 3000),
    "政府": (300, 2500),
    "能源": (200, 2000),
    "制造": (100, 1500),
    "医药": (100, 1200),
    "教育": (50, 800),
    "交通": (150, 1800),
    "零售": (50, 1000),
    "互联网": (30, 600),
}
CONFIDENCE_AMOUNT_BIAS = {
    "已下单": 1.0,   # 全额计入
    "保底": 0.85,    # 概率计入
    "机会": 0.55,    # 打折扣
    "风险": 0.25,    # 风险项目谨慎计入
    "关闭": 0.0,     # 不计入
}


def generate_demo_data(db: Session, count: int = 200, operator: str = "system") -> str:
    """
    生成演示数据并入库
    返回 batch_id
    """
    fake = Faker("zh_CN")
    batch_id = f"demo-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"

    # 1. 创建批次记录
    batch = ImportBatch(
        batch_id=batch_id,
        filename=f"demo_data_{count}rows.xlsx",
        row_count=0,
        skipped_count=0,
        operator=operator,
        note=f"演示数据 - {count} 条,生成于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
    )
    db.add(batch)
    db.commit()

    # 2. 清空旧的项目数据(演示用)
    db.query(Project).delete()
    db.commit()

    # 3. 时间范围:本月到未来6个月,加上历史3个月
    today = datetime.now().replace(day=1)
    months_range = []
    for offset in range(-3, 7):
        m = today + timedelta(days=offset * 30)
        months_range.append(m.strftime("%Y-%m"))

    projects = []
    for i in range(count):
        industry = random.choice(INDUSTRIES)
        # 金额按行业区间 + 长尾分布(头部 20% 项目占 60% 金额)
        amt_min, amt_max = INDUSTRY_AMOUNT_RANGE[industry]
        if random.random() < 0.2:
            # 头部大单
            total = random.uniform(amt_max * 0.6, amt_max)
        elif random.random() < 0.5:
            # 中等
            total = random.uniform(amt_min + (amt_max - amt_min) * 0.3, amt_max * 0.6)
        else:
            # 尾部小单
            total = random.uniform(amt_min, amt_min + (amt_max - amt_min) * 0.3)

        # 软件:云 ≈ 6:4 - 7:3
        cloud_ratio = random.uniform(0.3, 0.45)
        cloud_budget = round(total * cloud_ratio, 2)
        software_budget = round(total - cloud_budget, 2)

        # 把握度分布 - 已下单 25% / 保底 20% / 机会 30% / 风险 15% / 关闭 10%
        conf_dist = ["已下单"] * 25 + ["保底"] * 20 + ["机会"] * 30 + ["风险"] * 15 + ["关闭"] * 10
        confidence = random.choice(conf_dist)

        track = random.choice(TRACKS)
        scenario_prefix = random.choice(INDUSTRY_PREFIX[industry])
        scenario = f"{scenario_prefix} - {random.choice(SCENARIOS)}"

        # 把握度对应的机会点状态
        if confidence == "已下单":
            opp_status = "签单完成"
        elif confidence == "关闭":
            opp_status = random.choice(["取消", "关闭"])
        else:
            opp_status = "更新进展"

        # 时间分布 - 已下单大多在过去/本月,保底/机会在未来1-3月
        if confidence == "已下单":
            month = random.choice([m for m in months_range if m <= today.strftime("%Y-%m")])
        elif confidence == "保底":
            month = random.choice([m for m in months_range if m >= today.strftime("%Y-%m")][:4])
        elif confidence == "机会":
            month = random.choice(months_range[1:6])
        elif confidence == "风险":
            month = random.choice(months_range[2:7])
        else:  # 关闭
            month = random.choice(months_range[:3])

        # 进展备注
        if confidence == "已下单":
            progress = random.choice([
                "已完成交付,等待验收", "合同已签,实施中", "客户已付款,进入运维期",
                "项目已上线,运行稳定", "已交付培训,等待终验",
            ])
        elif confidence == "保底":
            progress = random.choice([
                "技术方案确认,商务谈判中", "POC 测试通过,准备签约",
                "预算已批,走流程中", "客户内部立项通过,等合同",
            ])
        elif confidence == "机会":
            progress = random.choice([
                "客户初步接洽,需求待明确", "POC 进行中",
                "方案已提,等待反馈", "商务沟通中,价格待定",
            ])
        elif confidence == "风险":
            progress = random.choice([
                "客户预算缩减,项目暂停", "竞品价格优势,胜算不明",
                "需求变更中,方案调整", "决策人变动,需重新建立关系",
            ])
        else:
            progress = random.choice([
                "客户已选其他厂商", "需求不明确,搁置", "预算取消",
            ])

        # 风险备注
        risk_note = ""
        if confidence == "风险":
            risk_note = random.choice([
                "客户预算可能砍半", "竞品关系更深", "技术方案匹配度待提升",
                "需要高层支持", "决策周期可能延长",
            ])
        elif random.random() < 0.1:
            risk_note = "需协调总部资源支持"

        project = Project(
            project_no=f"PRJ-{2026}-{i+1:04d}",
            owner=random.choice(OWNERS),
            software_budget=software_budget,
            cloud_budget=cloud_budget,
            scale_amount=software_budget + cloud_budget,
            handoff_person=random.choice(OWNERS),
            opportunity_name=f"{industry}-{scenario_prefix}项目-{fake.word()}",
            deployment_mode=random.choice(DEPLOYMENT_MODES),
            track=track,
            customer=random.choice(CUSTOMERS),
            predict_month=month,
            confidence=confidence,
            stage=random.choice(STAGES),
            progress_note=progress,
            in_eco_map=random.choice(IN_ECO_MAP),
            po_ho=random.choice(PO_HO),
            pce_entered=random.choice(PCE_STATUS),
            pce_reason="" if random.random() < 0.5 else random.choice(PCE_REASONS),
            opp_id=f"OPP{uuid.uuid4().hex[:10].upper()}",
            opp_status=opp_status,
            industry=industry,
            scenario=scenario,
            partner=random.choice(PARTNERS),
            standard_solution=f"华为云{track}-{scenario_prefix}标准方案",
            risk_note=risk_note,
            is_signed=(confidence == "已下单"),
            is_at_risk=(confidence == "风险"),
            batch_id=batch_id,
        )
        projects.append(project)

    db.bulk_save_objects(projects)
    batch.row_count = len(projects)
    db.commit()

    return batch_id


def get_aggregate_summary(db: Session):
    """快速预览 - 用于演示模式"""
    total = db.query(Project).count()
    signed = db.query(Project).filter(Project.is_signed == True).count()
    at_risk = db.query(Project).filter(Project.is_at_risk == True).count()

    from sqlalchemy import func
    total_amount = db.query(func.sum(Project.scale_amount)).scalar() or 0
    signed_amount = db.query(func.sum(Project.scale_amount)).filter(Project.is_signed == True).scalar() or 0
    risk_amount = db.query(func.sum(Project.scale_amount)).filter(Project.is_at_risk == True).scalar() or 0

    return {
        "total_projects": total,
        "signed_projects": signed,
        "at_risk_projects": at_risk,
        "total_amount": round(total_amount, 2),
        "signed_amount": round(signed_amount, 2),
        "risk_amount": round(risk_amount, 2),
    }
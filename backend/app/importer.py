# -*- coding: utf-8 -*-
"""
Excel 导入服务 - 把业务侧 Excel 解析入库
支持字段映射配置,业务改 Excel 字段名时改 YAML 即可
"""
import uuid
import io
from datetime import datetime
from typing import Optional
from pathlib import Path

import yaml
import openpyxl
from sqlalchemy.orm import Session

from .models import Project, ImportBatch
from .config import settings


# 加载字段映射配置(模块级别缓存)
_FIELD_MAPPING_CACHE: Optional[dict] = None


def load_field_mapping() -> dict:
    """加载字段映射配置"""
    global _FIELD_MAPPING_CACHE
    if _FIELD_MAPPING_CACHE is None:
        with open(settings.field_mapping_path, "r", encoding="utf-8") as f:
            _FIELD_MAPPING_CACHE = yaml.safe_load(f)
    return _FIELD_MAPPING_CACHE


def reload_field_mapping() -> dict:
    """强制重新加载(配置变更后调用)"""
    global _FIELD_MAPPING_CACHE
    _FIELD_MAPPING_CACHE = None
    return load_field_mapping()


def parse_excel(file_bytes: bytes) -> tuple[list[dict], list[str]]:
    """
    解析 Excel - 返回 (行数据列表, 错误信息列表)
    行数据格式: {field_key: value, ...}
    """
    mapping = load_field_mapping()
    fields_config = mapping.get("fields", {})

    # 反向索引:Excel 列名 -> 字段 key
    excel_to_field = {}
    for field_key, cfg in fields_config.items():
        excel_col = cfg.get("excel")
        if excel_col:
            excel_to_field[excel_col.strip()] = field_key

    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
    except Exception as e:
        return [], [f"Excel 解析失败: {e}"]

    ws = wb.active

    # 读取表头(第一行)
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], ["Excel 文件为空"]

    header_row = [str(c).strip() if c is not None else "" for c in rows[0]]
    print(f"[DEBUG] 表头: {header_row[:10]}...")
    print(f"[DEBUG] 映射表: {list(excel_to_field.keys())[:10]}...")

    # 找到 Excel 列对应的字段索引
    col_index_map = {}  # field_key -> col_index
    for col_idx, header in enumerate(header_row):
        if header in excel_to_field:
            field_key = excel_to_field[header]
            col_index_map[field_key] = col_idx

    if not col_index_map:
        return [], [f"未匹配到任何已知字段。Excel 表头: {header_row[:5]}..."]

    # 解析数据行
    parsed = []
    errors = []

    for row_idx, row in enumerate(rows[1:], start=2):
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue  # 跳过空行

        record = {}
        for field_key, col_idx in col_index_map.items():
            if col_idx < len(row):
                record[field_key] = row[col_idx]

        # 必填校验 - 以机会点名称为主(项目编号只是序号,可空)
        opportunity_name = record.get("opportunity_name")
        if not opportunity_name:
            errors.append(f"第 {row_idx} 行: 机会点名称为空,已跳过")
            continue

        # 伙伴名称允许为空/null/"-"/"/"等,只需入库即可
        # 前端仅在"伙伴贡献 TOP10"图表中过滤显示

        # 金额转换
        for amount_field in ["software_budget", "cloud_budget"]:
            val = record.get(amount_field)
            if val is None or val == "":
                record[amount_field] = 0.0
            else:
                try:
                    record[amount_field] = float(val)
                except (ValueError, TypeError):
                    errors.append(f"第 {row_idx} 行: {amount_field} 无法转换为数字({val})，已设为 0 但仍导入")
                    record[amount_field] = 0.0

        # scale_amount: 优先用 Excel 中的"整体规模",缺则公式兑底
        scale_val = record.get("scale_amount")
        if scale_val is None or scale_val == "":
            record["scale_amount"] = round(
                (record.get("software_budget") or 0) + (record.get("cloud_budget") or 0), 2
            )
        else:
            try:
                record["scale_amount"] = float(scale_val)
            except (ValueError, TypeError):
                record["scale_amount"] = round(
                    (record.get("software_budget") or 0) + (record.get("cloud_budget") or 0), 2
                )

        # 注意:Excel 中的"序号"列只是行号,不是项目编号
        # 原样存进 project_no(仅为参考),但不用于任何唯一性验证
        # 唯一主数据是 opportunity_name(机会点名称)

        # 派生字段
        record["is_signed"] = record.get("confidence") == "已下单"
        record["is_at_risk"] = record.get("confidence") == "风险"

        # 字符串清理
        for k, v in record.items():
            if isinstance(v, str):
                record[k] = v.strip()

        parsed.append(record)

    return parsed, errors


def import_to_db(
    db: Session,
    file_bytes: bytes,
    filename: str,
    operator: str = "user",
    note: str = "",
    replace: bool = True,
) -> ImportBatch:
    """
    解析 Excel 并入库
    - replace=True: 清空旧数据后导入(单批次覆盖)
    - replace=False: 追加模式(保留历史,需指定不同 batch_id)
    """
    parsed, errors = parse_excel(file_bytes)

    # 生成批次
    batch_id = f"imp-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"

    batch = ImportBatch(
        batch_id=batch_id,
        filename=filename,
        row_count=len(parsed),
        skipped_count=len(errors),
        operator=operator,
        note=note + (f" | 解析错误: {'; '.join(errors[:5])}" if errors else ""),
    )
    db.add(batch)

    # 覆盖模式:删除当前所有项目数据
    if replace:
        db.query(Project).delete()

    # 入库
    for record in parsed:
        record["batch_id"] = batch_id
        project = Project(**record)
        db.add(project)

    # 保存原始文件
    upload_path = Path(settings.upload_dir) / f"{batch_id}_{filename}"
    upload_path.write_bytes(file_bytes)

    db.commit()
    return batch
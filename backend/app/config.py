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

    # ============ 云端同步配置 (仅中转页模式) ============
    cloud_sync_enabled: bool = True           # 是否启用定时同步
    cloud_sync_time: str = "08:30"            # 每日自动同步时间 (HH:MM)
    cloud_sync_timeout: int = 60              # Playwright 操作超时(秒)
    cloud_sync_retry: int = 3                 # 失败重试次数
    cloud_sync_browser: str = "auto"          # auto / msedge (用本机 Edge) / chromium
    # 中转页
    cloud_sync_transit_url: str = ""          # 中转页 URL
    cloud_sync_transit_strategy: str = "auto" # auto / text / selector
    cloud_sync_transit_selector: str = ""     # 自定义 CSS 选择器
    cloud_sync_transit_cookie: str = ""       # 预设 Cookie

    # CORS
    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(env_prefix="PP_", env_file=".env")


settings = Settings()

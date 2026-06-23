# -*- coding: utf-8 -*-
"""
FastAPI 主应用
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine, SessionLocal
from .routes import router
from .models import Project
from .seed import generate_demo_data
from .static import mount_static
from .cloud_sync import SyncService


# 初始化数据库
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="项目规模统计分析平台 - 支持多维度分析与下钻",
)


# CORS - 本地开发,放行所有
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 注册路由
app.include_router(router)

# 挂载前端静态文件
mount_static(app)


@app.on_event("startup")
def startup_seed():
    """启动时若无数据,自动生成演示数据 + 启动云同步调度"""
    db = SessionLocal()
    try:
        count = db.query(Project).count()
        if count == 0:
            print(f"[Startup] 数据库为空,自动生成 200 条演示数据...")
            generate_demo_data(db, count=200, operator="auto-startup")
            print(f"[Startup] 演示数据生成完成")
        else:
            print(f"[Startup] 数据库已有 {count} 条项目数据,跳过演示数据生成")
    finally:
        db.close()

    # 启动云端同步后台调度(默认每天 08:30 + 可手动触发)
    sync = SyncService.instance()
    sync.start()
    if settings.cloud_excel_url:
        print(f"[Startup] 云同步已启动: URL={settings.cloud_excel_url}, 时间={settings.cloud_sync_time}")
    else:
        print(f"[Startup] 云同步调度运行中(未配置 URL),可通过 PUT /api/sync/config 配置")


@app.get("/")
def root():
    return {
        "app": settings.app_name,
        "version": "0.1.0",
        "docs": "/docs",
        "endpoints": [
            "/api/kpi",
            "/api/dim/confidence",
            "/api/dim/time",
            "/api/dim/partner",
            "/api/dim/po_ho",
            "/api/projects",
            "/api/import",
            "/api/seed",
            "/api/sync/status",
            "/api/sync/trigger",
            "/api/sync/config",
        ],
    }
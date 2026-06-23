# -*- coding: utf-8 -*-
"""
挂载前端静态文件 - 让 FastAPI 同时服务前后端
"""
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
# Docker 镜像内前端在 static_frontend
if not FRONTEND_DIR.exists():
    FRONTEND_DIR = Path(__file__).resolve().parent.parent / "static_frontend"


def mount_static(app):
    """挂载静态文件"""
    if not FRONTEND_DIR.exists():
        print(f"[WARN] 前端目录不存在: {FRONTEND_DIR}")
        return

    # 挂载根路径(让 vendor/ data/ 都能从根访问)
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIR), html=True),
        name="static",
    )

    print(f"[Mount] 静态文件挂载完成: {FRONTEND_DIR}")
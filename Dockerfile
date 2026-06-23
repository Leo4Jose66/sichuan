# Project Pulse 后端镜像
FROM python:3.11-slim

WORKDIR /app

# 系统依赖(openpyxl 需要)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Python 依赖
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 应用代码
COPY backend/app ./app
COPY backend/field_mapping.yaml .

# 前端文件 - 一并打进镜像,避免多容器部署
COPY frontend ./static_frontend

# 环境变量
ENV PP_DATABASE_URL=sqlite:////app/data/project_pulse.db
ENV PP_UPLOAD_DIR=/app/data/uploads
ENV PYTHONUNBUFFERED=1

# 数据持久化目录
VOLUME ["/app/data"]

EXPOSE 8000

# 启动
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
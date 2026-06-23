#!/bin/bash
# Project Pulse 一键启动脚本(本地开发)

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/backend"

echo "🚀 启动 Project Pulse..."

# 检查 Python 依赖
if ! python -c "import fastapi" 2>/dev/null; then
    echo "📦 安装依赖..."
    pip install -r requirements.txt
fi

# 启动服务
echo "✅ 服务地址: http://localhost:8000"
echo "📖 API 文档: http://localhost:8000/docs"
echo ""
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
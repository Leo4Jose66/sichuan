#!/bin/bash
# Project Pulse · 本地部署一键启动脚本
# 用法: bash start-local.sh  或  ./start-local.sh
# 然后访问 http://localhost:8765

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=${PORT:-8765}
HOST=${HOST:-0.0.0.0}

echo "============================================"
echo "  Project Pulse · 本地部署"
echo "============================================"

# 检查 Python
if ! command -v python3 &> /dev/null; then
  echo "❌ Python3 未安装,请先安装 Python 3.9+"
  exit 1
fi
echo "✅ Python: $(python3 --version)"

# 检查依赖
if ! python3 -c "import fastapi" 2>/dev/null; then
  echo "📦 安装依赖中..."
  pip install -q --break-system-packages -r backend/requirements.txt
fi
echo "✅ 依赖已就绪"

# 检查前端文件
if [ ! -f frontend/index.html ]; then
  echo "❌ frontend/index.html 不存在"
  exit 1
fi
echo "✅ 前端文件: $(ls frontend | wc -l) 个"

# 启动
echo ""
echo "🚀 启动服务: http://$HOST:$PORT"
echo "   浏览器打开: http://localhost:$PORT"
echo "   停止: Ctrl+C"
echo ""
cd "$SCRIPT_DIR/backend"
PYTHONPATH="$SCRIPT_DIR/backend" python3 -m uvicorn app.main:app --host "$HOST" --port "$PORT" --reload

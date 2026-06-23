#!/bin/bash
# =============================================
#  Docker Quick Start - Project Pulse (Mac/Linux)
#  Usage: ./docker_start.sh
# =============================================

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo
echo "============================================="
echo "  Project Pulse - Docker Quick Start"
echo "============================================="
echo

# Check Docker
if ! command -v docker >/dev/null 2>&1; then
    echo "[ERROR] Docker not found. Install:"
    echo "  brew install --cask docker"
    echo "  Then start Docker Desktop from Applications"
    exit 1
fi
echo "[OK] Docker installed"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker is not running. Start Docker Desktop first."
    exit 1
fi
echo "[OK] Docker is running"

# Compose v2 or v1
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    echo "[ERROR] Docker Compose not found."
    exit 1
fi
echo "[OK] Using: $COMPOSE"
echo

menu() {
    echo
    echo "Select action:"
    echo "  1. Start (build + run)"
    echo "  2. Start (rebuild from scratch)"
    echo "  3. Stop"
    echo "  4. View logs"
    echo "  5. Restart"
    echo "  6. Clean (stop + remove container + volume - DELETES DATA!)"
    echo "  7. Open browser"
    echo "  8. Exit"
    echo
    read -p "Choice (1-8): " choice
}

menu
while true; do
    case "$choice" in
        1)
            echo
            echo "[1/2] Building image..."
            $COMPOSE build
            echo
            echo "[2/2] Starting container..."
            $COMPOSE up -d
            echo
            echo "Waiting for healthy..."
            for i in {1..12}; do
                if $COMPOSE ps | grep -q "healthy"; then
                    echo "[OK] Healthy!"
                    break
                fi
                echo "  waiting... ${i}*5s"
                sleep 5
            done
            echo
            echo "============================================="
            echo "  Project Pulse is running!"
            echo "  Open: http://localhost:8765"
            echo "============================================="
            read -p "Open browser now? (y/n): " open
            [ "$open" = "y" ] && open http://localhost:8765
            ;;
        2)
            echo
            echo "Rebuilding from scratch..."
            $COMPOSE down
            $COMPOSE build --no-cache
            $COMPOSE up -d
            echo "Done. Visit http://localhost:8765"
            ;;
        3)
            echo
            echo "Stopping..."
            $COMPOSE down
            echo "Done."
            ;;
        4)
            echo
            echo "Logs (Ctrl+C to exit)..."
            $COMPOSE logs -f
            ;;
        5)
            echo
            echo "Restarting..."
            $COMPOSE restart
            echo "Done."
            ;;
        6)
            echo
            echo "============================================="
            echo "  WARNING: This deletes ALL data!"
            echo "============================================="
            read -p "Type 'DELETE' to confirm: " confirm
            [ "$confirm" = "DELETE" ] || { echo "Cancelled."; menu; continue; }
            $COMPOSE down -v
            docker volume rm project-pulse-data 2>/dev/null || true
            echo "Done."
            ;;
        7)
            open http://localhost:8765
            ;;
        8)
            exit 0
            ;;
    esac
    menu
done

#!/bin/bash
# =============================================
#  Git Push Script - Project Pulse (macOS/Linux)
#  Version: 2026-06-23-3
# =============================================

set -e
SCRIPT_VER="2026-06-23-3"

# Always cd to script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo
echo "============================================="
echo "  Project Pulse - Git Push"
echo "  Script version: $SCRIPT_VER"
echo "============================================="
echo "Working dir: $SCRIPT_DIR"
echo

# ============ Fill in your info here ============
REMOTE_URL="git@github.com:Leo4Jose66/sichuan.git"
BRANCH="main"
COMMIT_MSG="Initial commit: Project Pulse with cloud sync"
# ============ End of config ============

echo "Remote:  $REMOTE_URL"
echo "Branch:  $BRANCH"
echo

# Find git
GIT_CMD=""
for p in /opt/homebrew/bin/git /usr/local/bin/git /usr/bin/git; do
    if [ -x "$p" ]; then
        GIT_CMD="$p"
        break
    fi
done
if [ -z "$GIT_CMD" ]; then
    GIT_CMD="$(command -v git 2>/dev/null || true)"
fi
if [ -z "$GIT_CMD" ]; then
    echo "[ERROR] Git not found. Install with:"
    echo "  brew install git"
    echo "  or: xcode-select --install"
    exit 1
fi
echo "[OK] Using git: $GIT_CMD"
"$GIT_CMD" --version
echo

# Init if needed
if [ ! -d ".git" ]; then
    echo "[INFO] Initializing git repo in: $SCRIPT_DIR"
    [ -f "$SCRIPT_DIR/.gitignore" ] && echo "  [OK] .gitignore found"
    # -c init.templateDir= avoids the macOS permission bug
    "$GIT_CMD" -c init.templateDir= init -b "$BRANCH"
fi

# Set remote
if ! "$GIT_CMD" remote get-url origin >/dev/null 2>&1; then
    echo "[INFO] Adding remote..."
    "$GIT_CMD" remote add origin "$REMOTE_URL"
else
    echo "[INFO] Existing remote:"
    "$GIT_CMD" remote -v
fi

# Add .gitkeep
mkdir -p backend/data/uploads
[ -f backend/data/uploads/.gitkeep ] || touch backend/data/uploads/.gitkeep

echo
echo "[1/4] Adding files..."
"$GIT_CMD" add .gitignore backend frontend *.bat *.ps1 *.sh *.md docker-compose.yml 2>/dev/null || \
"$GIT_CMD" add .gitignore backend frontend *.sh *.md docker-compose.yml

echo
echo "[2/4] Committing..."
"$GIT_CMD" commit -m "$COMMIT_MSG" --allow-empty || echo "[WARN] Nothing to commit"

echo
echo "[3/4] Pulling (if remote has files)..."
"$GIT_CMD" pull --rebase --allow-unrelated-histories origin "$BRANCH" 2>/dev/null || echo "[INFO] No remote yet (first push)"

echo
echo "[4/4] Pushing to $BRANCH..."
"$GIT_CMD" push -u origin "$BRANCH"

echo
echo "============================================="
echo "  Push successful!"
echo "============================================="
echo

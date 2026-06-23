#!/bin/bash
# =============================================
#  One-click update from Mavis's zip (Mac/Linux)
#  Usage: ./update.sh /path/to/project-pulse.zip
# =============================================

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

ZIP_PATH="$1"
if [ -z "$ZIP_PATH" ]; then
    echo "Usage: ./update.sh /path/to/project-pulse.zip"
    echo "  or drag the zip onto update.sh in Finder"
    exit 1
fi

if [ ! -f "$ZIP_PATH" ]; then
    echo "[ERROR] File not found: $ZIP_PATH"
    exit 1
fi

echo
echo "============================================="
echo "  One-click Update"
echo "============================================="
echo "Source: $ZIP_PATH"
echo "Target: $SCRIPT_DIR"
echo

# Find git
GIT_CMD="$(command -v git 2>/dev/null || true)"
[ -z "$GIT_CMD" ] && GIT_CMD="/usr/bin/git"
if ! command -v "$GIT_CMD" >/dev/null 2>&1; then
    echo "[ERROR] Git not found"
    exit 1
fi

# Check git repo
if [ ! -d ".git" ]; then
    echo "[ERROR] Not a git repo. Run git_push.sh first."
    exit 1
fi

# Check for uncommitted changes
if ! "$GIT_CMD" diff --quiet 2>/dev/null; then
    echo "[WARN] You have uncommitted changes (will be preserved)"
fi

# Extract zip to staging
STAGE_DIR=$(mktemp -d)
echo "[1/5] Extracting to $STAGE_DIR..."
unzip -q "$ZIP_PATH" -d "$STAGE_DIR"

# Find actual project dir (might be wrapped in project-pulse/)
SRC_DIR="$STAGE_DIR/project-pulse"
if [ ! -d "$SRC_DIR" ]; then
    SRC_DIR=$(find "$STAGE_DIR" -maxdepth 1 -mindepth 1 -type d | head -1)
fi

echo "[2/5] Copying files..."
# rsync to preserve anything user added
rsync -a --delete \
    --exclude '.git' \
    --exclude 'data/*.db' \
    --exclude 'data/uploads/*' \
    "$SRC_DIR/" "$SCRIPT_DIR/"

# Cleanup
rm -rf "$STAGE_DIR"

echo "[3/5] Git staging..."
"$GIT_CMD" add -A

echo "[4/5] Committing..."
MSG="Update from Mavis - $(date +%Y-%m-%d_%H:%M)"
"$GIT_CMD" commit -m "$MSG" --allow-empty || echo "[WARN] Nothing to commit"

echo "[5/5] Pushing..."
"$GIT_CMD" push origin main

echo
echo "============================================="
echo "  Update complete! Reload browser."
echo "============================================="
echo

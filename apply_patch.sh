#!/bin/bash
# =============================================
#  Apply Patch - smaller updates via unified diff (Mac/Linux)
#  Usage: ./apply_patch.sh update-20260623.patch
# =============================================

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

PATCH_FILE="$1"
if [ -z "$PATCH_FILE" ]; then
    echo "Usage: ./apply_patch.sh /path/to/update.patch"
    exit 1
fi

if [ ! -f "$PATCH_FILE" ]; then
    echo "[ERROR] File not found: $PATCH_FILE"
    exit 1
fi

GIT_CMD="$(command -v git 2>/dev/null || true)"
[ -z "$GIT_CMD" ] && GIT_CMD="/usr/bin/git"

if [ ! -d ".git" ]; then
    echo "[ERROR] Not a git repo. Run git_push.sh first."
    exit 1
fi

echo
echo "============================================="
echo "  Apply Patch"
echo "============================================="
echo "Patch: $PATCH_FILE"
echo

echo "[1/4] Checking if patch applies cleanly..."
"$GIT_CMD" apply --check "$PATCH_FILE" || {
    echo "[ERROR] Patch cannot be applied."
    echo "  Try: $GIT_CMD stash, then apply_patch.sh, then $GIT_CMD stash pop"
    exit 1
}
echo "  [OK]"

echo "[2/4] Applying..."
"$GIT_CMD" apply "$PATCH_FILE"

echo "[3/4] Committing..."
"$GIT_CMD" add -A
"$GIT_CMD" commit -m "Apply patch: $(basename "$PATCH_FILE")" --allow-empty || echo "[WARN] Nothing to commit"

echo "[4/4] Pushing..."
"$GIT_CMD" push origin main

echo
echo "============================================="
echo "  Patch applied and pushed!"
echo "============================================="
echo

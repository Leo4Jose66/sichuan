#!/bin/bash
# =============================================
#  SSH Connection Test - Project Pulse (Mac/Linux)
#  Run this BEFORE pushing to verify SSH key is set up
# =============================================

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo
echo "============================================="
echo "  SSH Connection Test"
echo "============================================="
echo

# Check ssh
if ! command -v ssh >/dev/null 2>&1; then
    echo "[ERROR] SSH not found. Install with: brew install openssh"
    exit 1
fi

echo "[1/3] Checking if SSH key exists..."
if [ -f "$HOME/.ssh/id_ed25519" ]; then
    echo "  [OK] Found: $HOME/.ssh/id_ed25519"
elif [ -f "$HOME/.ssh/id_rsa" ]; then
    echo "  [OK] Found: $HOME/.ssh/id_rsa"
else
    echo "  [WARN] No SSH key found in $HOME/.ssh/"
    echo
    echo "  To generate one:"
    echo "    ssh-keygen -t ed25519 -C \"your_email@example.com\""
    echo
    echo "  Then add the PUBLIC key to GitHub:"
    echo "    cat $HOME/.ssh/id_ed25519.pub"
    echo "    (copy output, paste at https://github.com/settings/keys)"
    echo
    exit 1
fi

echo
echo "[2/3] Public key fingerprint:"
if [ -f "$HOME/.ssh/id_ed25519.pub" ]; then
    cat "$HOME/.ssh/id_ed25519.pub"
elif [ -f "$HOME/.ssh/id_rsa.pub" ]; then
    cat "$HOME/.ssh/id_rsa.pub"
fi

echo
echo "[3/3] Testing GitHub SSH connection..."
echo "  (If it hangs, press Ctrl+C and check your key)"
echo

ssh -T -o StrictHostKeyChecking=accept-new git@github.com 2>&1 || true

echo
echo "============================================="
echo "  If you see 'Hi Leo4Jose66!' or similar,"
echo "  your SSH key is correctly set up!"
echo "============================================="
echo

#!/bin/bash
# syncs frappe-bench filesystem and all configs from stable to canary release

set -e

echo "=========================================="
echo "PVC SYNC: {{ source_release }} -> {{ dest_release }}"
echo "=========================================="

# install rsync for file sync
apk add --no-cache rsync

# verify source pvc is mounted and accessible
if [ ! -d "/src/frappe-bench" ] ; then
    echo "ERROR: Source directory not found at /src/frappe-bench"
    exit 1
fi

# create destination directory structure
mkdir -p /dst/frappe-bench

echo ""
echo "Source contents:"
ls -lah /src/frappe-bench/ | head -20

echo ""
echo "Destination contents (before sync):"
ls -lah /dst/frappe-bench/ | head -20

echo ""
echo "Starting rsync..."
# sync all files including configs, excluding only compiled python and socket files
rsync -avz \
--delete \
--ignore-errors \
--exclude="*.pyc" \
--exclude="__pycache__" \
--exclude="*.sock" \
/src/frappe-bench/ /dst/frappe-bench/

echo ""
echo "=========================================="
echo "[SUCCESS] PVC SYNC COMPLETED SUCCESSFULLY"
echo "=========================================="

apk add --no-cache rsync

echo "Syncing from {{ source_env | upper }} to {{ dest_env | upper }}..."

if [ ! -d "/src/frappe-bench" ]; then
  echo "ERROR: Source not found"
  exit 1
fi

mkdir -p /dst/frappe-bench

echo "Source:"
ls -la /src/frappe-bench/
echo ""
echo "Destination:"
ls -la /dst/frappe-bench/
echo ""

echo "Syncing files..."
rsync -avz --delete --ignore-errors --exclude="*.pyc" --exclude="__pycache__" --exclude="*.sock" /src/frappe-bench/ /dst/frappe-bench/

echo ""
echo "=========================================="
echo "[SUCCESS] PVC SYNC COMPLETED SUCCESSFULLY"
echo "=========================================="

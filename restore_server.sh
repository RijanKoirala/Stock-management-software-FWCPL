#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════════
# FWCPL StockOS — Disaster Recovery Data Restoration Script (Mac to VM)
# ══════════════════════════════════════════════════════════════════════════════════
# This script pushes the email backup (.sql.gz or .sql) and .env secrets from your
# Mac to a fresh/running Ubuntu VM, restores all PostgreSQL tables, synchronizes
# primary key sequences, and restarts PM2 so your server is 100% operational.
#
# Usage:
#   bash restore_server.sh <username>@<vm_ip> <path_to_backup_file>
# Example:
#   bash restore_server.sh ubuntu@103.x.x.x ~/Downloads/stockos_backup_2026-09-20T02-00-00.sql.gz
# ══════════════════════════════════════════════════════════════════════════════════

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "❌ Error: Missing required arguments."
  echo "👉 Usage:   bash restore_server.sh <user@vm_ip> <path_to_backup_file>"
  echo "👉 Example: bash restore_server.sh ubuntu@192.168.1.50 ~/Downloads/stockos_backup.sql.gz"
  exit 1
fi

VM_TARGET="$1"
BACKUP_LOCAL_PATH="$2"

if [ ! -f "$BACKUP_LOCAL_PATH" ]; then
  echo "❌ Error: Backup file not found at: $BACKUP_LOCAL_PATH"
  exit 1
fi

BACKUP_FILENAME=$(basename "$BACKUP_LOCAL_PATH")

echo "=================================================================="
echo "🚨 FWCPL StockOS Disaster Recovery Restore Starting..."
echo "📍 Target VM:    $VM_TARGET"
echo "📦 Backup File:  $BACKUP_FILENAME"
echo "=================================================================="

# 1. Upload .env secrets if present locally
if [ -f .env ]; then
  echo "🔑 [Step 1/5] Uploading .env secrets to VM..."
  scp .env "$VM_TARGET:/tmp/.env"
  ssh -t "$VM_TARGET" "sudo mv /tmp/.env /var/www/stockos/.env && sudo chown www-data:www-data /var/www/stockos/.env && sudo chmod 600 /var/www/stockos/.env"
else
  echo "ℹ️ [Step 1/5] No local .env found; skipping .env upload."
fi

# 2. Upload the database backup file to VM /tmp
echo "📤 [Step 2/5] Uploading backup file to VM /tmp..."
scp "$BACKUP_LOCAL_PATH" "$VM_TARGET:/tmp/$BACKUP_FILENAME"

# 3. Perform database restoration on VM
echo "⚡ [Step 3/5] Restoring database on VM..."
ssh -t "$VM_TARGET" << EOF
  set -e
  cd /tmp

  # Decompress if gzipped
  if [[ "$BACKUP_FILENAME" == *.gz ]]; then
    echo "🗜️ Decompressing backup archive..."
    gunzip -f -k "$BACKUP_FILENAME"
    SQL_FILE="\${BACKUP_FILENAME%.gz}"
  else
    SQL_FILE="$BACKUP_FILENAME"
  fi

  echo "🛑 Temporarily stopping PM2 backend to prevent active locks..."
  sudo pm2 stop stockos || true

  echo "🌱 Restoring PostgreSQL database 'stockos'..."
  # Clean restore into PostgreSQL
  sudo -u postgres psql -d stockos -f "/tmp/\$SQL_FILE"

  echo "🔄 Synchronizing auto-increment primary key sequences..."
  sudo -u postgres psql -d stockos << 'SQLEOF'
    DO \$\$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'procurement_items_id_seq') THEN
        PERFORM setval('procurement_items_id_seq', COALESCE((SELECT MAX(id) FROM procurement_items), 1));
      END IF;
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'transfer_items_id_seq') THEN
        PERFORM setval('transfer_items_id_seq', COALESCE((SELECT MAX(id) FROM transfer_items), 1));
      END IF;
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'requisition_items_id_seq') THEN
        PERFORM setval('requisition_items_id_seq', COALESCE((SELECT MAX(id) FROM requisition_items), 1));
      END IF;
    END \$\$;
SQLEOF

  # Clean up temporary dump file
  rm -f "/tmp/$BACKUP_FILENAME" "/tmp/\$SQL_FILE"

  echo "🚀 [Step 4/5] Restarting PM2 backend service..."
  sudo pm2 restart stockos

  echo "🌐 Restarting Nginx reverse proxy..."
  sudo systemctl restart nginx
EOF

# 4. Verify live service health
echo "🔍 [Step 5/5] Checking service health & database record counts..."
ssh -t "$VM_TARGET" << 'EOF'
  sudo -u postgres psql -d stockos -t -c "
    SELECT '✅ Locations: ' || COUNT(*) FROM locations
    UNION ALL
    SELECT '✅ Catalog Items: ' || COUNT(*) FROM items
    UNION ALL
    SELECT '✅ Serialized Hardware: ' || COUNT(*) FROM serialized_assets
    UNION ALL
    SELECT '✅ Consumable Stock: ' || COUNT(*) FROM consumable_stock
    UNION ALL
    SELECT '✅ Technicians: ' || COUNT(*) FROM technicians;
  "
EOF

echo "=================================================================="
echo "🎉 DISASTER RECOVERY RESTORATION COMPLETE!"
echo "Your server has been restored with all production data."
echo "Visit your server in the browser: http://${VM_TARGET#*@}"
echo "=================================================================="

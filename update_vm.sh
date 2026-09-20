#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════════
# FWCPL StockOS — Safe VM Hot-Update Script (From Mac to VM)
# ══════════════════════════════════════════════════════════════════════════════════
# This script copies the updated files to your live VM, restarts PM2,
# and verifies the email backup without touching or resetting your database.
#
# Usage:
#   bash update_vm.sh <username>@<vm_ip>
# Example:
#   bash update_vm.sh ubuntu@103.x.x.x
# ══════════════════════════════════════════════════════════════════════════════════

set -e

if [ -z "$1" ]; then
  echo "❌ Error: Please provide your VM SSH target (e.g., user@ip_address)."
  echo "👉 Usage: bash update_vm.sh ubuntu@192.168.1.100"
  exit 1
fi

VM_TARGET="$1"

echo "🚀 Starting hot-update to $VM_TARGET..."

# 1. Upload updated files to /tmp/ on VM
echo "📦 Uploading files via scp..."
scp server.js backup_email.js js/data.js js/views/reports.js "$VM_TARGET:/tmp/"

# 2. Move files into /var/www/stockos/, restart PM2, and set cron
echo "⚡ Applying updates and restarting StockOS on VM..."
ssh -t "$VM_TARGET" << 'EOF'
  sudo cp /tmp/server.js /var/www/stockos/
  sudo cp /tmp/backup_email.js /var/www/stockos/
  sudo cp /tmp/data.js /var/www/stockos/js/
  sudo cp /tmp/reports.js /var/www/stockos/js/views/

  # Clean up /tmp
  rm -f /tmp/server.js /tmp/backup_email.js /tmp/data.js /tmp/reports.js

  # Restart PM2 backend process
  echo "🔄 Restarting PM2 process..."
  sudo pm2 restart stockos

  # Ensure daily 2:00 AM cron is registered
  echo "⏰ Registering automated 2:00 AM backup cron..."
  (sudo crontab -l 2>/dev/null | grep -v 'backup_email.js' || true; echo "0 2 * * * cd /var/www/stockos && /usr/bin/node backup_email.js >> /var/log/stockos_backup.log 2>&1") | sudo crontab -

  # Trigger immediate test backup
  echo "📧 Running immediate backup verification to koiralarijan8@gmail.com..."
  cd /var/www/stockos && sudo node backup_email.js

  echo "🎉 All updates successfully deployed and active on VM!"
EOF

# 🛡️ FWCPL StockOS — Disaster Recovery (DR) Playbook

This document describes the exact procedure to recover the complete StockOS system from scratch on a **fresh Ubuntu Server VM** in the event of hardware failure, cloud instance termination, or data corruption.

---

## 📋 What You Have Available

1. **Application Code:** Pushed to GitHub repository (`Stock-management-software-FWCPL`).
2. **Database Backup:** Sent nightly to email (`koiralarijan8@gmail.com`) as `stockos_backup_<timestamp>.sql.gz`.
3. **Local Machine (Mac):** Contains your `.env` file and downloaded backup file.

---

## 🚀 Recovery Procedure (Step-by-Step)

### Phase 1: On the Fresh Ubuntu Server VM

1. **SSH into the fresh Ubuntu VM:**
   ```bash
   ssh ubuntu@<VM_IP_ADDRESS>
   ```

2. **Clone the project repository from GitHub:**
   ```bash
   git clone https://github.com/<YOUR_GITHUB_USERNAME>/Stock-management-software-FWCPL.git stockos
   cd stockos
   ```

3. **Run the automated deployment script:**
   ```bash
   sudo bash deploy.sh
   ```
   > **What this does:**
   > - Installs Node.js 20 LTS, PostgreSQL, Nginx, PM2, and build tools.
   > - Initializes the `stockos` database and base schema.
   > - Configures PM2 process manager and sets up systemd autostart.
   > - Configures Nginx reverse proxy on port 80.
   > - Sets up the 2:00 AM automated email backup cron job.

---

### Phase 2: Restore Real Data From Your Mac

On your Mac, you have downloaded the latest email attachment (e.g., `stockos_backup_2026-09-20T02-00-00.sql.gz`).

#### Option A: One-Command Automated Restore (Recommended)

From the project root on your Mac, simply run:

```bash
cd /Users/rijankoirala/Stock-management-software-FWCPL

bash restore_server.sh ubuntu@<VM_IP_ADDRESS> ~/Downloads/stockos_backup_<timestamp>.sql.gz
```

The script will automatically:
1. Copy your `.env` credentials to `/var/www/stockos/.env`.
2. Upload and decompress the `.sql.gz` dump.
3. Stop PM2 temporarily to prevent write collisions.
4. Restore all PostgreSQL tables and records.
5. Synchronize primary key auto-increment sequences.
6. Restart PM2 and Nginx.
7. Print out table record verification counts.

---

#### Option B: Manual Restore Steps

If you prefer to run the restore manually:

1. **Upload `.env` and backup from Mac to VM:**
   ```bash
   # From Mac
   scp .env ubuntu@<VM_IP>:/tmp/.env
   scp ~/Downloads/stockos_backup_<timestamp>.sql.gz ubuntu@<VM_IP>:/tmp/
   ```

2. **Move `.env` into place on VM:**
   ```bash
   # On VM
   sudo mv /tmp/.env /var/www/stockos/.env
   sudo chown www-data:www-data /var/www/stockos/.env
   sudo chmod 600 /var/www/stockos/.env
   ```

3. **Decompress and restore the SQL dump on VM:**
   ```bash
   # On VM
   cd /tmp
   gunzip -k stockos_backup_*.sql.gz
   sudo pm2 stop stockos

   # Restore into PostgreSQL
   sudo -u postgres psql -d stockos -f stockos_backup_*.sql

   # Synchronize sequence IDs
   sudo -u postgres psql -d stockos -c "
     SELECT setval(pg_get_serial_sequence('procurement_items', 'id'), COALESCE(max(id), 1)) FROM procurement_items;
     SELECT setval(pg_get_serial_sequence('transfer_items', 'id'), COALESCE(max(id), 1)) FROM transfer_items;
     SELECT setval(pg_get_serial_sequence('requisition_items', 'id'), COALESCE(max(id), 1)) FROM requisition_items;
   "

   # Restart backend & web server
   sudo pm2 restart stockos
   sudo systemctl restart nginx
   ```

---

## ✅ Post-Recovery Verification

1. **Verify Services:**
   ```bash
   sudo pm2 status
   sudo systemctl status nginx
   ```

2. **Verify Database Records:**
   ```bash
   sudo -u postgres psql -d stockos -c "SELECT COUNT(*) AS total_items FROM items;"
   sudo -u postgres psql -d stockos -c "SELECT COUNT(*) AS total_assets FROM serialized_assets;"
   ```

3. **Open in Browser:**
   Go to `http://<VM_IP_ADDRESS>` and verify:
   - Login with your existing credentials.
   - All items, branches, assets, and requisition history are visible.
   - Add a test item or requisition to verify write operations succeed.

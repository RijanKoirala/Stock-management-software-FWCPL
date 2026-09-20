#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════════
# FWCPL StockOS — Ubuntu Server VM Automated Production Deployment Script
# ══════════════════════════════════════════════════════════════════════════════════
# Run this script with root privileges (sudo bash deploy.sh) on your remote Ubuntu VM.
# Make sure you are in the directory where the project files exist.

set -e

echo "🚀 Starting StockOS Full-Stack Production Deployment on Ubuntu Server..."

# 1. Update package lists
echo "🔄 Updating package lists..."
sudo apt update -y

# 2. Install essential packages
echo "📦 Installing curl, git, build-essential..."
sudo apt install -y curl git build-essential

# 3. Install Node.js (v20 LTS) & npm
echo "📦 Installing Node.js LTS (v20)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node -v
npm -v

# 4. Install PostgreSQL Database Server
echo "📦 Installing PostgreSQL Database..."
sudo apt install -y postgresql postgresql-contrib

# 5. Start and enable PostgreSQL service
echo "⚡ Starting and enabling PostgreSQL service..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 6. Configure PostgreSQL User and Database
echo "⚙️ Configuring PostgreSQL Database 'stockos'..."
# Create/Update postgres user password to match backend defaults
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" || true
# Create stockos database
sudo -u postgres psql -c "CREATE DATABASE stockos;" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE stockos TO postgres;" || true

# 7. Create web root directory
echo "📁 Preparing directory at /var/www/stockos..."
sudo mkdir -p /var/www/stockos
sudo mkdir -p /var/www/stockos/uploads

# 8. Copy application and backend files
echo "📂 Copying project files to /var/www/stockos..."
# Copy static frontend files
sudo cp -r index.html css js /var/www/stockos/
# Copy backend files
sudo cp package.json schema.sql server.js backup_email.js /var/www/stockos/
if [ -f .env ]; then
    sudo cp .env /var/www/stockos/
fi

# 9. Initialize Database Schema & Seed baseline records
echo "🌱 Initializing PostgreSQL Schema and Seed baseline data..."
sudo -u postgres psql -d stockos -f /var/www/stockos/schema.sql

# 10. Install production dependencies for Node.js backend
echo "📦 Installing production npm dependencies..."
cd /var/www/stockos
sudo npm install --production

# 11. Configure PM2 Process Manager & launch backend
echo "⚡ Setting up PM2 Process Manager..."
sudo npm install -g pm2
# Delete existing process if running to avoid conflicts
sudo pm2 delete stockos || true
# Start server.js in production mode
sudo DB_HOST='localhost' DB_PORT='5432' DB_USER='postgres' DB_PASSWORD='postgres' DB_NAME='stockos' PORT=3000 pm2 start server.js --name "stockos"
# Save process list to run on system boot
sudo pm2 save
sudo pm2 startup systemd || true

# 11b. Setup Daily Automated Database Backup to Email (Cron Job at 2:00 AM)
echo "⏰ Configuring Daily Automated Database Backup Cron Job (2:00 AM)..."
(sudo crontab -l 2>/dev/null | grep -v 'backup_email.js' || true; echo "0 2 * * * cd /var/www/stockos && /usr/bin/node backup_email.js >> /var/log/stockos_backup.log 2>&1") | sudo crontab -
echo "✓ Automated backup schedule active: Every day at 2:00 AM"

# 12. Install Nginx Web Server
echo "📦 Installing Nginx..."
sudo apt install nginx -y

# 13. Create custom Nginx virtual host configuration with reverse-proxy
echo "⚙️ Creating Nginx server block configuration with API reverse-proxy..."
cat << 'EOF' | sudo tee /etc/nginx/sites-available/stockos > /dev/null
server {
    listen 80;
    server_name _; # Matches any IP address or domain pointing to this VM

    root /var/www/stockos;
    index index.html;

    # Serve Static Client Files
    location / {
        try_files $uri $uri/ =404;
    }

    # Reverse Proxy for Express REST API backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Enable gzip compression for lightning-fast loading speeds
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Cache static assets for premium performance
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";
}
EOF

# 14. Enable the site configuration and disable default
echo "🔗 Enabling StockOS server block..."
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm /etc/nginx/sites-enabled/default
fi

# Symlink sites-available to sites-enabled
sudo ln -sf /etc/nginx/sites-available/stockos /etc/nginx/sites-enabled/

# 15. Test Nginx configuration and restart service
echo "🧪 Testing Nginx configuration syntax..."
sudo nginx -t

echo "🔄 Restarting Nginx server to apply changes..."
sudo systemctl restart nginx
sudo systemctl enable nginx

# 16. Set strict owner and permission rules
echo "🔒 Configuring secure file permissions (www-data)..."
sudo chown -R www-data:www-data /var/www/stockos
sudo chmod -R 755 /var/www/stockos

# 17. Configure Firewall (UFW) to allow web traffic
echo "🛡️ Configuring Firewall to allow HTTP traffic..."
if sudo ufw status | grep -q "active"; then
    sudo ufw allow 'Nginx HTTP'
    echo "✓ Firewall rules updated!"
else
    echo "ℹ️ UFW Firewall is inactive, skipping firewall rules adjustment."
fi

# Get server IP
IP_ADDR=$(hostname -I | awk '{print $1}')

echo "================================════════════════════════"
echo "🎉 FULL-STACK PRODUCTION DEPLOYMENT COMPLETED SUCCESSFULY!"
echo "================================════════════════════════"
echo "StockOS is now hosted as an enterprise full-stack web application!"
echo "Database: PostgreSQL (Self-contained on the VM)"
echo "Backend Server: Node.js + Express managed by PM2"
echo "Web Server/Reverse Proxy: Nginx serving Port 80"
echo ""
echo "Open your browser and enter your VM IP address:"
echo "👉 http://$IP_ADDR"
echo "================================════════════════════════"

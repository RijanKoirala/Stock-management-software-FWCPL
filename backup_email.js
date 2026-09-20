/**
 * ══════════════════════════════════════════════════════════════════════════════════
 * FWCPL StockOS — Automated Database Backup & Email Dispatcher
 * ══════════════════════════════════════════════════════════════════════════════════
 * Exports PostgreSQL database 'stockos', compresses to .sql.gz, and emails it
 * to koiralarijan8@gmail.com for off-site disaster recovery.
 *
 * Can be run independently via CLI:
 *   node backup_email.js
 * Or called programmatically from server.js.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { exec } = require('child_process');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'stockos',
});

// Helper: Format bytes to human readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Fallback SQL dump using Node pg if pg_dump is not in PATH
async function generatePureJsDump(client) {
  let dump = `-- FWCPL StockOS Fallback Database Dump\n`;
  dump += `-- Generated at: ${new Date().toISOString()}\n\n`;
  dump += `BEGIN;\n\n`;

  const tables = [
    'locations', 'branch_users', 'items', 'technicians',
    'serialized_assets', 'consumable_stock', 'tech_consumable_stock',
    'procurements', 'procurement_items', 'transfers', 'transfer_items',
    'requisitions', 'requisition_items', 'consumable_logs', 'payouts',
    'fuel_logs', 'system_settings'
  ];

  for (const table of tables) {
    try {
      const res = await client.query(`SELECT * FROM ${table}`);
      if (res.rows.length === 0) continue;

      dump += `-- Table: ${table} (${res.rows.length} rows)\n`;
      dump += `DELETE FROM ${table};\n`;

      for (const row of res.rows) {
        const cols = Object.keys(row);
        const vals = cols.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number' || typeof val === 'boolean') return val;
          if (val instanceof Date) return `'${val.toISOString()}'`;
          if (Array.isArray(val)) {
            const arrEscaped = val.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
            return `'{${arrEscaped}}'`;
          }
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        dump += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
      }
      dump += `\n`;
    } catch (err) {
      console.warn(`⚠️ Warning dumping table ${table}:`, err.message);
    }
  }

  dump += `COMMIT;\n`;
  return dump;
}

// Main backup and email routine
async function sendDatabaseBackupEmail() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const rawSqlPath = path.join(backupDir, `stockos_backup_${timestamp}.sql`);
  const gzSqlPath = `${rawSqlPath}.gz`;

  console.log('🚀 Starting FWCPL StockOS Database Backup Process...');

  // 1. Fetch SMTP and notification settings from database (or fallback to .env)
  let smtpHost = process.env.SMTP_HOST;
  let smtpPort = process.env.SMTP_PORT || '465';
  let smtpUser = process.env.SMTP_USER;
  let smtpPass = process.env.SMTP_PASS;
  let recipient = process.env.NOTIFICATION_EMAILS || 'koiralarijan8@gmail.com';

  const client = await pool.connect();
  let tableStats = {};
  try {
    const settingsRes = await client.query('SELECT * FROM system_settings');
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

    smtpHost = settings.smtp_host || smtpHost;
    smtpPort = settings.smtp_port || smtpPort;
    smtpUser = settings.smtp_user || smtpUser;
    smtpPass = settings.smtp_pass || smtpPass;
    recipient = settings.notification_emails || recipient;

    // Collect counts for the email summary
    const countQueries = {
      'Catalog Items': 'SELECT COUNT(*) FROM items',
      'Serialized Hardware': 'SELECT COUNT(*) FROM serialized_assets',
      'Consumable Stock Records': 'SELECT COUNT(*) FROM consumable_stock',
      'Locations': 'SELECT COUNT(*) FROM locations',
      'Technicians': 'SELECT COUNT(*) FROM technicians',
      'Requisitions': 'SELECT COUNT(*) FROM requisitions',
      'Transfers': 'SELECT COUNT(*) FROM transfers',
      'Procurements': 'SELECT COUNT(*) FROM procurements'
    };

    for (const [label, q] of Object.entries(countQueries)) {
      try {
        const cRes = await client.query(q);
        tableStats[label] = cRes.rows[0].count;
      } catch (e) {
        tableStats[label] = 'N/A';
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not load settings from system_settings table, using .env defaults:', err.message);
  }

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error('SMTP credentials not configured. Please verify system_settings or .env file.');
  }

  // 2. Export PostgreSQL Database (Try pg_dump first, fallback to pure JS dump)
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPass = process.env.DB_PASSWORD || 'postgres';
  const dbName = process.env.DB_NAME || 'stockos';

  console.log(`📦 Exporting database "${dbName}" from ${dbHost}:${dbPort}...`);

  let dumpSuccess = false;
  const pgDumpCmd = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} --clean --if-exists -F p -f "${rawSqlPath}" ${dbName}`;

  try {
    await new Promise((resolve, reject) => {
      exec(pgDumpCmd, {
        env: { ...process.env, PGPASSWORD: dbPass },
        timeout: 60000
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
    dumpSuccess = true;
    console.log('✅ pg_dump completed successfully.');
  } catch (pgErr) {
    console.warn('ℹ️ pg_dump command failed or not installed. Using JavaScript SQL generator fallback...');
    try {
      const dumpSql = await generatePureJsDump(client);
      fs.writeFileSync(rawSqlPath, dumpSql, 'utf8');
      dumpSuccess = true;
      console.log('✅ JavaScript SQL generator completed successfully.');
    } catch (fallbackErr) {
      client.release();
      throw new Error(`Database dump failed: ${fallbackErr.message}`);
    }
  } finally {
    client.release();
  }

  // 3. Compress SQL dump using gzip
  console.log('🗜️ Compressing backup with gzip...');
  await new Promise((resolve, reject) => {
    const rawStream = fs.createReadStream(rawSqlPath);
    const gzipStream = zlib.createGzip({ level: 9 });
    const outStream = fs.createWriteStream(gzSqlPath);

    rawStream.pipe(gzipStream).pipe(outStream)
      .on('finish', resolve)
      .on('error', reject);
  });

  const rawStat = fs.statSync(rawSqlPath);
  const gzStat = fs.statSync(gzSqlPath);
  console.log(`✅ Compressed: ${formatBytes(rawStat.size)} ➔ ${formatBytes(gzStat.size)}`);

  // Remove uncompressed .sql to conserve disk space
  if (fs.existsSync(rawSqlPath)) {
    fs.unlinkSync(rawSqlPath);
  }

  // 4. Configure Nodemailer Transporter
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort),
    secure: String(smtpPort) === '465',
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Build stats table HTML
  const statsRows = Object.entries(tableStats).map(([key, count]) => `
    <tr>
      <td style="padding: 6px 12px; border: 1px solid #e2e8f0; font-size: 13px; color: #475569;">${key}</td>
      <td style="padding: 6px 12px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: bold; text-align: right; color: #0f172a; font-family: monospace;">${count}</td>
    </tr>
  `).join('');

  const formattedDate = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: #ffffff; padding: 24px 28px; text-align: left;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">🛡️ FWCPL StockOS Database Backup</h1>
        <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Automated Off-Site Disaster Recovery Archive</p>
      </div>

      <div style="padding: 24px 28px; color: #334155; line-height: 1.6;">
        <p style="margin-top: 0; font-size: 15px;">
          Hello <strong>Rijan</strong>,
        </p>
        <p style="font-size: 14px; color: #475569;">
          A full automated backup of the <strong>FWCPL StockOS PostgreSQL database</strong> was successfully generated and is attached to this email.
        </p>

        <!-- Summary Card -->
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 13px; color: #64748b; width: 40%;">Backup Timestamp</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; font-size: 13px; color: #0f172a;">${formattedDate} (NPT)</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 13px; color: #64748b;">Database Name</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 13px; color: #4f46e5; font-weight: bold;">${dbName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 13px; color: #64748b;">Attachment Name</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 12px; color: #0f172a;">stockos_backup_${timestamp}.sql.gz</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b;">Compressed Size</td>
            <td style="padding: 10px 14px; font-weight: bold; font-size: 13px; color: #16a34a;">${formatBytes(gzStat.size)}</td>
          </tr>
        </table>

        <!-- Record Counts -->
        <h3 style="font-size: 15px; margin: 24px 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">📊 Current Database Snapshot</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9;">
              <th style="padding: 8px 12px; border: 1px solid #e2e8f0; font-size: 12px; text-transform: uppercase; text-align: left; color: #475569;">Table</th>
              <th style="padding: 8px 12px; border: 1px solid #e2e8f0; font-size: 12px; text-transform: uppercase; text-align: right; color: #475569;">Records</th>
            </tr>
          </thead>
          <tbody>
            ${statsRows}
          </tbody>
        </table>

        <!-- Restoration Guide Box -->
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
          <h4 style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px;">🔄 How to Restore this Backup (Disaster Recovery):</h4>
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #1e3a8a;">
            If the production VM crashes or you want to run this data locally on your Mac or a new VM:
          </p>
          <pre style="background-color: #1e293b; color: #f8fafc; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; margin: 0; font-family: monospace;"># 1. Unzip the attached file
gunzip stockos_backup_${timestamp}.sql.gz

# 2. Inject into PostgreSQL
psql -U postgres -d stockos -f stockos_backup_${timestamp}.sql</pre>
        </div>
      </div>

      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 28px; text-align: center; font-size: 12px; color: #94a3b8;">
        Fiber World Communication Pvt. Ltd. · StockOS Security & Continuity System
      </div>
    </div>
  `;

  // 5. Send Mail with Attachment
  console.log(`📧 Sending backup email to ${recipient}...`);
  const info = await transporter.sendMail({
    from: `"FWCPL StockOS Backup" <${smtpUser}>`,
    to: recipient,
    subject: `🛡️ [StockOS] Database Backup Archive — ${formattedDate}`,
    html: emailHtml,
    attachments: [
      {
        filename: `stockos_backup_${timestamp}.sql.gz`,
        path: gzSqlPath
      }
    ]
  });

  console.log(`✅ Backup email successfully delivered! MessageId: ${info.messageId}`);

  // 6. Clean up the compressed file after sending
  try {
    if (fs.existsSync(gzSqlPath)) {
      fs.unlinkSync(gzSqlPath);
      console.log('🧹 Local temporary backup archive cleaned up.');
    }
  } catch (cleanErr) {
    console.warn('⚠️ Could not remove temp file:', cleanErr.message);
  }

  return {
    success: true,
    messageId: info.messageId,
    timestamp,
    size: formatBytes(gzStat.size),
    recipient
  };
}

// Allow execution directly from CLI
if (require.main === module) {
  sendDatabaseBackupEmail()
    .then((result) => {
      console.log('🎉 Backup workflow completed successfully:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Backup workflow failed:', err);
      process.exit(1);
    });
}

module.exports = { sendDatabaseBackupEmail };

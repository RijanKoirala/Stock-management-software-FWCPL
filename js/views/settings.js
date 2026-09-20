// ═══════════════════════════════════════
// View: System Settings (SMTP & Email Alerts Configuration)
// ═══════════════════════════════════════
let loadedSettings = {};

function renderSettings() {
  return `
  <div class="view-header">
    <div><div class="view-title">⚙ System Settings</div><div class="view-subtitle">Configure SMTP mail server credentials and notification emails</div></div>
  </div>
  
  <div class="card" style="max-width: 650px; margin-bottom: 24px;">
    <div class="card-hdr" style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px;">
      <div>
        <div class="card-title" style="font-size: 15px; display:flex; align-items:center; gap:8px;">
          📧 SMTP Outgoing Mail Server Configuration
        </div>
        <div class="card-subtitle">Used by StockOS to send automatic stock request notifications to higher management.</div>
      </div>
    </div>
    
    <div style="padding: 4px 16px 16px 16px;">
      <div class="fg">
        <label class="fl">SMTP Host / Server Address</label>
        <input class="fi" id="set-smtp-host" placeholder="e.g. mail.fiberworld.net.np" required />
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="fg">
          <label class="fl">SMTP Port</label>
          <input class="fi" id="set-smtp-port" type="number" placeholder="e.g. 465 or 587" required />
        </div>
        <div class="fg">
          <label class="fl">Sender Account Email</label>
          <input class="fi" id="set-smtp-user" placeholder="e.g. stock.alerts@fiberworld.net.np" required />
        </div>
      </div>
      
      <div class="fg">
        <label class="fl">Sender Account Password</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input class="fi" id="set-smtp-pass" type="password" placeholder="••••••••" style="flex: 1; padding-right: 40px; margin-bottom: 0;" required />
          <button type="button" onclick="toggleSettingsPassword()" style="position: absolute; right: 10px; background: transparent; border: none; cursor: pointer; color: var(--text-secondary); font-size: 14px; outline: none; padding: 4px;">👁️</button>
        </div>
      </div>
      
      <div style="border-top: 1px solid var(--border); margin: 24px 0 16px 0; padding-top: 16px;"></div>
      
      <div class="card-title" style="font-size: 14px; margin-bottom: 4px; display:flex; align-items:center; gap:8px;">
        👥 Notification Recipient Emails
      </div>
      <div class="card-subtitle" style="margin-bottom: 12px;">Enter email addresses that should receive alerts when stock requests are made. Separate multiple emails with commas.</div>
      
      <div class="fg">
        <label class="fl">Recipient Email Address(es)</label>
        <textarea class="fi" id="set-recipients" rows="3" placeholder="e.g. ceo@fiberworld.net.np, opshead@fiberworld.net.np"></textarea>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
        <button class="btn btn-secondary" onclick="resetSettingsFields()">Reset Form</button>
        <button class="btn btn-primary" onclick="saveSettings()">Save Configurations</button>
      </div>
    </div>
  </div>

  <div class="card mb-16" style="max-width: 650px; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.02);">
    <div class="card-hdr" style="border-bottom: 1px solid rgba(239, 68, 68, 0.15); padding-bottom: 12px; margin-bottom: 16px;">
      <div>
        <div class="card-title" style="font-size: 15px; color: var(--red); display:flex; align-items:center; gap:8px;">
          ⚠️ Danger Zone: System Reset
        </div>
        <div class="card-subtitle">Perform a complete system reset and seed baseline records.</div>
      </div>
    </div>
    <div style="padding: 4px 16px 16px 16px; font-size: 13px; line-height: 1.5;">
      <p style="color: var(--text-secondary); margin-bottom: 16px;">
        This will permanently truncate all live data including serial tracking, consumables log, payouts, technician wallets, requisitions, and transfers, resetting the database back to clean baseline ISP demo assets. <strong>This action cannot be undone.</strong>
      </p>
      <div style="display: flex; justify-content: flex-end;">
        <button class="btn btn-scrap" onclick="triggerSystemReset()" style="font-size: 13px; padding: 10px 20px;">🔄 Reset System Database</button>
      </div>
    </div>
  </div>
  `;
}

async function settingsMounted() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to load settings');
    loadedSettings = await res.json();
    populateSettingsFields(loadedSettings);
  } catch (err) {
    App.toast('Error fetching settings: ' + err.message, 'error');
  }
}

function populateSettingsFields(data) {
  if (document.getElementById('set-smtp-host')) document.getElementById('set-smtp-host').value = data.smtp_host || '';
  if (document.getElementById('set-smtp-port')) document.getElementById('set-smtp-port').value = data.smtp_port || '';
  if (document.getElementById('set-smtp-user')) document.getElementById('set-smtp-user').value = data.smtp_user || '';
  if (document.getElementById('set-smtp-pass')) document.getElementById('set-smtp-pass').value = data.smtp_pass || '';
  if (document.getElementById('set-recipients')) document.getElementById('set-recipients').value = data.notification_emails || '';
}

function resetSettingsFields() {
  populateSettingsFields(loadedSettings);
  App.toast('Form reset to last saved state', 'info');
}

function toggleSettingsPassword() {
  const el = document.getElementById('set-smtp-pass');
  if (el) {
    el.type = el.type === 'password' ? 'text' : 'password';
  }
}

async function saveSettings() {
  const smtp_host = document.getElementById('set-smtp-host')?.value?.trim();
  const smtp_port = document.getElementById('set-smtp-port')?.value?.trim();
  const smtp_user = document.getElementById('set-smtp-user')?.value?.trim();
  const smtp_pass = document.getElementById('set-smtp-pass')?.value;
  const notification_emails = document.getElementById('set-recipients')?.value?.trim();

  if (!smtp_host || !smtp_port || !smtp_user || !smtp_pass) {
    App.toast('All SMTP server configuration fields are required', 'error');
    return;
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtp_host,
        smtp_port,
        smtp_user,
        smtp_pass,
        notification_emails
      })
    });

    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Failed to save settings');

    App.toast('System settings updated successfully!', 'success');
    
    loadedSettings = {
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass: '********',
      notification_emails
    };
    populateSettingsFields(loadedSettings);

  } catch (err) {
    App.toast('Failed to save settings: ' + err.message, 'error');
  }
}

async function triggerSystemReset() {
  if (confirm("🚨 WARNING: Are you sure you want to completely reset the FWCPL StockOS database? This will wipe out all transaction logs, transfers, scrap data, and custom records, and restore the baseline seed. This action is permanent and cannot be undone.")) {
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Reset failed');
      }
      localStorage.clear();
      window.location.href = window.location.pathname + '?reset_success=true';
    } catch (e) {
      App.toast('Failed to reset database: ' + e.message, 'error');
    }
  }
}

// Global hooks
window.renderSettings = renderSettings;
window.settingsMounted = settingsMounted;
window.resetSettingsFields = resetSettingsFields;
window.toggleSettingsPassword = toggleSettingsPassword;
window.saveSettings = saveSettings;
window.triggerSystemReset = triggerSystemReset;

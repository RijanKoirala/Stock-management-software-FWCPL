
// View: Reports (Super Admin only)
function renderReports() {
  const totalVal = DB.getTotalValuation();
  const assetVal = DB.serialized.filter(s => s.status !== 'Returned_To_Vendor' && s.status !== 'Sold').reduce((s,sr)=>{const it=DB.getItem(sr.item_id);return s + (sr.purchase_cost != null ? Number(sr.purchase_cost) : Number(it?.unit_cost || 0));},0);
  const consVal = DB.consumable_stock.reduce((s,c)=>s+Number(c.qty)*Number(c.unit_cost),0);
  const byLoc = DB.locations.map(loc=>{
    const aVal = DB.serialized.filter(s=>s.loc_id===loc.id).reduce((s,sr)=>{const it=DB.getItem(sr.item_id);return s + (sr.purchase_cost != null ? Number(sr.purchase_cost) : Number(it?.unit_cost || 0));},0);
    const cVal = DB.consumable_stock.filter(c=>c.loc_id===loc.id).reduce((s,c)=>s+Number(c.qty)*Number(c.unit_cost),0);
    const total = aVal+cVal;
    const pct = totalVal ? Math.round(total/totalVal*100) : 0;
    return `<tr><td><div class="fw-600">${loc.name}</div></td><td><span class="badge badge-${loc.type==='Central'?'purple':'blue'}">${loc.type}</span></td><td class="mono">NPR ${aVal.toLocaleString()}</td><td class="mono">NPR ${cVal.toLocaleString()}</td><td class="mono fw-600">NPR ${total.toLocaleString()}</td><td><div class="progress-bar" style="width:120px"><div class="progress-fill" style="width:${pct}%"></div></div><span class="fs-11 text-muted">${pct}%</span></td></tr>`;
  }).join('');

  const logRows = DB.consumable_logs.map(log=>{
    const it=DB.getItem(log.item_id);
    const tech=DB.getTechnician(log.tech_id);
    return `<tr><td class="mono fw-600">${log.id}</td><td>${it?.name}</td><td class="mono text-red">-${log.qty_used} ${it?.uom}</td><td>${log.customer_acc||'—'}</td><td>${tech?.name||'—'}</td><td>${log.date}</td><td class="fs-12 text-muted">${log.notes||'—'}</td></tr>`;
  }).join('');

  return `
  <div class="view-header">
    <div><div class="view-title">◫ Inventory Reports</div><div class="view-subtitle">Valuation analytics and consumption audit trail</div></div>
    <div class="view-actions">
      <button class="btn btn-primary btn-sm" id="btn-email-backup" onclick="triggerEmailBackup()">🛡️ Email DB Backup</button>
      <button class="btn btn-secondary btn-sm" onclick="exportReport()">📤 Export Report</button>
    </div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
    <div class="stat-card" style="--stat-color:var(--accent)">
      <div class="stat-icon">💰</div>
      <div class="stat-val" style="font-size:16px">NPR ${totalVal.toLocaleString()}</div>
      <div class="stat-label">Total Inventory Value</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--purple)">
      <div class="stat-icon">🖥️</div>
      <div class="stat-val" style="font-size:16px">NPR ${assetVal.toLocaleString()}</div>
      <div class="stat-label">Asset Valuation</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--blue)">
      <div class="stat-icon">📦</div>
      <div class="stat-val" style="font-size:16px">NPR ${consVal.toLocaleString()}</div>
      <div class="stat-label">Consumable Valuation</div>
    </div>
  </div>

  <div class="card mb-16">
    <div class="card-hdr"><div class="card-title">📍 Valuation by Location</div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Location</th><th>Type</th><th>Asset Value</th><th>Consumable Value</th><th>Total</th><th>Share</th></tr></thead>
      <tbody>${byLoc}</tbody>
    </table></div>
  </div>

  <div class="card mb-16">
    <div class="card-hdr"><div class="card-title">📊 Asset Status Breakdown</div></div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;padding:8px 0">
      ${['Available','In_Transit','Assigned','Deployed','Faulty'].map(st=>{
        const cnt = DB.serialized.filter(s=>s.status===st).length;
        const activeAssets = DB.serialized.filter(s => s.status !== 'Returned_To_Vendor' && s.status !== 'Sold');
        const pct = activeAssets.length ? Math.round(cnt/activeAssets.length*100) : 0;
        const colors = {'Available':'green','In_Transit':'blue','Assigned':'orange','Deployed':'purple','Faulty':'red'};
        return `<div style="flex:1;min-width:140px;background:var(--bg-card2);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center"><div style="font-size:24px;font-weight:800;font-family:monospace;color:var(--${colors[st]||'accent'})">${cnt}</div><div class="fs-12 text-secondary mt-8">${st.replace(/_/g,' ')}</div><div class="progress-bar mt-8"><div class="progress-fill ${colors[st]}" style="width:${pct}%"></div></div></div>`;
      }).join('')}
    </div>
  </div>

  <div class="card">
    <div class="card-hdr"><div class="card-title">📋 Consumable Usage Audit Log</div></div>
    ${logRows ? `<div class="table-wrap"><table>
      <thead><tr><th>Log ID</th><th>Item</th><th>Qty Used</th><th>Customer</th><th>Technician</th><th>Date</th><th>Notes</th></tr></thead>
      <tbody>${logRows}</tbody>
    </table></div>` : '<div class="empty-state"><p>No consumable usage logged yet</p></div>'}
  </div>`;
}

function exportReport() {
  const rows = [['Location','Type','Asset Value','Consumable Value','Total']];
  DB.locations.forEach(loc=>{
    const aVal=DB.serialized.filter(s=>s.loc_id===loc.id).reduce((s,sr)=>{const it=DB.getItem(sr.item_id);return s + (sr.purchase_cost != null ? Number(sr.purchase_cost) : Number(it?.unit_cost || 0));},0);
    const cVal=DB.consumable_stock.filter(c=>c.loc_id===loc.id).reduce((s,c)=>s+Number(c.qty)*Number(c.unit_cost),0);
    rows.push([loc.name,loc.type,aVal,cVal,aVal+cVal]);
  });
  const csv = rows.map(r=>r.join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fwcpl_report.csv'; a.click();
  App.toast('Report exported','success');
}

async function triggerEmailBackup() {
  const btn = document.getElementById('btn-email-backup');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Generating Backup...';
  }
  App.toast('Creating database backup and sending to email...', 'info');

  try {
    const res = await DB.emailDatabaseBackup();
    App.toast(res.message || 'Database backup sent to koiralarijan8@gmail.com successfully!', 'success');
  } catch (err) {
    console.error('Backup email error:', err);
    App.toast('Backup failed: ' + err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🛡️ Email DB Backup';
    }
  }
}



// ═══════════════════════════════════════
// View: Transfer Hub
// ═══════════════════════════════════════
function getTransferActionHtml(t, user) {
  if (t.status === 'Pending') {
    if (user.role === 'super_admin' || user.location_id === t.from_loc) {
      return `<button class="btn btn-sm btn-primary" onclick="dispatchTransfer('${t.id}')">Dispatch</button>`;
    }
    return `<span class="text-muted fs-12">Pending Dispatch</span>`;
  }
  if (t.status === 'In_Transit') {
    const destLoc = DB.getLocation(t.to_loc);
    const isDestCentral = destLoc ? destLoc.type === 'Central' : (t.to_loc === 'LOC001');
    const canAcknowledge = user.role === 'super_admin' || 
                           (isDestCentral && user.role === 'central_manager') || 
                           (!isDestCentral && user.role === 'branch_storekeeper' && user.location_id === t.to_loc);
                           
    if (canAcknowledge) {
      return `<button class="btn btn-sm btn-success" onclick="acknowledgeTransfer('${t.id}')">Acknowledge</button>`;
    }
    return `<span class="text-muted fs-12" style="color:var(--blue) !important;font-weight:600;">In Transit</span>`;
  }
  if (t.status === 'Completed') {
    return `<span class="text-muted fs-12">Completed</span>`;
  }
  return '';
}

function renderTransfers() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  const transfers = isBranchKeeper 
    ? DB.transfers.filter(t => t.from_loc === user.location_id || t.to_loc === user.location_id)
    : DB.transfers;

  const statusMap = { 'Pending':'badge-yellow', 'In_Transit':'badge-blue', 'Completed':'badge-green' };
  const rows = transfers.map(t => {
    const from = DB.getLocation(t.from_loc)?.name || t.from_loc;
    const to = DB.getLocation(t.to_loc)?.name || t.to_loc;
    const itemSummary = t.items.map(i => {
      const it = DB.getItem(i.item_id);
      const qty = i.serials?.length || i.qty;
      return `${it?.name || i.item_id} × ${qty}`;
    }).join(', ');
    const actionHtml = getTransferActionHtml(t, user);
    return `<tr>
      <td class="mono fw-600">${t.id}</td>
      <td><div class="fw-600">${from}</div></td>
      <td><div style="color:var(--text-muted)">→</div></td>
      <td><div class="fw-600">${to}</div></td>
      <td class="fs-12 text-secondary">${itemSummary}</td>
      <td>${t.created}</td>
      <td><span class="badge ${statusMap[t.status]||'badge-gray'}">${t.status.replace('_',' ')}</span></td>
      <td>${actionHtml} <button class="btn btn-sm btn-secondary" onclick="viewTransfer('${t.id}')">View</button></td>
    </tr>`;
  }).join('');

  const stats = { Pending:0, In_Transit:0, Completed:0 };
  transfers.forEach(t => { if(stats[t.status]!==undefined) stats[t.status]++; });

  const canDirectTransfer = user && (user.role === 'super_admin' || user.role === 'central_manager');
  return `
  <div class="view-header">
    <div><div class="view-title">⇌ Transfer Hub</div><div class="view-subtitle">Track all inter-location stock movements</div></div>
    <div class="view-actions">
      ${canDirectTransfer ? `<button class="btn btn-secondary btn-sm" onclick="openDirectTransferModal()" style="margin-right:8px">+ Direct Transfer</button>` : ''}
      <button class="btn btn-primary btn-sm" onclick="openNewRequisition()">+ New Requisition</button>
    </div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
    <div class="stat-card" style="--stat-color:var(--yellow)">
      <div class="stat-icon">⏳</div>
      <div class="stat-val">${stats.Pending}</div>
      <div class="stat-label">Pending Approval</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--blue)">
      <div class="stat-icon">🚚</div>
      <div class="stat-val">${stats.In_Transit}</div>
      <div class="stat-label">In Transit</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--green)">
      <div class="stat-icon">✅</div>
      <div class="stat-val">${stats.Completed}</div>
      <div class="stat-label">Completed</div>
    </div>
  </div>

  <div class="card">
    <div class="card-hdr">
      <div class="card-title">All Transfers</div>
      <div style="display:flex;gap:8px">
        <select class="filter-select" id="trf-status-filter" onchange="filterTransfers()">
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="In_Transit">In Transit</option>
          <option value="Completed">Completed</option>
        </select>
      </div>
    </div>
    <div class="table-wrap" id="trf-table">
      <table><thead><tr><th>Transfer ID</th><th>From</th><th></th><th>To</th><th>Items</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
  </div>`;
}

function filterTransfers() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  const transfers = isBranchKeeper 
    ? DB.transfers.filter(t => t.from_loc === user.location_id || t.to_loc === user.location_id)
    : DB.transfers;

  const f = document.getElementById('trf-status-filter')?.value;
  const rows = transfers.filter(t => !f || t.status === f);
  // Re-render just the tbody
  document.querySelector('#trf-table tbody').innerHTML = rows.map(t => {
    const statusMap = {'Pending':'badge-yellow','In_Transit':'badge-blue','Completed':'badge-green'};
    const from = DB.getLocation(t.from_loc)?.name || t.from_loc;
    const to = DB.getLocation(t.to_loc)?.name || t.to_loc;
    const itemSummary = t.items.map(i => { const it=DB.getItem(i.item_id); return `${it?.name||i.item_id} × ${i.serials?.length||i.qty}`; }).join(', ');
    const actionHtml = getTransferActionHtml(t, user);
    return `<tr><td class="mono fw-600">${t.id}</td><td>${from}</td><td>→</td><td>${to}</td><td class="fs-12 text-secondary">${itemSummary}</td><td>${t.created}</td><td><span class="badge ${statusMap[t.status]||'badge-gray'}">${t.status.replace('_',' ')}</span></td><td>${actionHtml} <button class="btn btn-sm btn-secondary" onclick="viewTransfer('${t.id}')">View</button></td></tr>`;
  }).join('');
}

function viewTransfer(id) {
  const t = DB.transfers.find(x => x.id === id);
  if (!t) return;
  const from = DB.getLocation(t.from_loc)?.name || t.from_loc;
  const to = DB.getLocation(t.to_loc)?.name || t.to_loc;
  const statusMap = {'Pending':'badge-yellow','In_Transit':'badge-blue','Completed':'badge-green'};
  const itemRows = t.items.map(i => {
    const it = DB.getItem(i.item_id);
    const serialList = (i.serials||[]).map(sn => `<span class="tag">${sn}</span>`).join('');
    return `<tr><td>${it?.name||i.item_id}</td><td><span class="badge badge-${it?.category==='Asset'?'purple':'blue'}">${it?.category}</span></td><td>${i.serials?.length||i.qty}</td><td><div class="tag-list">${serialList||'N/A'}</div></td></tr>`;
  }).join('');

  App.showModal(`Transfer Details — ${id}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="fg"><label class="fl">From</label><input class="fi" value="${from}" readonly/></div>
      <div class="fg"><label class="fl">To</label><input class="fi" value="${to}" readonly/></div>
      <div class="fg"><label class="fl">Status</label><div style="padding:8px 0"><span class="badge ${statusMap[t.status]}">${t.status.replace('_',' ')}</span></div></div>
      <div class="fg"><label class="fl">Date</label><input class="fi" value="${t.created}" readonly/></div>
    </div>
    ${t.notes ? `<div class="fg"><label class="fl">Notes</label><input class="fi" value="${t.notes}" readonly/></div>` : ''}
    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>Serial Numbers</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table></div>
  `, [
    { label:'🖨️ Print Transfer Slip', cls:'btn-primary', onclick:`printTransferChallan('${id}')` },
    { label:'Close', cls:'btn-secondary', onclick:'App.closeModal()' }
  ]);
}

function printTransferChallan(id) {
  const t = DB.transfers.find(x => x.id === id);
  if (!t) return;
  const from = DB.getLocation(t.from_loc)?.name || t.from_loc;
  const to = DB.getLocation(t.to_loc)?.name || t.to_loc;

  const senderLoc = DB.getLocation(t.from_loc);
  const receiverLoc = DB.getLocation(t.to_loc);
  const senderManager = senderLoc?.manager || '—';
  const receiverManager = receiverLoc?.manager || '—';
  const senderSigImg = senderLoc?.manager_signature || '';
  const receiverSigImg = receiverLoc?.manager_signature || '';

  const cleanDispBy = (t.dispatched_by || '').trim().toLowerCase();
  const cleanSendMgr = senderManager.trim().toLowerCase();
  const showActualDispatcher = t.dispatched_by &&
    cleanDispBy !== 'super admin' &&
    cleanDispBy !== 'superadmin' &&
    cleanDispBy !== cleanSendMgr &&
    cleanDispBy !== 'n/a' &&
    cleanDispBy !== '—';

  const cleanAckBy = (t.acknowledged_by || '').trim().toLowerCase();
  const cleanRecvMgr = receiverManager.trim().toLowerCase();
  const showActualReceiver = t.acknowledged_by &&
    cleanAckBy !== 'super admin' &&
    cleanAckBy !== 'superadmin' &&
    cleanAckBy !== cleanRecvMgr &&
    cleanAckBy !== 'n/a' &&
    cleanAckBy !== '—';

  let dispatchName = '_____________________________________';
  let dispatchSig = '__________________________________';
  let dispatchDate = '____ / ____ / ________';

  let receiveName = '_____________________________________';
  let receiveSig = '__________________________________';
  let receiveDate = '____ / ____ / ________';

  if (t.status === 'In_Transit' || t.status === 'Completed') {
    dispatchName = `<span style="font-weight: 600; color: #0f172a; text-decoration: underline; text-underline-offset: 4px;">${senderManager}</span>`;
    dispatchSig = senderSigImg 
      ? `<img src="${senderSigImg}" style="max-height: 65px; max-width: 220px; object-fit: contain; vertical-align: middle; margin: -8px 0;" />`
      : `<span class="digital-signature">${senderManager}</span>`;
    dispatchDate = `<span style="font-weight: 600; color: #0f172a; text-decoration: underline; text-underline-offset: 4px;">${t.created}</span>`;
  }

  if (t.status === 'Completed') {
    receiveName = `<span style="font-weight: 600; color: #0f172a; text-decoration: underline; text-underline-offset: 4px;">${receiverManager}</span>`;
    receiveSig = receiverSigImg
      ? `<img src="${receiverSigImg}" style="max-height: 65px; max-width: 220px; object-fit: contain; vertical-align: middle; margin: -8px 0;" />`
      : `<span class="digital-signature">${receiverManager}</span>`;
    const todayDate = new Date().toISOString().slice(0, 10);
    receiveDate = `<span style="font-weight: 600; color: #0f172a; text-decoration: underline; text-underline-offset: 4px;">${todayDate}</span>`;
  }

  const printWindow = window.open('', '_blank', 'width=900,height=700');

  const itemsHtml = t.items.map((i, index) => {
    const it = DB.getItem(i.item_id);
    const serialList = (i.serials || []).map(sn => `<span class="serial-badge">${sn}</span>`).join(' ');
    return `
      <tr>
        <td style="text-align: center;">${index + 1}</td>
        <td>
          <div style="font-weight: 600;">${it?.name || i.item_id}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Item ID: ${i.item_id}</div>
        </td>
        <td style="text-align: center;"><span class="type-badge ${it?.category === 'Asset' ? 'asset' : 'consumable'}">${it?.category || 'Consumable'}</span></td>
        <td style="text-align: center; font-weight: 600;">${i.serials?.length || i.qty}</td>
        <td>
          <div class="serial-container">${serialList || '<em style="color:#94a3b8;">N/A (Non-serialized Consumable)</em>'}</div>
        </td>
      </tr>
    `;
  }).join('');

  const statusClass = t.status === 'Completed' ? 'status-completed' : (t.status === 'In_Transit' ? 'status-transit' : 'status-pending');
  const statusLabel = t.status.replace('_', ' ');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Transfer Slip - ${t.id}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Inter', -apple-system, sans-serif;
          color: #1e293b;
          background: #ffffff;
          line-height: 1.5;
          padding: 40px;
          font-size: 13px;
        }

        @media print {
          body {
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 15mm 20mm;
          }
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #cbd5e1;
          padding-bottom: 20px;
          margin-bottom: 25px;
        }

        .logo-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          width: 44px;
          height: 44px;
          background: #f1f5f9;
          border: 1.5px solid #6366f1;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6366f1;
        }

        .logo-text {
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.5px;
        }

        .logo-text em {
          color: #6366f1;
          font-style: normal;
        }

        .logo-sub {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 1px;
          font-weight: 600;
        }

        .challan-title {
          text-align: right;
        }

        .challan-title h1 {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 4px;
          letter-spacing: -0.5px;
        }

        .challan-id {
          font-family: monospace;
          font-size: 16px;
          font-weight: 700;
          color: #6366f1;
        }

        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 25px;
        }

        .info-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
        }

        .info-card h3 {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
          margin-bottom: 8px;
          border-bottom: 1px solid #cbd5e1;
          padding-bottom: 4px;
          font-weight: 700;
        }

        .meta-table {
          width: 100%;
          border-collapse: collapse;
        }

        .meta-table td {
          padding: 5px 0;
          font-size: 13px;
        }

        .meta-label {
          color: #64748b;
          width: 90px;
          font-weight: 500;
        }

        .meta-val {
          font-weight: 600;
          color: #0f172a;
        }

        .status-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .status-completed { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
        .status-transit { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
        .status-pending { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }

        .items-table th {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          padding: 10px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: #475569;
          letter-spacing: 0.5px;
        }

        .items-table td {
          border: 1px solid #cbd5e1;
          padding: 10px;
          vertical-align: top;
        }

        .type-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .type-badge.asset { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
        .type-badge.consumable { background: #e0f2fe; color: #075985; border: 1px solid #bae6fd; }

        .serial-container {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .serial-badge {
          font-family: monospace;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #334155;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        .notes-section {
          background: #fffbeb;
          border: 1px solid #fef3c7;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 30px;
        }

        .notes-title {
          font-size: 11px;
          font-weight: 700;
          color: #b45309;
          text-transform: uppercase;
          margin-bottom: 4px;
          letter-spacing: 0.5px;
        }

        .notes-content {
          color: #78350f;
          font-size: 13px;
        }

        .signature-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 50px;
          page-break-inside: avoid;
        }

        .signature-box {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 20px;
        }

        .signature-title {
          font-size: 11px;
          font-weight: 800;
          color: #475569;
          margin-bottom: 24px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1.5px solid #cbd5e1;
          padding-bottom: 6px;
        }

        .signature-line {
          display: flex;
          flex-direction: column;
          gap: 12px;
          text-align: left;
          font-size: 12px;
          color: #475569;
        }

        .digital-signature {
          font-family: 'Dancing Script', cursive;
          font-size: 20px;
          color: #1e3a8a; /* Blue ink for digital signature */
          display: inline-block;
          font-weight: 700;
          transform: rotate(-1.5deg);
          padding-left: 10px;
          text-decoration: none !important;
        }

        .print-btn-bar {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          padding: 12px 24px;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          border-radius: 8px;
          margin-bottom: 25px;
        }

        .print-btn {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13px;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .print-btn-primary {
          background: #6366f1;
          color: #ffffff;
          border: none;
        }
        .print-btn-primary:hover {
          background: #4f46e5;
        }
        .print-btn-secondary {
          background: #ffffff;
          color: #475569;
          border: 1px solid #cbd5e1;
        }
        .print-btn-secondary:hover {
          background: #f1f5f9;
        }

        .system-notice {
          text-align: center;
          color: #94a3b8;
          font-size: 11px;
          margin-top: 40px;
          border-top: 1px solid #e2e8f0;
          padding-top: 15px;
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
      <div class="print-btn-bar no-print">
        <button class="print-btn print-btn-secondary" onclick="window.close()">Cancel</button>
        <button class="print-btn print-btn-primary" onclick="window.print()">🖨️ Print Transfer Slip</button>
      </div>

      <div class="header">
        <div class="logo-section">
          <img src="/logo.png" alt="FiberWorld Communication" style="height: 55px; width: auto; object-fit: contain;" />
        </div>
        <div class="challan-title">
          <h1>TRANSFER SLIP</h1>
          <div class="challan-id">${t.id}</div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <h3>Routing Details</h3>
          <table class="meta-table">
            <tr>
              <td class="meta-label">From:</td>
              <td class="meta-val">${from}</td>
            </tr>
            <tr>
              <td class="meta-label">To:</td>
              <td class="meta-val">${to}</td>
            </tr>
          </table>
        </div>
        <div class="info-card">
          <h3>Transfer Metadata</h3>
          <table class="meta-table">
            <tr>
              <td class="meta-label">Date:</td>
              <td class="meta-val">${t.created}</td>
            </tr>
            <tr>
              <td class="meta-label">Status:</td>
              <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            </tr>
          </table>
        </div>
      </div>

      ${t.notes ? `
      <div class="notes-section">
        <div class="notes-title">Dispatch / Transfer Notes</div>
        <div class="notes-content">${t.notes}</div>
      </div>
      ` : ''}

      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">S.N.</th>
            <th style="text-align: left;">Item Description</th>
            <th style="width: 120px; text-align: center;">Type</th>
            <th style="width: 80px; text-align: center;">Qty</th>
            <th style="text-align: left;">Serial / MAC Numbers</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="signature-section">
        <div class="signature-box">
          <div class="signature-title">Dispatched By (Sender Storekeeper)</div>
          <div class="signature-line">
            <div>Name: ${dispatchName}</div>
            <div style="margin-top: 8px; display: flex; align-items: center;">Signature: ${dispatchSig}</div>
            <div style="margin-top: 8px;">Date: ${dispatchDate}</div>
            ${showActualDispatcher ? `<div style="margin-top: 12px; font-size: 11px; color: #475569; border-top: 1px dashed #cbd5e1; padding-top: 6px;"><strong>Actual Dispatcher:</strong> ${t.dispatched_by}</div>` : ''}
          </div>
        </div>
        <div class="signature-box">
          <div class="signature-title">Received By (Branch Storekeeper / Tech)</div>
          <div class="signature-line">
            <div>Name: ${receiveName}</div>
            <div style="margin-top: 8px; display: flex; align-items: center;">Signature: ${receiveSig}</div>
            <div style="margin-top: 8px;">Date: ${receiveDate}</div>
            ${showActualReceiver ? `<div style="margin-top: 12px; font-size: 11px; color: #475569; border-top: 1px dashed #cbd5e1; padding-top: 6px;"><strong>Actual Receiver:</strong> ${t.acknowledged_by}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="system-notice">
        This is a system-generated goods transfer receipt and gate pass. Please place this paper in the cartoon/box of stock.
      </div>
      
      <script>
        // Auto trigger print dialog when window is fully loaded
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            window.print();
          }, 500);
        });
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

function dispatchTransfer(id) {
  const t = DB.transfers.find(x => x.id === id);
  if (!t) return;
  const user = getCurrentUser();
  const defaultName = user ? user.name : '';
  App.showModal('Confirm Dispatch', `
    <p style="margin-bottom:16px;color:var(--text-secondary)">Confirm dispatching transfer <strong>${id}</strong>. This will mark all listed items as In Transit.</p>
    <div class="fg"><label class="fl">Dispatched By</label><input class="fi" id="disp-by" value="${defaultName}" placeholder="Your name"/></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'🚚 Confirm Dispatch', cls:'btn-primary', onclick:`confirmDispatch('${id}')` }
  ]);
}

async function confirmDispatch(id) {
  const dispBy = document.getElementById('disp-by')?.value?.trim() || getCurrentUser()?.name || 'Unknown';
  try {
    await DB.startTransferDispatch(id, dispBy);
    App.closeModal();
    App.toast(`Transfer ${id} dispatched — items marked In Transit`, 'success');
    App.navigate('transfers');
  } catch (e) {
    App.toast(`Failed to dispatch transfer: ${e.message}`, 'error');
  }
}

function acknowledgeTransfer(id) {
  const t = DB.transfers.find(x => x.id === id);
  if (!t) return;
  const user = getCurrentUser();
  const defaultName = user ? user.name : '';
  App.showModal('Acknowledge Receipt', `
    <p style="margin-bottom:16px;color:var(--text-secondary)">Confirm physical receipt of all items listed in transfer <strong>${id}</strong>. This action will update stock balances at <strong>${DB.getLocation(t.to_loc)?.name}</strong>.</p>
    <div class="fg"><label class="fl">Received By</label><input class="fi" id="ack-by" value="${defaultName}" placeholder="Your name"/></div>
    <div class="fg"><label class="fl">Condition</label><select class="fi" id="ack-cond"><option>All Good</option><option>Minor Damage to Packaging</option><option>Items Missing</option></select></div>
    <div class="fg"><label class="fl">Notes</label><textarea class="fi" id="ack-notes" rows="2"></textarea></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'✓ Confirm Receipt', cls:'btn-success', onclick:`confirmAck('${id}')` }
  ]);
}

async function confirmAck(id) {
  const ackBy = document.getElementById('ack-by')?.value?.trim() || getCurrentUser()?.name || 'Unknown';
  const ackNotes = document.getElementById('ack-notes')?.value?.trim() || '';
  const ackCond = document.getElementById('ack-cond')?.value || 'All Good';
  try {
    await DB.completeTransferAcknowledge(id, ackBy, ackNotes, ackCond);
    App.closeModal();
    App.toast(`Transfer ${id} acknowledged — stock updated`, 'success');
    App.navigate('transfers');
  } catch (e) {
    App.toast(`Failed to acknowledge transfer: ${e.message}`, 'error');
  }
}

function openNewRequisition() { App.navigate('requisitions'); }

let dtRowCounter = 0;

function openDirectTransferModal() {
  dtRowCounter = 0;
  const user = getCurrentUser();
  const defaultName = user ? user.name : '';
  const fromOptions = DB.locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  const firstLoc = DB.locations[0]?.id || 'LOC001';
  const toOptions = DB.locations.filter(l => l.id !== firstLoc).map(l => `<option value="${l.id}">${l.name}</option>`).join('');

  App.showModal('Direct Goods Transfer', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="fg">
        <label class="fl">From Location (Source)</label>
        <select class="fi" id="dt-from-loc" onchange="changeDirectTransferSource(this.value)">
          ${fromOptions}
        </select>
      </div>
      <div class="fg">
        <label class="fl">To Location (Destination)</label>
        <select class="fi" id="dt-to-loc">
          ${toOptions}
        </select>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="fg">
        <label class="fl">Dispatched By</label>
        <input class="fi" id="dt-disp-by" value="${defaultName}" placeholder="Your name"/>
      </div>
      <div class="fg">
        <label class="fl">Transfer Notes</label>
        <input class="fi" id="dt-notes" placeholder="Reason or reference"/>
      </div>
    </div>

    <div class="fg" style="margin-bottom:8px">
      <label class="fl" style="font-weight:600;display:flex;justify-content:space-between;align-items:center">
        <span>Transfer Items</span>
        <button class="btn btn-sm btn-secondary" onclick="addDirectTransferItemRow()" style="padding:4px 8px">+ Add Item</button>
      </label>
    </div>

    <div id="dt-items-container" style="display:flex;flex-direction:column;gap:12px;max-height:300px;overflow-y:auto;padding-right:4px;margin-bottom:16px"></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'🚚 Submit Direct Transfer', cls:'btn-primary', onclick:'saveDirectTransfer()' }
  ]);

  // Add first empty item row automatically
  addDirectTransferItemRow();
}
window.openDirectTransferModal = openDirectTransferModal;

function changeDirectTransferSource(fromLoc) {
  // Clear item rows
  const container = document.getElementById('dt-items-container');
  if (container) container.innerHTML = '';
  
  // Re-build To Location options excluding fromLoc
  const toSelect = document.getElementById('dt-to-loc');
  if (toSelect) {
    toSelect.innerHTML = DB.locations
      .filter(l => l.id !== fromLoc)
      .map(l => `<option value="${l.id}">${l.name}</option>`)
      .join('');
  }
}
window.changeDirectTransferSource = changeDirectTransferSource;

function addDirectTransferItemRow() {
  dtRowCounter++;
  const rowId = `dt-row-${dtRowCounter}`;
  
  // Build items dropdown options
  const itemOptions = `<option value="">-- Select Item --</option>` + DB.items.map(i => `<option value="${i.id}">${i.name} (${i.category})</option>`).join('');
  
  const rowHtml = `
    <div class="card" id="${rowId}" style="padding:12px;border:1px solid var(--border);position:relative;background:var(--bg-card2)">
      <button onclick="removeDirectTransferRow('${rowId}')" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px" title="Remove Item">✕</button>
      
      <div class="fg" style="margin-bottom:8px;max-width:calc(100% - 24px)">
        <label class="fl">Item</label>
        <select class="fi" name="dt-item-select" onchange="changeDirectTransferItem(this, '${rowId}')">
          ${itemOptions}
        </select>
      </div>
      
      <div id="${rowId}-details" style="margin-top:8px"></div>
    </div>
  `;
  
  const container = document.getElementById('dt-items-container');
  if (container) {
    container.insertAdjacentHTML('beforeend', rowHtml);
  }
}
window.addDirectTransferItemRow = addDirectTransferItemRow;

function removeDirectTransferRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
}
window.removeDirectTransferRow = removeDirectTransferRow;

function changeDirectTransferItem(selectElem, rowId) {
  const itemId = selectElem.value;
  const detailsDiv = document.getElementById(`${rowId}-details`);
  if (!detailsDiv) return;
  
  if (!itemId) {
    detailsDiv.innerHTML = '';
    return;
  }
  
  const item = DB.getItem(itemId);
  const fromLoc = document.getElementById('dt-from-loc').value;
  
  if (item.category === 'Asset') {
    // Renders checklist of available serial numbers at fromLoc
    const avail = DB.serialized.filter(s => s.item_id === itemId && s.status === 'Available' && s.loc_id === fromLoc);
    
    const rowsHtml = avail.map(s => `
      <label class="serial-row" data-search="${s.sn.toLowerCase()} ${(s.mac||'').toLowerCase()}" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:var(--transition);background:rgba(255,255,255,0.01);margin-bottom:2px">
        <input type="checkbox" name="${rowId}-serial" value="${s.sn}" style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer" onchange="updateDirectTransferCheckCount('${rowId}')" />
        <span class="mono" style="font-size:12px;color:var(--text-primary)">SN: ${s.sn} <span style="color:var(--text-muted);font-size:11px">(MAC: ${s.mac || 'N/A'})</span></span>
      </label>
    `).join('');
    
    detailsDiv.innerHTML = `
      <div style="font-weight:600;font-size:12px;margin-bottom:6px;display:flex;justify-content:space-between">
        <span>Select Serial Numbers</span>
        <span class="text-accent" id="${rowId}-check-count">Selected: 0</span>
      </div>
      <div style="position:relative;margin-bottom:6px">
        <input type="text" class="fi" placeholder="🔍 Filter serials..." style="font-size:11px;padding:4px 8px;height:28px" oninput="filterDirectTransferSerials('${rowId}', this.value)" />
      </div>
      <div id="${rowId}-checklist" style="border:1px solid var(--border);border-radius:8px;max-height:140px;overflow-y:auto;background:var(--bg-card);padding:6px;display:flex;flex-direction:column;gap:2px">
        ${rowsHtml || `<div class="text-muted fs-11" style="padding:10px;text-align:center">No available serials in this location</div>`}
      </div>
    `;
  } else {
    // Renders quantity input for consumable
    const availQty = DB.consumable_stock
      .filter(c => c.item_id === itemId && c.loc_id === fromLoc)
      .reduce((sum, c) => sum + c.qty, 0);
      
    detailsDiv.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end">
        <div class="fg" style="margin-bottom:0">
          <label class="fl">Transfer Qty (${item.uom})</label>
          <input type="number" class="fi" name="${rowId}-qty" min="1" max="${availQty}" value="1" style="height:38px" />
        </div>
        <div style="padding:8px 0;font-size:12px;font-weight:600;color:var(--text-secondary)">
          Available Stock: <span class="${availQty > 0 ? 'text-green' : 'text-red'}">${availQty} ${item.uom}</span>
        </div>
      </div>
    `;
  }
}
window.changeDirectTransferItem = changeDirectTransferItem;

function updateDirectTransferCheckCount(rowId) {
  const checks = document.querySelectorAll(`input[name="${rowId}-serial"]:checked`);
  const msg = document.getElementById(`${rowId}-check-count`);
  if (msg) {
    msg.textContent = `Selected: ${checks.length}`;
  }
}
window.updateDirectTransferCheckCount = updateDirectTransferCheckCount;

function filterDirectTransferSerials(rowId, query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll(`#${rowId}-checklist .serial-row`);
  rows.forEach(row => {
    const text = row.getAttribute('data-search') || '';
    if (!q || text.includes(q)) {
      row.style.display = 'flex';
    } else {
      row.style.display = 'none';
    }
  });
}
window.filterDirectTransferSerials = filterDirectTransferSerials;

async function saveDirectTransfer() {
  const fromLoc = document.getElementById('dt-from-loc').value;
  const toLoc = document.getElementById('dt-to-loc').value;
  const dispBy = document.getElementById('dt-disp-by')?.value?.trim() || getCurrentUser()?.name || 'Unknown';
  const notes = document.getElementById('dt-notes')?.value?.trim() || '';
  
  if (fromLoc === toLoc) {
    App.toast('Source and destination locations cannot be the same', 'error');
    return;
  }
  
  const itemRows = document.querySelectorAll('#dt-items-container > .card');
  if (itemRows.length === 0) {
    App.toast('Please add at least one item to transfer', 'error');
    return;
  }
  
  const trfItems = [];
  const nextId = DB.nextId('TRF', DB.transfers);
  
  for (const row of itemRows) {
    const rowId = row.id;
    const itemSelect = row.querySelector('select[name="dt-item-select"]');
    const itemId = itemSelect?.value;
    
    if (!itemId) {
      App.toast('Please select an item for all added rows or remove the empty rows', 'error');
      return;
    }
    
    const item = DB.getItem(itemId);
    
    if (item.category === 'Asset') {
      const checkedInputs = row.querySelectorAll(`input[name="${rowId}-serial"]:checked`);
      const selectedSerials = Array.from(checkedInputs).map(chk => chk.value);
      
      if (selectedSerials.length === 0) {
        App.toast(`Please select at least one serial number for "${item.name}"`, 'error');
        return;
      }
      
      trfItems.push({ item_id: itemId, serials: selectedSerials, qty: 0 });
    } else {
      const qtyInput = row.querySelector(`input[name="${rowId}-qty"]`);
      const qty = parseInt(qtyInput?.value || '0', 10);
      
      if (isNaN(qty) || qty <= 0) {
        App.toast(`Please enter a valid quantity for "${item.name}"`, 'error');
        return;
      }
      
      // Validate consumable stock limits at source
      const availQty = DB.consumable_stock
        .filter(c => c.item_id === itemId && c.loc_id === fromLoc)
        .reduce((sum, c) => sum + c.qty, 0);
        
      if (qty > availQty) {
        App.toast(`Insufficient stock for "${item.name}". Available: ${availQty}, Requested: ${qty}`, 'error');
        return;
      }
      
      trfItems.push({ item_id: itemId, serials: [], qty: qty });
    }
  }
  
  try {
    await DB.saveTransfer({
      id: nextId,
      from_loc: fromLoc,
      to_loc: toLoc,
      status: 'In_Transit',
      notes: notes || 'Direct Admin Transfer',
      created_by: getCurrentUser().role,
      dispatched_by: dispBy,
      items: trfItems
    });
    
    App.closeModal();
    App.toast(`Direct transfer ${nextId} created successfully!`, 'success');
    App.navigate('transfers');
  } catch (e) {
    App.toast(`Failed to save direct transfer: ${e.message}`, 'error');
  }
}
window.saveDirectTransfer = saveDirectTransfer;

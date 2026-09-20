
// ═══════════════════════════════════════
// View: Requisitions (Stock Request Vouchers)
// ═══════════════════════════════════════
function renderRequisitions() {
  const user = getCurrentUser();
  const statusMap = {'Pending':'badge-yellow','Approved':'badge-blue','Fulfilled':'badge-green','Rejected':'badge-red'};
  const reqs = user.role==='branch_storekeeper'
    ? DB.requisitions.filter(r=>r.from_loc===user.location_id)
    : DB.requisitions;

  const rows = reqs.map(r => {
    const from = DB.getLocation(r.from_loc)?.name||r.from_loc;
    const itemCount = r.items.reduce((s,i)=>s+i.qty,0);
    const actions = {
      'Pending': user.role==='central_manager'||user.role==='super_admin'
        ? `<button class="btn btn-sm btn-primary" onclick="approveReq('${r.id}')">Approve & Dispatch</button> <button class="btn btn-sm btn-danger" onclick="rejectReq('${r.id}')">Reject</button>`
        : `<span class="text-muted fs-11">Awaiting approval</span>`,
      'Approved': `<button class="btn btn-sm btn-success" onclick="fulfillReq('${r.id}')">Mark Fulfilled</button>`,
      'Fulfilled': `<span class="text-muted fs-11">Completed</span>`,
      'Rejected': `<span class="text-muted fs-11">Rejected</span>`,
    };
    return `<tr>
      <td class="mono fw-600">${r.id}</td>
      <td><div class="fw-600">${from}</div></td>
      <td class="fs-12">${r.items.map(i=>DB.getItem(i.item_id)?.name+' × '+i.qty).join(', ')}</td>
      <td class="mono">${itemCount}</td>
      <td>${r.created}</td>
      <td><span class="badge ${statusMap[r.status]||'badge-gray'}">${r.status}</span></td>
      <td>${actions[r.status]||''} <button class="btn btn-sm btn-secondary" onclick="viewReq('${r.id}')">View</button></td>
    </tr>`;
  }).join('');

  return `
  <div class="view-header">
    <div><div class="view-title">☰ Stock Requests</div><div class="view-subtitle">Stock Request Vouchers — 3-step branch replenishment workflow</div></div>
    <div class="view-actions">
      ${user.role==='branch_storekeeper'||user.role==='super_admin' ? '<button class="btn btn-primary btn-sm" onclick="openNewReq()">+ New Stock Request</button>' : ''}
    </div>
  </div>

  <div class="card mb-16" style="background:var(--accent-soft);border-color:rgba(99,102,241,0.3)">
    <div style="display:flex;gap:24px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div class="fw-600 text-accent mb-8">📋 Step 1 — Request</div>
        <div class="fs-12 text-secondary">Branch creates Stock Request Voucher with required items & quantities. Status = Pending.</div>
      </div>
      <div style="color:var(--text-muted);font-size:20px;display:flex;align-items:center">→</div>
      <div style="flex:1;min-width:200px">
        <div class="fw-600 mb-8" style="color:var(--blue)">📦 Step 2 — Dispatch</div>
        <div class="fs-12 text-secondary">Central Manager selects exact Serial Numbers for assets. Stock becomes In Transit.</div>
      </div>
      <div style="color:var(--text-muted);font-size:20px;display:flex;align-items:center">→</div>
      <div style="flex:1;min-width:200px">
        <div class="fw-600 text-green mb-8">✅ Step 3 — Acknowledge</div>
        <div class="fs-12 text-secondary">Branch confirms physical receipt. Serial Numbers update to Branch location.</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-hdr">
      <div class="card-title">Stock Request Vouchers</div>
      <select class="filter-select" id="req-filter" onchange="filterReqs()">
        <option value="">All Statuses</option>
        <option value="Pending">Pending</option>
        <option value="Approved">Approved</option>
        <option value="Fulfilled">Fulfilled</option>
        <option value="Rejected">Rejected</option>
      </select>
    </div>
    <div class="table-wrap" id="req-table">
      <table><thead><tr><th>Voucher ID</th><th>Requesting Branch</th><th>Items Requested</th><th>Total Qty</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="req-tbody">${rows}</tbody></table>
    </div>
  </div>`;
}

function filterReqs() {
  const f = document.getElementById('req-filter')?.value;
  const user = getCurrentUser();
  let reqs = user.role==='branch_storekeeper' ? DB.requisitions.filter(r=>r.from_loc===user.location_id) : DB.requisitions;
  if(f) reqs = reqs.filter(r=>r.status===f);
  const statusMap = {'Pending':'badge-yellow','Approved':'badge-blue','Fulfilled':'badge-green','Rejected':'badge-red'};
  document.getElementById('req-tbody').innerHTML = reqs.map(r=>{
    const from=DB.getLocation(r.from_loc)?.name||r.from_loc;
    const itemCount=r.items.reduce((s,i)=>s+i.qty,0);
    const actions = { 'Pending': user.role!=='branch_storekeeper' ? `<button class="btn btn-sm btn-primary" onclick="approveReq('${r.id}')">Approve</button>` : '', 'Approved':`<button class="btn btn-sm btn-success" onclick="fulfillReq('${r.id}')">Fulfill</button>`, 'Fulfilled':'', 'Rejected':'' };
    return `<tr><td class="mono fw-600">${r.id}</td><td>${from}</td><td class="fs-12">${r.items.map(i=>DB.getItem(i.item_id)?.name+' × '+i.qty).join(', ')}</td><td class="mono">${itemCount}</td><td>${r.created}</td><td><span class="badge ${statusMap[r.status]||'badge-gray'}">${r.status}</span></td><td>${actions[r.status]||''} <button class="btn btn-sm btn-secondary" onclick="viewReq('${r.id}')">View</button></td></tr>`;
  }).join('');
}

function getReqItemOptions() {
  const user = getCurrentUser();
  const isBranch = user && user.role === 'branch_storekeeper';
  
  // Filter out core network infrastructure blueprint models from stock requests
  const filterItems = DB.items.filter(i => !i.is_infrastructure);
  
  return filterItems.map(i => {
    if (isBranch) {
      return `<option value="${i.id}">${i.name}</option>`;
    }
    let avail = 0;
    if (i.category === 'Asset') {
      avail = DB.serialized.filter(s => s.item_id === i.id && s.status === 'Available' && s.loc_id === 'LOC001').length;
    } else {
      avail = DB.consumable_stock.filter(c => c.item_id === i.id && c.loc_id === 'LOC001').reduce((sum, c) => sum + c.qty, 0);
    }
    return `<option value="${i.id}">${i.name} [Central Stock: ${avail} ${i.uom}]</option>`;
  }).join('');
}

function openNewReq() {
  const user = getCurrentUser();
  const locOpts = user.role==='branch_storekeeper'
    ? `<option value="${user.location_id}" selected>${user.location_name}</option>`
    : DB.locations.filter(l=>l.type==='Branch').map(l=>`<option value="${l.id}">${l.name}</option>`).join('');
  const itemOpts = getReqItemOptions();
  App.showModal('New Stock Request Voucher', `
    <div class="fg"><label class="fl">Requesting Branch</label>
      <select class="fi" id="req-from">${locOpts}</select></div>
    <div id="req-items-list">
      <div class="req-item-row" style="display:flex;gap:8px;margin-bottom:8px">
        <select class="fi" name="ri-item" style="flex:2">${itemOpts}</select>
        <input type="number" class="fi" name="ri-qty" placeholder="Qty" min="1" style="flex:0.8"/>
        <button class="btn btn-sm btn-danger" onclick="removeReqRow(this)">−</button>
      </div>
    </div>
    <button class="btn btn-sm btn-secondary mb-16" onclick="addReqRow()">+ Add Item</button>
    <div class="fg"><label class="fl">Notes</label><textarea class="fi" id="req-notes" rows="2" placeholder="Reason for request..."></textarea></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'Submit Request', cls:'btn-primary', onclick:'submitReq()' }
  ]);
}

function addReqRow() {
  const itemOpts = getReqItemOptions();
  const row = document.createElement('div');
  row.className = 'req-item-row';
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
  row.innerHTML = `<select class="fi" name="ri-item" style="flex:2">${itemOpts}</select><input type="number" class="fi" name="ri-qty" placeholder="Qty" min="1" style="flex:0.8"/><button class="btn btn-sm btn-danger" onclick="removeReqRow(this)">−</button>`;
  document.getElementById('req-items-list').appendChild(row);
}

function removeReqRow(btn) {
  const rows = document.querySelectorAll('.req-item-row');
  if(rows.length > 1) btn.parentElement.remove();
}

async function submitReq() {
  const fromLoc = document.getElementById('req-from')?.value;
  const notes = document.getElementById('req-notes')?.value;
  const rows = document.querySelectorAll('.req-item-row');
  const items = [];
  rows.forEach(row => {
    const item = row.querySelector('[name="ri-item"]')?.value;
    const qty = parseInt(row.querySelector('[name="ri-qty"]')?.value);
    if(item && qty > 0) items.push({ item_id:item, qty });
  });
  if(!items.length){ App.toast('Add at least one item','error'); return; }

  // Check if any requested item quantity exceeds available Central stock (skip for branch storekeepers to prevent stock leaks)
  const user = getCurrentUser();
  const isBranch = user && user.role === 'branch_storekeeper';
  
  if (!isBranch) {
    const warnings = [];
    items.forEach(item => {
      const it = DB.getItem(item.item_id);
      let avail = 0;
      if (it?.category === 'Asset') {
        avail = DB.serialized.filter(s => s.item_id === item.item_id && s.status === 'Available' && s.loc_id === 'LOC001').length;
      } else {
        avail = DB.consumable_stock.filter(c => c.item_id === item.item_id && c.loc_id === 'LOC001').reduce((sum, c) => sum + c.qty, 0);
      }
      if (item.qty > avail) {
        warnings.push(`• ${it?.name}: Requested ${item.qty} ${it?.uom}, but only ${avail} available in Central Warehouse`);
      }
    });

    if (warnings.length > 0) {
      const confirmMsg = `⚠️ Stock Availability Alert\n\nThe following items exceed current Central Warehouse stock levels:\n\n${warnings.join('\n')}\n\nDo you still want to proceed with this request?`;
      if (!confirm(confirmMsg)) {
        return;
      }
    }
  }
  const id = DB.nextId('REQ', DB.requisitions);
  
  try {
    await DB.saveRequisition({
      id,
      from_loc: fromLoc,
      notes: notes,
      created_by: getCurrentUser().role,
      items
    });
    App.closeModal();
    App.toast(`Requisition ${id} submitted`, 'success');
    App.navigate('requisitions');
  } catch (e) {
    App.toast(`Failed to submit requisition: ${e.message}`, 'error');
  }
}

function viewReq(id) {
  const r = DB.requisitions.find(x=>x.id===id);
  const from = DB.getLocation(r.from_loc)?.name;
  const statusMap = {'Pending':'badge-yellow','Approved':'badge-blue','Fulfilled':'badge-green','Rejected':'badge-red'};
  const user = getCurrentUser();
  const isBranch = user && user.role === 'branch_storekeeper';
  
  const itemRows = r.items.map(i=>{
    const it=DB.getItem(i.item_id);
    if (isBranch) {
      return `<tr><td>${it?.name}</td><td><span class="badge badge-${it?.category==='Asset'?'purple':'blue'}">${it?.category}</span></td><td class="mono">${i.qty} ${it?.uom}</td></tr>`;
    }
    const avail = it?.category==='Asset' ? DB.serialized.filter(s=>s.item_id===i.item_id&&s.status==='Available'&&s.loc_id==='LOC001').length : DB.consumable_stock.filter(c=>c.item_id===i.item_id&&c.loc_id==='LOC001').reduce((s,c)=>s+c.qty,0);
    return `<tr><td>${it?.name}</td><td><span class="badge badge-${it?.category==='Asset'?'purple':'blue'}">${it?.category}</span></td><td class="mono">${i.qty} ${it?.uom}</td><td class="mono ${avail>=i.qty?'text-green':'text-red'}">${avail} available</td></tr>`;
  }).join('');
  
  const tableHeader = isBranch
    ? `<thead><tr><th>Item</th><th>Type</th><th>Requested</th></tr></thead>`
    : `<thead><tr><th>Item</th><th>Type</th><th>Requested</th><th>Central Stock</th></tr></thead>`;

  App.showModal(`Requisition ${id}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="fg"><label class="fl">From</label><input class="fi" value="${from}" readonly/></div>
      <div class="fg"><label class="fl">Status</label><div style="padding:8px 0"><span class="badge ${statusMap[r.status]}">${r.status}</span></div></div>
      <div class="fg"><label class="fl">Date</label><input class="fi" value="${r.created}" readonly/></div>
    </div>
    ${r.notes?`<div class="fg"><label class="fl">Notes</label><input class="fi" value="${r.notes}" readonly/></div>`:''}
    <div class="table-wrap"><table>${tableHeader}<tbody>${itemRows}</tbody></table></div>
  `, [{ label:'Close', cls:'btn-secondary', onclick:'App.closeModal()' }]);
}

async function approveReq(id) {
  const r = DB.requisitions.find(x=>x.id===id);
  if(!r) return;

  // Check if requisition contains any Assets requiring manual serial selection
  const hasAssets = r.items.some(i => DB.getItem(i.item_id)?.category === 'Asset');
  
  if (!hasAssets) {
    // If only consumables, show a modal to verify dispatched_by
    const user = getCurrentUser();
    const defaultName = user ? user.name : '';
    App.showModal('Confirm Consumables Dispatch', `
      <p style="margin-bottom:16px;color:var(--text-secondary)">Confirm dispatching requisition <strong>${id}</strong> (Consumables only).</p>
      <div class="fg"><label class="fl">Dispatched By</label><input class="fi" id="disp-by" value="${defaultName}" placeholder="Your name"/></div>
    `, [
      { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
      { label:'🚚 Confirm & Dispatch', cls:'btn-primary', onclick:`confirmConsumableDispatch('${id}', '${r.from_loc}')` }
    ]);
    return;
  }

  // If assets exist, open the manual selection screen
  let itemSelectionHtml = '';
  
  r.items.forEach((item, index) => {
    const it = DB.getItem(item.item_id);
    if (it?.category === 'Asset') {
      const avail = DB.serialized.filter(s => s.item_id === item.item_id && s.status === 'Available' && s.loc_id === 'LOC001');
      
      const rowsHtml = avail.map(s => `
        <label class="serial-row" data-search="${s.sn.toLowerCase()} ${(s.mac||'').toLowerCase()}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:var(--transition);background:rgba(255,255,255,0.01);margin-bottom:2px">
          <input type="checkbox" name="chk-serials-${index}" value="${s.sn}" style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer" onchange="updateCheckCount('${index}', ${item.qty})" />
          <span class="mono" style="font-size:12px;color:var(--text-primary)">SN: ${s.sn} <span style="color:var(--text-muted);font-size:11px">(MAC: ${s.mac || 'N/A'})</span></span>
        </label>
      `).join('');
      
      itemSelectionHtml += `
        <div class="fg" style="margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:16px">
          <div style="font-weight:600;font-size:13px;margin-bottom:8px;display:flex;justify-content:space-between">
            <span>📦 ${it.name}</span>
            <span class="text-accent fw-600">Select exactly ${item.qty} units</span>
          </div>
          
          <!-- Live search field for this hardware shelf -->
          <div style="position:relative;margin-bottom:8px">
            <input type="text" class="fi" placeholder="🔍 Type Serial or MAC to search..." style="font-size:12px;padding-right:12px" oninput="filterSerialsList('${index}', this.value)" />
          </div>
          
          <!-- Scrollable checklist container -->
          <div id="checklist-${index}" style="border:1px solid var(--border);border-radius:8px;max-height:180px;overflow-y:auto;background:var(--bg-card2);padding:6px;display:flex;flex-direction:column;gap:2px">
            ${rowsHtml || '<div class="text-muted fs-12" style="padding:10px;text-align:center">No available serials in Central Hub</div>'}
          </div>
          
          <div class="fs-11 text-muted mt-8" id="count-msg-${index}" style="font-weight:500">Selected: 0 of ${item.qty}</div>
        </div>
      `;
    } else {
      itemSelectionHtml += `
        <div class="fg" style="margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:16px">
          <div style="font-weight:600;font-size:13px">📦 ${it?.name}</div>
          <div class="fs-12 text-secondary mt-8">Quantity to transfer: ${item.qty} ${it?.uom || 'units'} (Consumable - handled automatically)</div>
        </div>
      `;
    }
  });

  const user = getCurrentUser();
  const defaultName = user ? user.name : '';

  App.showModal(`Warehouse Dispatch Selection — Requisition ${id}`, `
    <p class="text-secondary mb-16 fs-12">Search and check/tick the exact Serial Numbers you pulled physically from the warehouse shelves to dispatch.</p>
    <div id="selection-area">${itemSelectionHtml}</div>
    <div class="fg" style="margin-top:16px; border-top:1.5px solid var(--border); padding-top:16px">
      <label class="fl" style="font-weight:600">Dispatched By</label>
      <input class="fi" id="disp-by" value="${defaultName}" placeholder="Your name"/>
    </div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'🚚 Dispatch Selected Stock', cls:'btn-primary', onclick:`confirmManualDispatch('${id}')` }
  ]);
}

async function confirmConsumableDispatch(id, fromLoc) {
  const r = DB.requisitions.find(x=>x.id===id);
  if(!r) return;
  const dispBy = document.getElementById('disp-by')?.value?.trim() || getCurrentUser()?.name || 'Unknown';
  const tId = DB.nextId('TRF', DB.transfers);
  const trfItems = r.items.map(item => ({ item_id:item.item_id, serials:[], qty:item.qty }));
  
  try {
    await DB.saveTransfer({
      id: tId,
      from_loc: 'LOC001',
      to_loc: fromLoc,
      status: 'In_Transit',
      notes: `Requisition ${id}`,
      created_by: 'central_manager',
      dispatched_by: dispBy,
      items: trfItems
    });
    await DB.updateRequisitionStatus(id, 'Approved');
    App.closeModal();
    App.toast(`Requisition ${id} approved — Transfer ${tId} created`, 'success');
    App.navigate('requisitions');
  } catch (e) {
    App.toast(`Failed to approve requisition: ${e.message}`, 'error');
  }
}
window.confirmConsumableDispatch = confirmConsumableDispatch;

function filterSerialsList(index, query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll(`#checklist-${index} .serial-row`);
  rows.forEach(row => {
    const text = row.getAttribute('data-search') || '';
    if (!q || text.includes(q)) {
      row.style.display = 'flex';
    } else {
      row.style.display = 'none';
    }
  });
}
window.filterSerialsList = filterSerialsList;

function updateCheckCount(index, required) {
  const checks = document.querySelectorAll(`input[name="chk-serials-${index}"]:checked`);
  const msg = document.getElementById(`count-msg-${index}`);
  if (msg) {
    const selectedCount = checks.length;
    msg.textContent = `Selected: ${selectedCount} of ${required}`;
    if (selectedCount === required) {
      msg.className = 'fs-11 mt-8 text-green fw-600';
    } else if (selectedCount > required) {
      msg.className = 'fs-11 mt-8 text-red fw-600';
    } else {
      msg.className = 'fs-11 mt-8 text-muted';
    }
  }
}
window.updateCheckCount = updateCheckCount;

async function confirmManualDispatch(id) {
  const r = DB.requisitions.find(x=>x.id===id);
  if(!r) return;

  const tId = DB.nextId('TRF', DB.transfers);
  const trfItems = [];

  for (let index = 0; index < r.items.length; index++) {
    const item = r.items[index];
    const it = DB.getItem(item.item_id);
    
    if (it?.category === 'Asset') {
      const checkedInputs = document.querySelectorAll(`input[name="chk-serials-${index}"]:checked`);
      const selected = Array.from(checkedInputs).map(chk => chk.value);
      
      if (selected.length !== item.qty) {
        App.toast(`You must select exactly ${item.qty} units for "${it.name}" (selected ${selected.length})`, 'error');
        return;
      }
      
      trfItems.push({ item_id: item.item_id, serials: selected, qty: 0 });
    } else {
      trfItems.push({ item_id: item.item_id, serials: [], qty: item.qty });
    }
  }

  const dispBy = document.getElementById('disp-by')?.value?.trim() || getCurrentUser()?.name || 'Unknown';

  try {
    await DB.saveTransfer({ 
      id: tId, 
      from_loc: 'LOC001', 
      to_loc: r.from_loc, 
      status: 'In_Transit', 
      notes: `Manually dispatched from Req ${id}`, 
      created_by: 'central_manager',
      dispatched_by: dispBy,
      items: trfItems
    });
    
    await DB.updateRequisitionStatus(id, 'Approved');
    App.closeModal();
    App.toast(`Requisition ${id} dispatched! Transfer shipment ${tId} created with chosen serials.`, 'success');
    App.navigate('requisitions');
  } catch (e) {
    App.toast(`Failed to dispatch requisition: ${e.message}`, 'error');
  }
}
window.confirmManualDispatch = confirmManualDispatch;

async function rejectReq(id) {
  try {
    await DB.updateRequisitionStatus(id, 'Rejected');
    App.toast(`Requisition ${id} rejected`,'warning'); 
    App.navigate('requisitions'); 
  } catch (e) {
    App.toast(`Failed to reject requisition: ${e.message}`, 'error');
  }
}

async function fulfillReq(id) {
  try {
    await DB.updateRequisitionStatus(id, 'Fulfilled');
    App.toast(`Requisition ${id} marked as fulfilled`,'success'); 
    App.navigate('requisitions');
  } catch (e) {
    App.toast(`Failed to fulfill requisition: ${e.message}`, 'error');
  }
}

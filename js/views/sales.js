// ═══════════════════════════════════════
// View: Direct Outward Sales
// ═══════════════════════════════════════

let tempSalesGroups = {}; // Temporary cache to hold sales grouping for the modal actions

function renderSales() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  
  // Filter sold items based on user tenant
  const soldAssets = DB.serialized.filter(s => {
    if (s.status !== 'Sold') return false;
    if (isBranchKeeper && s.branch_id !== user.location_id) return false;
    return true;
  });

  // Group sold assets dynamically by invoice/date/buyer/warehouse/item/price
  tempSalesGroups = {};
  soldAssets.forEach(s => {
    const key = `${s.invoice_no || 'N/A'}_${s.sale_date || 'N/A'}_${s.loc_id || 'N/A'}_${s.branch_id || 'N/A'}_${s.item_id}_${s.sale_price || 0}`;
    if (!tempSalesGroups[key]) {
      tempSalesGroups[key] = {
        key: key,
        invoice_no: s.invoice_no,
        sale_date: s.sale_date,
        buyer: s.loc_id,
        branch_id: s.branch_id,
        item_id: s.item_id,
        sale_price: s.sale_price || 0,
        serials: [],
        notes: s.sale_notes || ''
      };
    }
    tempSalesGroups[key].serials.push(s.sn);
  });

  const groupedList = Object.values(tempSalesGroups);

  const rows = groupedList.map(group => {
    const it = DB.getItem(group.item_id);
    const origin = DB.getLocation(group.branch_id);
    const totalVal = Number(group.sale_price) * group.serials.length;
    
    return `<tr>
      <td class="mono fw-600">${group.invoice_no || '—'}</td>
      <td><div class="fw-600 fs-12">${it?.name || group.item_id}</div><div class="fs-11 text-muted">${it?.id || 'N/A'}</div></td>
      <td class="mono fw-700" style="color:var(--accent)">${group.serials.length.toLocaleString()} Pcs</td>
      <td><div class="fw-600">${group.buyer}</div></td>
      <td>${origin?.name || group.branch_id}</td>
      <td class="mono text-green fw-600">
        NPR ${Number(group.sale_price).toLocaleString()} 
        <div class="fs-11 text-muted" style="font-weight:400;margin-top:2px;">Total: NPR ${totalVal.toLocaleString()}</div>
      </td>
      <td>${group.sale_date || '—'}</td>
      <td style="display:flex;gap:8px;">
        <button class="btn btn-sm btn-secondary" onclick="openViewSerialsModal('${group.key}')" style="display:flex;align-items:center;gap:4px;">📄 View Serials</button>
        <button class="btn btn-sm btn-danger" onclick="cancelBulkDirectSale('${group.key}')">Cancel Sale</button>
      </td>
    </tr>`;
  }).join('');

  const totalRevenue = soldAssets.reduce((sum, s) => sum + (s.sale_price || 0), 0);

  return `
  <div class="view-header">
    <div><div class="view-title">💼 Direct Sales Ledger</div><div class="view-subtitle">Dispatch and track bulk device sales directly to external vendors/dealers</div></div>
    <div class="view-actions">
      <button class="btn btn-primary btn-sm" onclick="openNewDirectSale()">+ New Direct Sale</button>
    </div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
    <div class="stat-card" style="--stat-color:var(--accent)">
      <div class="stat-icon">📈</div>
      <div class="stat-val">${soldAssets.length}</div>
      <div class="stat-label">Total Units Sold</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--green)">
      <div class="stat-icon">💰</div>
      <div class="stat-val" style="font-size:18px">NPR ${(totalRevenue).toLocaleString()}</div>
      <div class="stat-label">Total Sales Revenue</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--purple)">
      <div class="stat-icon">💼</div>
      <div class="stat-val">${new Set(soldAssets.map(s=>s.loc_id)).size}</div>
      <div class="stat-label">Unique External Buyers</div>
    </div>
  </div>

  <div class="card">
    <div class="card-hdr"><div class="card-title">Direct Dispatches & External Sales Log</div></div>
    ${groupedList.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>Invoice / Ref</th><th>Item Model</th><th>Qty Sold</th><th>Buyer Name</th><th>Origin Warehouse</th><th>Selling Price</th><th>Sale Date</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : 
    `<div class="empty-state"><div class="es-icon" style="font-size:36px">💼</div><h3>No direct sales logged yet</h3><p>Click "+ New Direct Sale" to dispatch stock to an external vendor.</p></div>`}
  </div>`;
}

function openNewDirectSale() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  
  // Warehouse options
  const warehouseOpts = isBranchKeeper
    ? `<option value="${user.location_id}">${user.location_name}</option>`
    : DB.locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    
  // Asset items only
  const assetOpts = DB.items.filter(i => i.category === 'Asset').map(i => `<option value="${i.id}">${i.name}</option>`).join('');

  App.showModal('New Direct Outward Sale', `
    <div class="fg"><label class="fl">External Buyer Name</label><input class="fi" id="ds-buyer" placeholder="e.g. Vianet Communications, Dealer Ram" required/></div>
    <div class="grid-2 gap-12 mb-16">
      <div class="fg" style="margin-bottom:0"><label class="fl">Origin Warehouse</label>
        <select class="fi" id="ds-source" onchange="loadAvailableSerialsForSale()" ${isBranchKeeper?'disabled':''}>${warehouseOpts}</select></div>
      <div class="fg" style="margin-bottom:0"><label class="fl">Item Model</label>
        <select class="fi" id="ds-item" onchange="loadAvailableSerialsForSale()">${assetOpts}</select></div>
    </div>

    <!-- Available Serial Selection Checklist (Searchable) -->
    <div class="fg" style="margin-bottom:16px">
      <label class="fl">Select Serial Numbers</label>
      <div style="position:relative;margin-bottom:8px">
        <input type="text" class="fi" placeholder="🔍 Type Serial or MAC to search shelf..." style="font-size:12px" oninput="filterSaleSerials(this.value)" />
      </div>
      <div id="ds-checklist" style="border:1px solid var(--border);border-radius:8px;max-height:180px;overflow-y:auto;background:var(--bg-card2);padding:6px;display:flex;flex-direction:column;gap:2px">
        <!-- populated dynamically -->
      </div>
      <div class="fs-11 text-accent fw-600 mt-8" id="ds-selected-count">Selected: 0 units</div>
    </div>

    <div class="grid-2 gap-12 mb-16">
      <div class="fg" style="margin-bottom:0"><label class="fl">Unit Selling Price (NPR)</label><input type="number" class="fi" id="ds-price" placeholder="e.g. 5200" min="0"/></div>
      <div class="fg" style="margin-bottom:0"><label class="fl">Invoice / Reference #</label><input class="fi" id="ds-ref" placeholder="e.g. INV-2026-089"/></div>
    </div>
    <div class="fg"><label class="fl">Sale Date</label><input type="date" class="fi" id="ds-date"/></div>
    <div class="fg"><label class="fl">Notes</label><textarea class="fi" id="ds-notes" rows="2" placeholder="Optional notes..."></textarea></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'💼 Dispatch & Complete Sale', cls:'btn-primary', onclick:'saveDirectSale()' }
  ]);

  // Set today's date and load default serial list
  setTimeout(() => {
    const d = document.getElementById('ds-date');
    if (d) d.value = new Date().toISOString().slice(0,10);
    loadAvailableSerialsForSale();
  }, 50);
}

function loadAvailableSerialsForSale() {
  const source = document.getElementById('ds-source')?.value;
  const itemId = document.getElementById('ds-item')?.value;
  const it = DB.getItem(itemId);
  
  // Set default selling price based on catalog cost
  const priceInput = document.getElementById('ds-price');
  if (priceInput && it) priceInput.value = it.unit_cost || 5000;

  const list = document.getElementById('ds-checklist');
  if (!list || !source || !itemId) return;

  // Filter available serials in this warehouse
  const avail = DB.serialized.filter(s => s.item_id === itemId && s.status === 'Available' && s.loc_id === source);

  const rows = avail.map(s => `
    <label class="sale-serial-row" data-search="${s.sn.toLowerCase()} ${(s.mac||'').toLowerCase()}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:var(--transition);background:rgba(255,255,255,0.01);margin-bottom:2px">
      <input type="checkbox" name="chk-sale-serials" value="${s.sn}" style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer" onchange="updateSaleCheckCount()" />
      <span class="mono" style="font-size:12px;color:var(--text-primary)">SN: ${s.sn} <span style="color:var(--text-muted);font-size:11px">(MAC: ${s.mac || 'N/A'})</span></span>
    </label>
  `).join('');

  list.innerHTML = rows || '<div class="text-muted fs-12" style="padding:10px;text-align:center">No available serials in this warehouse</div>';
  updateSaleCheckCount();
}
window.loadAvailableSerialsForSale = loadAvailableSerialsForSale;

function filterSaleSerials(query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll('#ds-checklist .sale-serial-row');
  rows.forEach(row => {
    const text = row.getAttribute('data-search') || '';
    if (!q || text.includes(q)) {
      row.style.display = 'flex';
    } else {
      row.style.display = 'none';
    }
  });
}
window.filterSaleSerials = filterSaleSerials;

function updateSaleCheckCount() {
  const checks = document.querySelectorAll('input[name="chk-sale-serials"]:checked');
  const countDisplay = document.getElementById('ds-selected-count');
  if (countDisplay) {
    countDisplay.textContent = `Selected: ${checks.length} units`;
  }
}
window.updateSaleCheckCount = updateSaleCheckCount;

async function saveDirectSale() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';

  const buyer = document.getElementById('ds-buyer')?.value;
  const source = isBranchKeeper ? user.location_id : document.getElementById('ds-source')?.value;
  const price = parseInt(document.getElementById('ds-price')?.value || 0);
  const ref = document.getElementById('ds-ref')?.value || 'N/A';
  const date = document.getElementById('ds-date')?.value;
  const notes = document.getElementById('ds-notes')?.value;

  if (!buyer) { App.toast('Buyer / External Vendor name is required', 'error'); return; }

  const checkedInputs = document.querySelectorAll('input[name="chk-sale-serials"]:checked');
  const selectedSerials = Array.from(checkedInputs).map(chk => chk.value);

  if (selectedSerials.length === 0) {
    App.toast('Select at least one serial number to sell', 'error');
    return;
  }

  try {
    await DB.post('/api/serialized/sell', {
      sns: selectedSerials,
      buyer,
      price,
      ref,
      date,
      notes,
      source
    });
    await DB.load();
    App.closeModal();
    App.toast(`${selectedSerials.length} device(s) successfully sold & dispatched to ${buyer}`, 'success');
    App.navigate('sales');
  } catch (e) {
    App.toast(`Failed to complete sale: ${e.message}`, 'error');
  }
}
window.saveDirectSale = saveDirectSale;

// Cancel the entire bulk dispatch in a single atomic database operation
async function cancelBulkDirectSale(key) {
  const group = tempSalesGroups[key];
  if (!group) return;
  const origin = DB.getLocation(group.branch_id);

  if (confirm(`Are you sure you want to cancel the bulk sale of ${group.serials.length} units to ${group.buyer}? All items will be returned back to ${origin?.name || 'Branch'} available warehouse inventory.`)) {
    try {
      await DB.post('/api/serialized/cancel-bulk-sale', { sns: group.serials });
      await DB.load();
      App.toast(`Bulk sale cancelled. ${group.serials.length} items returned to available inventory.`, 'success');
      App.navigate('sales');
    } catch (e) {
      App.toast(`Failed to cancel bulk sale: ${e.message}`, 'error');
    }
  }
}
window.cancelBulkDirectSale = cancelBulkDirectSale;

// Modal viewer to list serial numbers inside the bulk transaction
function openViewSerialsModal(key) {
  const group = tempSalesGroups[key];
  if (!group) return;

  const item = DB.getItem(group.item_id);

  const serialRows = group.serials.map((sn, idx) => {
    const s = DB.serialized.find(x => x.sn === sn);
    return `<tr>
      <td class="mono fw-600">${idx + 1}</td>
      <td class="mono fw-600" style="color:var(--accent);">${sn}</td>
      <td class="mono">${s?.mac || 'N/A'}</td>
    </tr>`;
  }).join('');

  App.showModal(`Sold Serials Checklist — Invoice: ${group.invoice_no || 'N/A'}`, `
    <div style="margin-bottom:14px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:8px; padding:12px;">
      <div class="fw-700" style="font-size:14px;color:var(--accent);">${item?.name || group.item_id}</div>
      <div class="fs-12 text-secondary mt-4">Buyer: <strong>${group.buyer}</strong> | Total Units: <strong>${group.serials.length} Pcs</strong></div>
      ${group.notes ? `<div class="fs-12 text-muted mt-8" style="font-style:italic;">Notes: ${group.notes}</div>` : ''}
    </div>
    
    <div class="fg" style="margin-bottom:12px">
      <input type="text" class="fi" id="modal-serial-search" placeholder="🔍 Search serial or MAC inside this transaction..." oninput="filterModalSerials()"/>
    </div>

    <div class="table-wrap" style="max-height: 280px; overflow-y: auto;">
      <table id="modal-serials-table">
        <thead>
          <tr>
            <th style="width: 50px;">#</th>
            <th>Serial Number</th>
            <th>MAC Address</th>
          </tr>
        </thead>
        <tbody>
          ${serialRows}
        </tbody>
      </table>
    </div>
  `, [{ label: 'Close Panel', cls: 'btn-secondary', onclick: 'App.closeModal()' }]);
}
window.openViewSerialsModal = openViewSerialsModal;

function filterModalSerials() {
  const query = (document.getElementById('modal-serial-search')?.value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#modal-serials-table tbody tr');
  rows.forEach(row => {
    const sn = row.cells[1].textContent.toLowerCase();
    const mac = row.cells[2].textContent.toLowerCase();
    if (!query || sn.includes(query) || mac.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}
window.filterModalSerials = filterModalSerials;

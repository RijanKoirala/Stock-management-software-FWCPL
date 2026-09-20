// ═══════════════════════════════════════
// View: Procurement
// ═══════════════════════════════════════
function renderProcurement() {
  const rows = DB.procurements.map(po => {
    const viewBillBtn = po.invoice_file 
      ? `<button class="btn btn-sm btn-secondary" onclick="viewPOInvoice('${po.id}', '${po.invoice_no || 'N/A'}', '${po.invoice_file}')">📄 View File</button>` 
      : `<span class="text-muted fs-11">—</span>`;

    // 1. Compile Items Summary and Status badges
    const itemsSummary = po.items.map(pi => {
      const it = DB.getItem(pi.item_id);
      const catBadge = `<span class="badge badge-${it?.category === 'Asset' ? 'purple' : 'blue'}" style="font-size: 8px; padding: 2px 4px; vertical-align: middle; margin-left: 4px;">${it?.category || 'Consumable'}</span>`;
      const batchLabel = (!it || it.category === 'Asset') ? '' : `<div style="font-size:10px; color:var(--accent); font-family:monospace; margin-top:2px;">Batch: ${pi.batch || '—'}</div>`;
      return `<div style="margin-bottom: 4px; line-height: 1.4;">
        <span style="font-weight:600; font-size:12px;">${it?.name || pi.item_id}</span>${catBadge}
        <div style="font-size:11px; color:var(--text-secondary); font-family:monospace;">${pi.qty.toLocaleString()} ${it?.uom || 'Pcs'} @ NPR ${pi.unit_cost.toLocaleString()}</div>
        ${batchLabel}
      </div>`;
    }).join('');

    // 2. Serials Column
    let serialsCell = '';
    const assetItems = po.items.filter(pi => {
      const it = DB.getItem(pi.item_id);
      return it?.category === 'Asset';
    });
    if (assetItems.length > 0) {
      const allUploaded = assetItems.every(pi => pi.serials_uploaded);
      if (allUploaded) {
        const serials = DB.serialized.filter(s => s.po_id === po.id || (s.po_id == null && s.invoice_no === po.invoice_no && po.invoice_no !== 'N/A'));
        const returnedSerials = serials.filter(s => s.status === 'Returned_To_Vendor');
        
        let btnHtml = `<button class="btn btn-sm btn-secondary" onclick="viewPOSerials('${po.id}', '${po.invoice_no || 'N/A'}')" style="font-size:10px; padding:4px 8px; display:inline-flex; align-items:center; gap:4px;">🔎 Serials (${serials.length})</button>`;
        if (returnedSerials.length > 0) {
          btnHtml += `<span class="badge badge-red" style="font-size:9px; margin-top:4px; display:block; text-align:center; max-width: 100px;">🚚 ${returnedSerials.length} Sent to Vendor</span>`;
        }
        serialsCell = btnHtml;
      } else {
        serialsCell = `<span class="badge badge-red">⚠ Required</span>`;
      }
    } else {
      serialsCell = `<span class="text-muted fs-11">N/A</span>`;
    }

    return `<tr>
      <td class="mono fw-600">${po.id}</td>
      <td>${po.vendor}</td>
      <td class="mono fw-600">${po.invoice_no || '—'}</td>
      <td>${itemsSummary}</td>
      <td class="mono fw-600" style="white-space:nowrap;">NPR ${po.total.toLocaleString()}</td>
      <td>${po.date}</td>
      <td><span class="badge ${po.status==='Received'?'badge-green':'badge-yellow'}">${po.status}</span></td>
      <td>${serialsCell}</td>
      <td>${viewBillBtn}</td>
    </tr>`;
  }).join('');

  const totalSpend = DB.procurements.reduce((s,p)=>s+p.total,0);

  return `
  <div class="view-header">
    <div><div class="view-title">＋ Purchases</div><div class="view-subtitle">Manage vendor purchase orders and stock intake</div></div>
    <div class="view-actions">
      <button class="btn class-primary btn-sm btn-primary" onclick="openNewPO()">+ New Purchase Order</button>
    </div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
    <div class="stat-card" style="--stat-color:var(--accent)">
      <div class="stat-icon">📦</div>
      <div class="stat-val">${DB.procurements.length}</div>
      <div class="stat-label">Total POs</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--green)">
      <div class="stat-icon">💰</div>
      <div class="stat-val" style="font-size:18px">NPR ${totalSpend.toLocaleString()}</div>
      <div class="stat-label">Total Procurement Value</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--yellow)">
      <div class="stat-icon">⏳</div>
      <div class="stat-val">${DB.procurements.filter(p=>p.status==='Pending').length}</div>
      <div class="stat-label">Pending Delivery</div>
    </div>
  </div>

  <div class="card">
    <div class="card-hdr"><div class="card-title">Purchase Orders</div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>PO ID</th><th>Vendor</th><th>Bill/Invoice No</th><th>Items Purchased Summary</th><th>Total PO Cost</th><th>Date</th><th>Status</th><th>Serials</th><th>Invoice Attachment</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function openNewPO() {
  App.showModal('New Purchase Order', `
    <div class="fg"><label class="fl">Vendor Name <span class="text-red">*</span></label><input class="fi" id="po-vendor" placeholder="e.g. Nokia Nepal Pvt. Ltd." required/></div>
    
    <!-- Invoice Bill details -->
    <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:12px;margin-bottom:16px">
      <div class="fg" style="margin-bottom:0">
        <label class="fl">Bill/Invoice Number</label>
        <input class="fi" id="po-invoice-no" placeholder="e.g. INV-2026-001"/>
      </div>
      <div class="fg" style="margin-bottom:0">
        <label class="fl">Attach Invoice Copy (PDF / Image)</label>
        <div style="display:flex;gap:8px">
          <input type="file" id="po-invoice-file" style="display:none" onchange="handlePOInvoiceUpload(this)"/>
          <button class="btn btn-secondary" onclick="document.getElementById('po-invoice-file').click()" style="display:flex;align-items:center;gap:6px;padding:8px 12px;font-size:12px">📎 Choose File</button>
          <span id="po-invoice-file-name" class="fs-11 text-muted" style="display:inline-flex;align-items:center;word-break:break-all;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">No file attached</span>
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <h3 style="font-size:13px; font-weight:700; color:var(--text); text-transform:uppercase; letter-spacing:0.5px;">🛒 Purchase Order Items</h3>
      <button class="btn btn-sm btn-secondary" type="button" onclick="addPOItemRow()" style="font-size:11px; padding:4px 8px;">➕ Add Item</button>
    </div>

    <!-- Items Container -->
    <div id="po-items-container" style="max-height: 280px; overflow-y: auto; margin-bottom: 12px; padding: 2px;"></div>
    
    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:12px; margin-bottom:16px;">
      <div class="fg" style="margin-bottom:0; width:140px;"><label class="fl">PO Date</label><input type="date" class="fi" id="po-date" style="margin-bottom:0;"/></div>
      <div id="po-modal-overall-total" style="font-size:14px; font-weight:800; color:var(--green);">Overall Total: NPR 0</div>
    </div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'Save Purchase Order', cls:'btn-primary', onclick:'savePO()' }
  ]);

  // Set today's date and add one initial row
  setTimeout(() => { 
    const d = document.getElementById('po-date'); 
    if (d) d.value = new Date().toISOString().slice(0, 10); 
    addPOItemRow();
  }, 50);
}

function addPOItemRow() {
  const container = document.getElementById('po-items-container');
  if (!container) return;
  
  const itemOpts = DB.items.map(i => `<option value="${i.id}">${i.name} (${i.category})</option>`).join('');
  const div = document.createElement('div');
  div.className = 'po-item-row card';
  div.style.background = 'rgba(255,255,255,0.01)';
  div.style.border = '1px solid var(--border)';
  div.style.padding = '12px 16px';
  div.style.marginBottom = '12px';
  div.style.position = 'relative';
  
  div.innerHTML = `
    <button type="button" class="btn-close-row" onclick="removePOItemRow(this)" style="position:absolute; right:12px; top:12px; background:none; border:none; color:var(--red); cursor:pointer; font-weight:700; font-size:12px; line-height:1;">✕</button>
    
    <div class="fg" style="margin-bottom:10px;">
      <label class="fl">Select Item Model</label>
      <select class="fi po-item-selector" onchange="handlePOItemChange(this)">
        <option value="">-- Select Item --</option>
        ${itemOpts}
        <option value="__NEW_ITEM__">➕ [Create New Item on the fly...]</option>
      </select>
    </div>
    
    <!-- Dynamic Inline New Item Details (Hidden by default) -->
    <div class="new-item-details-block hidden" style="background:rgba(255,255,255,0.015); border:1px dashed var(--border-hover); border-radius:8px; padding:12px; margin-bottom:12px">
      <h4 style="font-size:11px; font-weight:700; color:var(--accent); margin-bottom:8px; display:flex; align-items:center; gap:6px">⚙️ Register New Product</h4>
      <div class="fg"><label class="fl">New Item Name</label><input class="fi new-it-name" placeholder="e.g. VSOL GPON ONU Router"/></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:8px;">
        <div class="fg" style="margin-bottom:0"><label class="fl">Category</label>
          <select class="fi new-it-cat" onchange="handlePONewItemCatChange(this)"><option value="Asset">Asset (Serialized)</option><option value="Consumable">Consumable (Bulk)</option></select></div>
        <div class="fg" style="margin-bottom:0"><label class="fl">Unit of Measure</label>
          <select class="fi new-it-uom"><option>Pcs</option><option>Meters</option><option>Boxes</option><option>Rolls</option></select></div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="fg" style="margin-bottom:0"><label class="fl">Reorder Threshold</label><input type="number" class="fi new-it-reorder" value="10" min="1"/></div>
        <div class="fg" style="margin-bottom:0"><label class="fl">Default Cost (NPR)</label><input type="number" class="fi new-it-cost" placeholder="3500" min="0"/></div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="fg" style="margin-bottom:0;"><label class="fl">Quantity</label><input type="number" class="fi po-item-qty" min="1" placeholder="e.g. 10" oninput="updatePOItemTotal(this)"/></div>
      <div class="fg" style="margin-bottom:0;"><label class="fl">Unit Cost (NPR)</label><input type="number" class="fi po-item-cost" placeholder="e.g. 4500" oninput="updatePOItemTotal(this)"/></div>
    </div>
    
    <div class="item-line-total text-green" style="font-size:11px; font-weight:700; margin-top:8px; text-align:right;">Line Total: NPR 0</div>

    <!-- Collapsible Serial Block for Serialized Items -->
    <div class="serial-section-block hidden" style="margin-top:12px; border-top:1px dashed var(--border); padding-top:12px;">
      <div style="background:var(--yellow-soft); border:1px solid var(--yellow); border-radius:6px; padding:8px; margin-bottom:12px">
        <strong style="color:var(--yellow); font-size:11px;">⚠ Serialized Asset Item</strong>
        <p style="font-size:10px; color:var(--text-secondary); margin-top:4px;">Enter individual Serial Numbers & MAC Addresses.</p>
      </div>
      <div class="fg"><label class="fl">Warranty Duration (Months)</label><input type="number" class="fi po-item-warranty" value="12" min="1"/></div>
      <div class="fg"><label class="fl">Serial Numbers (one per line) <span class="text-red">*</span></label><textarea class="fi po-item-serials" rows="3" placeholder="SN-001&#10;SN-002&#10;..."></textarea></div>
      <div class="fg"><label class="fl">MAC Addresses (matching order, one per line)</label><textarea class="fi po-item-macs" rows="3" placeholder="AA:BB:CC:DD:EE:01&#10;..."></textarea></div>
    </div>

    <!-- Collapsible Batch Block for Consumable Items -->
    <div class="batch-section-block hidden" style="margin-top:12px; border-top:1px dashed var(--border); padding-top:12px;">
      <div class="fg" style="margin-bottom:0;"><label class="fl">Batch Number <span class="text-red">*</span></label><input class="fi po-item-batch" placeholder="e.g. BATCH-2026-JUN-01"/></div>
    </div>
  `;
  container.appendChild(div);
  updatePOOverallTotal();
}

function removePOItemRow(btn) {
  const row = btn.closest('.po-item-row');
  if (row) {
    row.remove();
    updatePOOverallTotal();
  }
}

function handlePOItemChange(select) {
  const row = select.closest('.po-item-row');
  if (!row) return;
  const val = select.value;
  const newFields = row.querySelector('.new-item-details-block');
  const serialSec = row.querySelector('.serial-section-block');
  const batchSec = row.querySelector('.batch-section-block');
  
  if (val === '__NEW_ITEM__') {
    newFields.classList.remove('hidden');
    const cat = row.querySelector('.new-it-cat')?.value;
    serialSec.classList.toggle('hidden', cat !== 'Asset');
    batchSec.classList.toggle('hidden', cat === 'Asset');
  } else {
    newFields.classList.add('hidden');
    const it = DB.getItem(val);
    serialSec.classList.toggle('hidden', it?.category !== 'Asset');
    batchSec.classList.toggle('hidden', it?.category === 'Asset');
  }
  updatePOItemTotal(select);
}

function handlePONewItemCatChange(select) {
  const row = select.closest('.po-item-row');
  if (!row) return;
  const serialSec = row.querySelector('.serial-section-block');
  const batchSec = row.querySelector('.batch-section-block');
  const isAsset = select.value === 'Asset';
  serialSec.classList.toggle('hidden', !isAsset);
  batchSec.classList.toggle('hidden', isAsset);
}

function updatePOItemTotal(input) {
  const row = input.closest('.po-item-row');
  if (!row) return;
  const qty = parseInt(row.querySelector('.po-item-qty')?.value || 0);
  const cost = parseInt(row.querySelector('.po-item-cost')?.value || 0);
  const totalDiv = row.querySelector('.item-line-total');
  
  const lineTotal = qty * cost;
  if (totalDiv) {
    totalDiv.textContent = `Line Total: NPR ${lineTotal.toLocaleString()}`;
  }
  updatePOOverallTotal();
}

function updatePOOverallTotal() {
  const rows = document.querySelectorAll('.po-item-row');
  let overall = 0;
  rows.forEach(row => {
    const qty = parseInt(row.querySelector('.po-item-qty')?.value || 0);
    const cost = parseInt(row.querySelector('.po-item-cost')?.value || 0);
    overall += qty * cost;
  });
  const totalHeader = document.getElementById('po-modal-overall-total');
  if (totalHeader) {
    totalHeader.textContent = `Overall Total: NPR ${overall.toLocaleString()}`;
  }
}

function handlePOInvoiceUpload(input) {
  const nameSpan = document.getElementById('po-invoice-file-name');
  if (input.files && input.files[0] && nameSpan) {
    nameSpan.textContent = input.files[0].name;
    nameSpan.style.color = 'var(--green)';
    
    const reader = new FileReader();
    reader.onload = function(e) {
      input.dataset.base64 = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function savePO() {
  const vendor = document.getElementById('po-vendor')?.value;
  const date = document.getElementById('po-date')?.value;
  const invoiceNo = document.getElementById('po-invoice-no')?.value || 'N/A';
  
  if (!vendor) { App.toast('Vendor Name is required', 'error'); return; }
  
  const rows = document.querySelectorAll('.po-item-row');
  if (rows.length === 0) {
    App.toast('Please add at least one item to purchase', 'error');
    return;
  }
  
  const items = [];
  const tempItemsList = [...DB.items];
  let validationError = null;
  
  rows.forEach((row, index) => {
    let itemId = row.querySelector('.po-item-selector')?.value;
    const qty = parseInt(row.querySelector('.po-item-qty')?.value || 0);
    const cost = parseInt(row.querySelector('.po-item-cost')?.value || 0);
    
    if (!itemId) { validationError = `Item is not selected in row #${index + 1}`; return; }
    if (qty <= 0) { validationError = `Quantity must be greater than zero in row #${index + 1}`; return; }
    if (cost < 0) { validationError = `Cost cannot be negative in row #${index + 1}`; return; }
    
    let isAsset = false;
    let isNewItem = itemId === '__NEW_ITEM__';
    let newItemDetails = null;
    
    if (isNewItem) {
      const newName = row.querySelector('.new-it-name')?.value;
      const newCat = row.querySelector('.new-it-cat')?.value;
      const newUom = row.querySelector('.new-it-uom')?.value;
      const newReorder = parseInt(row.querySelector('.new-it-reorder')?.value || 10);
      const newCost = parseInt(row.querySelector('.new-it-cost')?.value || cost);
      
      if (!newName) { validationError = `Provide a name for the new catalog item in row #${index + 1}`; return; }
      
      itemId = DB.nextId('ITM', tempItemsList);
      tempItemsList.push({ id: itemId });
      newItemDetails = { name: newName, category: newCat, uom: newUom, reorder: newReorder, unit_cost: newCost };
      isAsset = newCat === 'Asset';
    } else {
      const it = DB.getItem(itemId);
      isAsset = it?.category === 'Asset';
    }
    
    let warrantyMonths = 12;
    let sns = [];
    let macs = [];
    let batchVal = null;
    
    if (isAsset) {
      warrantyMonths = parseInt(row.querySelector('.po-item-warranty')?.value || 12);
      const serialsRaw = row.querySelector('.po-item-serials')?.value || '';
      const macsRaw = row.querySelector('.po-item-macs')?.value || '';
      sns = serialsRaw.split('\n').map(s=>s.trim()).filter(Boolean);
      macs = macsRaw.split('\n').map(m=>m.trim()).filter(Boolean);
      
      if (sns.length === 0) { validationError = `Serial numbers required for asset item in row #${index + 1}`; return; }
      if (sns.length !== qty) { validationError = `Serial count (${sns.length}) must match quantity (${qty}) in row #${index + 1}`; return; }
    } else {
      batchVal = row.querySelector('.po-item-batch')?.value?.trim();
      if (!batchVal) { validationError = `Batch Number is required for consumable item in row #${index + 1}`; return; }
    }
    
    items.push({
      itemId,
      qty,
      cost,
      isNewItem,
      newItemDetails,
      isAsset,
      warrantyMonths,
      serials: sns,
      macs: macs,
      batch: batchVal
    });
  });
  
  if (validationError) {
    App.toast(validationError, 'error');
    return;
  }
  
  const poId = DB.nextId('PO', DB.procurements);
  const fileInput = document.getElementById('po-invoice-file');
  const invoiceFileBase64 = fileInput?.dataset?.base64 || null;
  const invoiceFileName = fileInput?.files?.[0]?.name || null;
  
  try {
    await DB.saveProcurement({
      poId,
      vendor,
      date,
      invoiceNo,
      invoiceFile: invoiceFileBase64,
      invoiceFileName: invoiceFileName,
      items: items
    });
    
    App.closeModal();
    App.toast(`Purchase Order ${poId} saved successfully!`, 'success');
    App.navigate('procurement');
  } catch (e) {
    App.toast(`Failed to save PO: ${e.message}`, 'error');
  }
}

function viewPOSerials(poId, invoiceNo) {
  const po = DB.procurements.find(p => p.id === poId);
  const serials = DB.serialized.filter(s => {
    if (s.po_id) return s.po_id === poId;
    return s.invoice_no === invoiceNo && (invoiceNo !== 'N/A' || (po && po.items.some(pi => pi.item_id === s.item_id)));
  });

  const rows = serials.map((s, idx) => {
    let statusBadge = '';
    let locationText = '';
    let actionBtn = '';
    let returnInfoHtml = '';

    if (s.status === 'Available') {
      statusBadge = `<span class="badge badge-green">Available</span>`;
      locationText = s.loc_type === 'Central_Warehouse' ? '🏢 Central Warehouse' : `🏢 Branch: ${DB.getLocation(s.loc_id)?.name || s.loc_id}`;
    } else if (s.status === 'Deployed') {
      statusBadge = `<span class="badge badge-purple">Deployed</span>`;
      locationText = `🏠 Customer Acc: ${s.loc_id}`;
    } else if (s.status === 'Assigned') {
      statusBadge = `<span class="badge badge-orange">With Tech</span>`;
      locationText = `👷 Tech: ${DB.getTechnician(s.loc_id)?.name || s.loc_id}`;
    } else if (s.status === 'Faulty') {
      statusBadge = `<span class="badge badge-red">Faulty</span>`;
      if (s.loc_id === 'LOC001') {
        locationText = `🏢 Central Hub (Faulty Shelf)`;
        actionBtn = `<button class="btn btn-sm btn-warning" onclick="App.closeModal(); openClaimWarrantyModal('${s.sn}')" style="font-size:9px; padding:3px 6px; background:var(--orange); border:none; color:white;">🚚 Return to Vendor</button>`;
      } else {
        locationText = s.loc_type === 'Branch' ? `🏢 Branch: ${DB.getLocation(s.loc_id)?.name || s.loc_id} (Faulty)` : `👷 Tech: ${DB.getTechnician(s.loc_id)?.name || s.loc_id} (Faulty)`;
      }
    } else if (s.status === 'Returned_To_Vendor') {
      statusBadge = `<span class="badge" style="background:#111; color:#bbb; border:1px solid #333; font-size:10px;">Returned to Vendor</span>`;
      locationText = `🚚 Vendor: ${s.loc_id}`;
      if (s.return_vendor_date) {
        returnInfoHtml = `<div class="fs-10 text-secondary mt-4">Returned on: <strong>${s.return_vendor_date}</strong></div>`;
      }
      if (s.return_vendor_notes) {
        returnInfoHtml += `<div class="fs-10 text-muted mt-2" style="font-style:italic;">Notes: "${s.return_vendor_notes}"</div>`;
      }
    } else {
      statusBadge = `<span class="badge badge-secondary">${s.status}</span>`;
      locationText = s.loc_id;
    }

    return `
      <tr>
        <td><span class="mono fw-600">${idx + 1}</span></td>
        <td>
          <div class="mono fw-600" style="color:var(--accent);">${s.sn}</div>
          <div class="mono fs-10 text-muted">MAC: ${s.mac || 'N/A'}</div>
        </td>
        <td>
          <div>${statusBadge}</div>
          ${returnInfoHtml}
        </td>
        <td class="fs-12">${locationText}</td>
        <td>${actionBtn || '—'}</td>
      </tr>
    `;
  }).join('');

  const modalBody = `
    <div style="background:var(--bg-card2); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:12px;">
      <div class="fw-700" style="font-size:14px; color:var(--accent);">${po?.vendor || 'Vendor'} Purchase Order</div>
      <div class="fs-12 text-secondary mt-4">PO ID: <strong>${poId}</strong> | Invoice Number: <strong>${invoiceNo}</strong></div>
    </div>

    <div class="table-wrap" style="max-height: 350px; overflow-y: auto;">
      <table>
        <thead>
          <tr>
            <th style="width: 40px;">#</th>
            <th>Serial & MAC</th>
            <th>Current Status</th>
            <th>Location Assignment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows : '<tr><td colspan="5" style="text-align:center;" class="text-muted">No serials found for this purchase order.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  App.showModal(`Serials Registry — PO ${poId}`, modalBody, [
    { label: 'Close', cls: 'btn-secondary', onclick: 'App.closeModal()' }
  ]);
}

function viewPOInvoice(poId, invoiceNo, invoiceFile) {
  App.showModal(`Purchase Invoice — PO ${poId}`, `
    <div style="text-align:center; padding:16px;">
      <div style="font-size:48px; margin-bottom:12px">📄</div>
      <h4 style="font-size:15px; margin-bottom:4px; font-weight:700; color:var(--text)">Purchase Invoice Copy</h4>
      <p class="fs-12 text-secondary mb-16">Invoice Number: <strong style="color:var(--accent)">${invoiceNo}</strong></p>
      
      <div style="border:1.5px dashed var(--border-hover); border-radius:10px; padding:16px; background:var(--bg-card2); display:flex; align-items:center; gap:12px; margin-bottom:16px; text-align:left">
        <div style="font-size:32px">📎</div>
        <div style="flex:1; overflow:hidden">
          <strong style="font-size:13px; color:var(--text); word-break:break-all; text-overflow:ellipsis; display:block">${invoiceFile}</strong>
          <p class="fs-11 text-secondary mt-4">Attached invoice copy</p>
        </div>
      </div>
      
      <button class="btn btn-primary" onclick="window.open('/uploads/' + '${invoiceFile}', '_blank')" style="width:100%">📥 Download / View Original Invoice</button>
    </div>
  `, [{ label: 'Close', cls: 'btn-secondary', onclick: 'App.closeModal()' }]);
}

// Bind view functions globally for onclick templates
window.renderProcurement = renderProcurement;
window.openNewPO = openNewPO;
window.addPOItemRow = addPOItemRow;
window.removePOItemRow = removePOItemRow;
window.handlePOItemChange = handlePOItemChange;
window.handlePONewItemCatChange = handlePONewItemCatChange;
window.updatePOItemTotal = updatePOItemTotal;
window.updatePOOverallTotal = updatePOOverallTotal;
window.handlePOInvoiceUpload = handlePOInvoiceUpload;
window.savePO = savePO;
window.viewPOSerials = viewPOSerials;
window.viewPOInvoice = viewPOInvoice;

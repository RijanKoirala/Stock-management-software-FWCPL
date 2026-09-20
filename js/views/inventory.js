// ═══════════════════════════════════════
// View: Live Inventory Ledger (Warehouse-Centric Collapsible Tree)
// ═══════════════════════════════════════
let invFilter = { search:'', loc:'', item:'', status:'', category:'' };
let tempInvGroups = {}; // Temporary cache to hold serial number lists for second-level shelf modals
let tempLocGroups = {}; // Temporary cache to hold warehouse groups

function renderInventory() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  const locs = isBranchKeeper ? DB.locations.filter(l => l.id === user.location_id) : DB.locations;
  const locOptions = locs.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  const itemOptions = DB.items.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
  const invSubtitle = isBranchKeeper 
    ? `Real-time asset and consumable tracking for ${user.location_name}`
    : 'Real-time asset and consumable tracking across all locations';

  const locFilterHtml = isBranchKeeper 
    ? `<input type="hidden" id="inv-loc" value="${user.location_id}">`
    : `<select class="filter-select" id="inv-loc" onchange="applyInvFilter()">
        <option value="">All Locations</option>
        ${locOptions}
        <option value="With_Technician">With Technicians</option>
        <option value="Installed_At_Customer">At Customers</option>
        <option value="Faulty">Faulty</option>
        <option value="In_Transit">In Transit</option>
      </select>`;

  return `
  <!-- Self-contained CSS styles for premium accordion tree aesthetics -->
  <style>
    .warehouse-row {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      transition: var(--transition);
      margin-bottom: 12px;
      position: relative;
      overflow: hidden;
    }
    .warehouse-row::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--bar-color, var(--accent));
      transition: var(--transition);
    }
    .warehouse-row:hover {
      border-color: var(--accent);
      background: rgba(255, 255, 255, 0.02);
      transform: translateX(4px);
    }
    .warehouse-row.expanded {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      border-color: var(--accent);
      background: rgba(255, 255, 255, 0.015);
      margin-bottom: 0;
    }
    
    .warehouse-details-container {
      background: rgba(255, 255, 255, 0.005);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 var(--radius) var(--radius);
      padding: 20px;
      margin-bottom: 16px;
      animation: slideDown 0.2s ease-out;
    }
    
    .ecosystem-section {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-card2);
      margin-bottom: 10px;
      overflow: hidden;
      transition: var(--transition);
    }
    .ecosystem-section:hover {
      border-color: rgba(255, 255, 255, 0.12);
    }
    .ecosystem-section:last-child {
      margin-bottom: 0;
    }
    
    .ecosystem-header {
      background: rgba(255, 255, 255, 0.01);
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: var(--transition);
      user-select: none;
    }
    .ecosystem-header:hover {
      background: rgba(255, 255, 255, 0.03);
      color: var(--accent-hover);
    }
    
    .ecosystem-content {
      border-top: 1px solid var(--border);
      padding: 16px 20px;
      background: rgba(0, 0, 0, 0.12);
      animation: fadeIn 0.2s ease;
    }
    
    .expand-caret {
      font-size: 10px;
      color: var(--text-secondary);
      transition: transform 0.2s ease;
      display: inline-block;
    }
    
    .status-badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
  </style>

  <div class="view-header">
    <div><div class="view-title">◈ Live Inventory Ledger</div><div class="view-subtitle">${invSubtitle}</div></div>
    <div class="view-actions" style="display:flex; gap:8px;">
      <button class="btn btn-primary btn-sm" onclick="openImportSerialsModal()">📥 Bulk Import Excel/CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="exportInventoryCSV()">📤 Export CSV</button>
    </div>
  </div>
  <div class="card mb-16">
    <div class="filter-bar">
      <input class="search-input" id="inv-search" placeholder="🔍 Search by serial, MAC, item name..." oninput="applyInvFilter()">
      ${locFilterHtml}
      <select class="filter-select" id="inv-item" onchange="applyInvFilter()">
        <option value="">All Items</option>
        ${itemOptions}
      </select>
      <select class="filter-select" id="inv-cat" onchange="applyInvFilter()">
        <option value="">All Categories</option>
        <option value="Asset">Assets Only</option>
        <option value="Consumable">Consumables Only</option>
      </select>
      <select class="filter-select" id="inv-status" onchange="applyInvFilter()">
        <option value="">All Statuses</option>
        <option value="Available">Available</option>
        <option value="In_Transit">In Transit</option>
        <option value="Assigned">With Technician</option>
        <option value="Deployed">Deployed</option>
        <option value="Faulty">Faulty</option>
        <option value="Scrapped">Scrapped / Written Off</option>
        <option value="Returned_To_Vendor">Returned to Vendor (RMA)</option>
      </select>
    </div>
  </div>
  <div id="inv-global-table-container"></div>
  <div id="inv-results"></div>
  <div id="inv-consumable-logs-container"></div>`;
}

function inventoryMounted() {
  if (window.invPreFilters) {
    const pf = window.invPreFilters;
    if (pf.cat !== undefined && document.getElementById('inv-cat')) {
      document.getElementById('inv-cat').value = pf.cat;
    }
    if (pf.status !== undefined && document.getElementById('inv-status')) {
      document.getElementById('inv-status').value = pf.status;
    }
    if (pf.search !== undefined && document.getElementById('inv-search')) {
      document.getElementById('inv-search').value = pf.search;
    }
    if (pf.loc !== undefined && document.getElementById('inv-loc')) {
      document.getElementById('inv-loc').value = pf.loc;
    }
    window.invPreFilters = null; // Clear pre-filters
  }
  applyInvFilter();
}

function applyInvFilter() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  const locId = isBranchKeeper ? user.location_id : null;

  const search = (document.getElementById('inv-search')?.value || '').toLowerCase().trim();
  const loc = document.getElementById('inv-loc')?.value || '';
  const item = document.getElementById('inv-item')?.value || '';
  const cat = document.getElementById('inv-cat')?.value || '';
  const status = document.getElementById('inv-status')?.value || '';

  // Initialize Shelf Cache
  tempInvGroups = {};

  // Initialize Location Groups for allowed physical locations
  tempLocGroups = {};
  const allowedLocs = isBranchKeeper ? DB.locations.filter(l => l.id === locId) : DB.locations;
  allowedLocs.forEach(l => {
    tempLocGroups[l.id] = {
      loc_id: l.id,
      name: l.name,
      city: l.city,
      manager: l.manager,
      type: l.type,
      assets: [],
      consumables: [],
      total_value: 0,
      statuses: { Available: 0, Assigned: 0, Deployed: 0, Faulty: 0, In_Transit: 0, Sold: 0 }
    };
  });

  // 1. Process and filter Serialized Assets
  DB.serialized.forEach(s => {
    if (s.status === 'Returned_To_Vendor' && status !== 'Returned_To_Vendor') return;
    if (s.status === 'Scrapped' && status !== 'Scrapped') return;
    const it = DB.getItem(s.item_id);
    if (!it) return;

    const branchId = s.branch_id || (s.loc_type === 'Branch' ? s.loc_id : 'LOC001');
    if (isBranchKeeper && branchId !== locId) return;

    const matchSearch = !search || s.sn.toLowerCase().includes(search) || (s.mac||'').toLowerCase().includes(search) || it.name.toLowerCase().includes(search);
    const matchItem = !item || s.item_id === item;
    const matchCat = !cat || cat === 'Asset';
    const matchStatus = !status || s.status === status;
    
    let matchLoc = true;
    if (loc) {
      if (loc === 'With_Technician') {
        matchLoc = s.status === 'Assigned' || s.loc_type === 'With_Technician';
      } else if (loc === 'Installed_At_Customer') {
        matchLoc = s.status === 'Deployed' || s.loc_type === 'Installed_At_Customer';
      } else if (loc === 'Faulty') {
        matchLoc = s.status === 'Faulty';
      } else if (loc === 'In_Transit') {
        matchLoc = s.status === 'In_Transit' || s.loc_type === 'In_Transit';
      } else {
        matchLoc = s.branch_id === loc;
      }
    }

    if (matchSearch && matchItem && matchCat && matchStatus && matchLoc) {
      const lg = tempLocGroups[branchId];
      if (lg) {
        lg.assets.push(s);
        lg.statuses[s.status] = (lg.statuses[s.status] || 0) + 1;
        lg.total_value += s.purchase_cost != null ? Number(s.purchase_cost) : Number(it?.unit_cost || 0);
      }
    }
  });

  // 2. Process and filter Consumables
  DB.consumable_stock.forEach(c => {
    const it = DB.getItem(c.item_id);
    if (!it) return;
    if (isBranchKeeper && c.loc_id !== locId) return;

    const matchSearch = !search || it.name.toLowerCase().includes(search) || c.item_id.toLowerCase().includes(search);
    const matchItem = !item || c.item_id === item;
    const matchCat = !cat || cat === 'Consumable';
    const matchStatus = !status;

    let matchLoc = true;
    if (loc) {
      if (['With_Technician', 'Installed_At_Customer', 'Faulty', 'In_Transit'].includes(loc)) {
        matchLoc = false;
      } else {
        matchLoc = c.loc_id === loc;
      }
    }

    if (matchSearch && matchItem && matchCat && matchStatus && matchLoc) {
      const lg = tempLocGroups[c.loc_id];
      if (lg) {
        lg.consumables.push(c);
        lg.total_value += Number(c.qty) * Number(c.unit_cost);
      }
    }
  });

  // 3. Render Global Unified Table if filtering by specific status (e.g. Deployed)
  let globalTableHtml = '';
  if (status) {
    const globalAssets = DB.serialized.filter(s => {
      if (s.status === 'Returned_To_Vendor' && status !== 'Returned_To_Vendor') return false;
      if (s.status === 'Scrapped' && status !== 'Scrapped') return false;
      const it = DB.getItem(s.item_id);
      if (!it) return false;
      
      const branchId = s.branch_id || (s.loc_type === 'Branch' ? s.loc_id : 'LOC001');
      if (isBranchKeeper && branchId !== locId) return false;

      const matchSearch = !search || s.sn.toLowerCase().includes(search) || (s.mac||'').toLowerCase().includes(search) || it.name.toLowerCase().includes(search);
      const matchItem = !item || s.item_id === item;
      const matchCat = !cat || cat === 'Asset';
      const matchStatus = s.status === status;
      
      let matchLoc = true;
      if (loc) {
        if (loc === 'With_Technician') matchLoc = s.status === 'Assigned' || s.loc_type === 'With_Technician';
        else if (loc === 'Installed_At_Customer') matchLoc = s.status === 'Deployed' || s.loc_type === 'Installed_At_Customer';
        else if (loc === 'Faulty') matchLoc = s.status === 'Faulty';
        else if (loc === 'In_Transit') matchLoc = s.status === 'In_Transit';
        else matchLoc = s.branch_id === loc;
      }
      return matchSearch && matchItem && matchCat && matchStatus && matchLoc;
    });

    if (globalAssets.length > 0) {
      const statusLabels = {
        Available: 'Available Stock',
        Assigned: 'Assigned to Technicians',
        Deployed: 'Deployed at Customers',
        Faulty: 'Faulty / Damaged Gear',
        In_Transit: 'In Transit Shipments',
        Scrapped: 'Scrapped / Written Off Assets',
        Returned_To_Vendor: 'Returned to Vendor (RMA) Assets'
      };
      const title = statusLabels[status] || `${status} Assets`;
      const badgeCls = status === 'Available' ? 'badge-green' : (status === 'Assigned' ? 'badge-orange' : (status === 'Deployed' ? 'badge-purple' : (status === 'Faulty' ? 'badge-red' : (status === 'Scrapped' ? 'badge-red' : (status === 'Returned_To_Vendor' ? 'badge-yellow' : 'badge-blue')))));

      const globalRows = globalAssets.map((s, idx) => {
        const it = DB.getItem(s.item_id);
        const branchName = DB.getLocation(s.branch_id)?.name || s.branch_id || 'N/A';
        const photoUrl = s.device_photo ? `/uploads/${s.device_photo}` : null;
        const photoHtml = photoUrl 
          ? `<div style="margin-top:4px;"><a href="#" onclick="event.preventDefault(); openPhotoViewer('${s.sn}', '${photoUrl}')" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; color:var(--accent); font-weight:600; text-decoration:none;"><img src="${photoUrl}" style="width:24px; height:24px; border-radius:4px; object-fit:cover; border:1px solid var(--border);"/> View Photo</a></div>`
          : '';
        
        let positionText = '';
        if (s.status === 'Scrapped') {
          positionText = `🗑️ Scrapped (Out of service)`;
        } else if (s.status === 'Returned_To_Vendor') {
          positionText = `🚚 Returned to Vendor`;
        } else if (s.loc_type === 'Central_Warehouse' || s.loc_type === 'Branch' || s.loc_type === 'Faulty') {
          positionText = `🏢 Warehouse Stock`;
        } else if (s.loc_type === 'With_Technician') {
          positionText = `👷 Tech: ${DB.getTechnician(s.loc_id)?.name || s.loc_id}`;
        } else if (s.loc_type === 'Installed_At_Customer') {
          positionText = `🏠 Customer Acc: ${s.loc_id}`;
        } else if (s.loc_type === 'Infrastructure') {
          positionText = `🌐 POP/Infra: ${DB.getLocation(s.loc_id)?.name || s.loc_id}`;
        } else {
          positionText = s.loc_id;
        }

        let warrantyText = '—';
        if (s.status === 'Scrapped') {
          warrantyText = `<span class="text-secondary" style="font-weight:600;">Reason: ${s.scrap_reason || 'Disposed'}</span>`;
        } else if (s.status === 'Returned_To_Vendor') {
          warrantyText = `<span class="text-secondary" style="font-weight:600;">Notes: ${s.return_vendor_notes || 'Returned'}</span>`;
        } else if (s.deployed_date) {
          const dDate = new Date(s.deployed_date);
          const wExpDate = new Date(dDate.setMonth(dDate.getMonth() + (s.warranty_months || 12)));
          const expDateStr = wExpDate.toISOString().slice(0, 10);
          const now = new Date();
          const isExpired = now > wExpDate;
          warrantyText = `<span style="color: ${isExpired ? 'var(--red)' : 'var(--green)'}; font-weight:600;">${isExpired ? 'Expired' : 'Active'} (Exp: ${expDateStr})</span>`;
        }

        let actionBtn = '';
        if (s.status === 'Faulty') {
          if (s.branch_id !== 'LOC001') {
            actionBtn = `<button class="btn btn-sm btn-primary" onclick="sendFaultyToCentral('${s.sn}', '${s.branch_id}')" style="font-size:9px; padding:3px 6px;">🚚 Return to Central</button>`;
          } else {
            actionBtn = `<div style="display:flex; gap:4px;">
              <button class="btn btn-sm btn-warning" onclick="openClaimWarrantyModal('${s.sn}')" style="font-size:9px; padding:3px 6px;">🚚 Return Vendor</button>
              <button class="btn btn-sm btn-scrap" onclick="openScrapModal('${s.sn}')" style="font-size:9px; padding:3px 6px;">✕ Scrap</button>
            </div>`;
          }
        } else if (['Sold', 'Scrapped', 'Returned_To_Vendor'].includes(s.status)) {
          actionBtn = '—';
        } else {
          actionBtn = `<button class="btn btn-sm btn-danger" onclick="markFaulty('${s.sn}')" style="font-size:9px; padding:3px 6px;">Mark Faulty</button>`;
        }

        return `
          <tr>
            <td class="mono fs-12">${idx + 1}</td>
            <td>
              <div class="mono fw-600" style="color:var(--accent);">${s.sn}</div>
              <div class="mono fs-11 text-muted">MAC: ${s.mac || 'N/A'}</div>
              ${photoHtml}
            </td>
            <td><div class="fw-600 fs-12">${it?.name || s.item_id}</div></td>
            <td><span class="badge ${badgeCls}">${status.replace(/_/g,' ')}</span></td>
            <td><div class="fw-600">${branchName}</div></td>
            <td class="fs-12">${positionText}</td>
            <td class="fs-11 mono">${warrantyText}</td>
            <td>${actionBtn}</td>
          </tr>`;
      }).join('');

      globalTableHtml = `
        <div class="card mb-16 animate-fade" style="border: 1px solid var(--accent);">
          <div class="card-hdr" style="margin-bottom: 12px;">
            <div>
              <div class="card-title" style="color: var(--accent-hover); font-size: 15px; display:flex; align-items:center; gap:8px;">
                🌐 Global Ecosystem Ledger — ${title}
              </div>
              <div class="card-subtitle">Showing all ${globalAssets.length} active matching units across all branches</div>
            </div>
            <span class="badge badge-purple mono" style="font-weight:700; font-size:12px;">${globalAssets.length} Total Units</span>
          </div>
          <div class="table-wrap" style="max-height: 280px; overflow-y: auto;">
            <table>
              <thead>
                <tr>
                  <th style="width:30px;">#</th>
                  <th>Serial & MAC</th>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Branch Assignment</th>
                  <th>Exact Current Position</th>
                  <th>Warranty Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${globalRows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  }

  document.getElementById('inv-global-table-container').innerHTML = globalTableHtml;

  const isFiltering = !!(search || loc || item || cat || status);
  const groupsToRender = Object.values(tempLocGroups).filter(g => !isFiltering || g.assets.length > 0 || g.consumables.length > 0);

  const html = groupsToRender.length ? `
    <div style="margin-top: 10px;">
      ${groupsToRender.map(group => renderWarehouseRow(group, isFiltering)).join('')}
    </div>` :
    `<div class="empty-state card"><div class="es-icon">🔍</div><h3>No matching warehouse stock found</h3><p>Try adjusting your search filters</p></div>`;

  document.getElementById('inv-results').innerHTML = html;

  // Render recent consumable logs scoped to active branch
  const logsContainer = document.getElementById('inv-consumable-logs-container');
  if (logsContainer) {
    let filteredLogs = DB.consumable_logs;
    if (isBranchKeeper) {
      filteredLogs = filteredLogs.filter(log => log.loc_id === locId);
    } else if (loc && !['With_Technician', 'Installed_At_Customer', 'Faulty', 'In_Transit'].includes(loc)) {
      filteredLogs = filteredLogs.filter(log => log.loc_id === loc);
    }

    // Sort logs by date descending, then ID descending
    filteredLogs = [...filteredLogs].sort((a, b) => {
      const dComp = b.date.localeCompare(a.date);
      if (dComp !== 0) return dComp;
      return b.id.localeCompare(a.id);
    });

    const recentLogs = filteredLogs.slice(0, 10);
    const logRows = recentLogs.map(log => {
      const it = DB.getItem(log.item_id);
      const tech = DB.getTechnician(log.tech_id);
      const locName = DB.getLocation(log.loc_id)?.name || log.loc_id;
      const locCol = isBranchKeeper ? '' : `<td>${locName}</td>`;
      const hasCoords = log.latitude && log.longitude && !isNaN(parseFloat(log.latitude)) && !isNaN(parseFloat(log.longitude));
      const mapLink = hasCoords 
        ? `<a href="#" onclick="event.preventDefault(); window.focusConsumableOnMap('${log.id}', '${log.latitude}', '${log.longitude}')" title="View on map" style="text-decoration:none; margin-left:6px; font-size:12px; filter: drop-shadow(0px 0px 1px rgba(0,0,0,0.5));">🗺️</a>`
        : '';
      return `
        <tr>
          <td class="mono fw-600">${log.id}${mapLink}</td>
          <td>${it?.name || log.item_id}</td>
          <td class="mono text-red" style="font-weight: 600;">-${log.qty_used} ${it?.uom || ''}</td>
          <td>${log.customer_acc || '—'}</td>
          <td>${tech?.name || '—'}</td>
          ${locCol}
          <td>${log.date ? String(log.date).substring(0, 10) : '—'}</td>
          <td class="fs-12 text-muted">${log.notes || '—'}</td>
        </tr>
      `;
    }).join('');

    const locHeaderCol = isBranchKeeper ? '' : '<th>Location</th>';

    logsContainer.innerHTML = `
      <div class="card mt-16">
        <div class="card-hdr" style="margin-bottom: 12px;">
          <div>
            <div class="card-title" style="font-size: 15px; display:flex; align-items:center; gap:8px;">
              📋 Recent Consumable Logs
            </div>
            <div class="card-subtitle">Showing the last 10 consumable usage actions for ${isBranchKeeper ? user.location_name : 'the selected location'}</div>
          </div>
        </div>
        ${logRows ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Log ID</th>
                  <th>Item</th>
                  <th>Qty Used</th>
                  <th>Customer Account</th>
                  <th>Technician</th>
                  ${locHeaderCol}
                  <th>Date</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${logRows}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state" style="padding: 20px;">
            <p>No recent consumable usage logs found</p>
          </div>
        `}
      </div>
    `;
  }
}

function renderWarehouseRow(group, isSearchActive) {
  const statusMap = {
    Available: { label: 'Available', cls: 'badge-green' },
    Assigned: { label: 'With Tech', cls: 'badge-orange' },
    Deployed: { label: 'Deployed', cls: 'badge-purple' },
    Faulty: { label: 'Faulty', cls: 'badge-red' },
    In_Transit: { label: 'In Transit', cls: 'badge-blue' }
  };

  // Status summaries for row header preview
  const badgeHtmls = [];
  Object.entries(group.statuses).forEach(([st, cnt]) => {
    if (cnt > 0 && statusMap[st]) {
      badgeHtmls.push(`<span class="badge ${statusMap[st].cls}" style="font-size:10px;">${statusMap[st].label}: ${cnt}</span>`);
    }
  });

  const consUOMs = {};
  group.consumables.forEach(c => {
    const item = DB.getItem(c.item_id);
    if (item && c.qty > 0) {
      const uom = item.uom || 'Pcs';
      consUOMs[uom] = (consUOMs[uom] || 0) + c.qty;
    }
  });
  Object.entries(consUOMs).forEach(([uom, qty]) => {
    badgeHtmls.push(`<span class="badge badge-blue" style="font-size:10px;">${qty.toLocaleString()} ${uom}</span>`);
  });

  const typeLabel = group.type === 'Central' ? 'Central Hub' : 'Branch';
  const barColor = group.type === 'Central' ? 'var(--purple)' : 'var(--orange)';

  // Sub-sections calculation
  const warehouseAssets = group.assets.filter(s => s.status === 'Available');
  const warehouseConsumables = group.consumables;

  // Group warehouse available items by model
  const warehouseItemGroups = {};
  warehouseAssets.forEach(s => {
    if (!warehouseItemGroups[s.item_id]) {
      warehouseItemGroups[s.item_id] = { item_id: s.item_id, category: 'Asset', qty: 0, assets: [] };
    }
    warehouseItemGroups[s.item_id].qty++;
    warehouseItemGroups[s.item_id].assets.push(s);
  });
  warehouseConsumables.forEach(c => {
    if (!warehouseItemGroups[c.item_id]) {
      warehouseItemGroups[c.item_id] = { item_id: c.item_id, category: 'Consumable', qty: 0, batch: c.batch, cs_id: c.id };
    }
    warehouseItemGroups[c.item_id].qty += c.qty;
  });

  const deployedAssets = group.assets.filter(s => s.status === 'Deployed');
  const techAssets = group.assets.filter(s => s.status === 'Assigned');
  const faultyAssets = group.assets.filter(s => s.status === 'Faulty');
  const transitAssets = group.assets.filter(s => s.status === 'In_Transit');

  // Build secondary expanded section contents
  const availableRows = Object.values(warehouseItemGroups).map(ig => {
    const it = DB.getItem(ig.item_id);
    const uom = it?.uom || 'Pcs';
    let actionBtn = '';
    
    if (ig.category === 'Asset') {
      const shelfKey = `${ig.item_id}_${group.loc_id}`;
      tempInvGroups[shelfKey] = { item_id: ig.item_id, location_name: group.name, assets: ig.assets };
      actionBtn = `<button class="btn btn-sm btn-primary" onclick="openShelfSerialsModal('${shelfKey}')" style="font-size:10px; padding:4px 8px;">🔎 View Serials</button>`;
      return `
        <tr>
          <td><div class="fw-600 fs-12">${it?.name || ig.item_id}</div><div class="fs-11 text-secondary">${ig.item_id}</div></td>
          <td><span class="badge badge-purple">Asset</span></td>
          <td><span class="badge badge-green mono">${ig.qty} ${uom}</span></td>
          <td><span class="text-secondary fs-12">Available in Warehouse</span></td>
          <td class="mono fs-12">NPR ${it?.unit_cost?.toLocaleString()}</td>
          <td>${actionBtn}</td>
        </tr>`;
    } else {
      actionBtn = `<button class="btn btn-sm btn-secondary" onclick="openConsumableLog('${ig.cs_id}','${ig.item_id}','${group.loc_id}')" style="font-size:10px; padding:4px 8px;">Log Usage</button>`;
      return `
        <tr>
          <td><div class="fw-600 fs-12">${it?.name || ig.item_id}</div><div class="fs-11 text-secondary">${ig.item_id}</div></td>
          <td><span class="badge badge-blue">Consumable</span></td>
          <td><span class="badge badge-blue mono" style="font-weight:700;">${ig.qty.toLocaleString()} ${uom}</span></td>
          <td><span class="text-muted fs-12">Batch: ${ig.batch}</span></td>
          <td class="mono fs-12">NPR ${it?.unit_cost?.toLocaleString()}</td>
          <td>${actionBtn}</td>
        </tr>`;
    }
  }).join('');

  const deployedRows = deployedAssets.map((s, idx) => {
    const it = DB.getItem(s.item_id);
    const techName = DB.getTechnician(s.deployed_tech_id)?.name || s.deployed_tech_id || 'N/A';
    let warrantyText = '—';
    if (s.deployed_date) {
      const dDate = new Date(s.deployed_date);
      const wExpDate = new Date(dDate.setMonth(dDate.getMonth() + (s.warranty_months || 12)));
      const expDateStr = wExpDate.toISOString().slice(0, 10);
      const now = new Date();
      const isExpired = now > wExpDate;
      warrantyText = `<span style="color: ${isExpired ? 'var(--red)' : 'var(--green)'}; font-weight:600;">${isExpired ? 'Expired' : 'Active'} (Exp: ${expDateStr})</span>`;
    }
    return `
      <tr>
        <td class="mono fs-12">${idx + 1}</td>
        <td><div class="mono fw-600" style="color:var(--accent);">${s.sn}</div><div class="mono fs-11 text-muted">MAC: ${s.mac || 'N/A'}</div></td>
        <td><div class="fw-600 fs-12">${it?.name || s.item_id}</div></td>
        <td class="mono fw-600">${s.loc_id}</td>
        <td>${techName}</td>
        <td class="mono fs-11">${s.deployed_date || 'N/A'}</td>
        <td class="fs-11 mono">${warrantyText}</td>
        <td>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            <button class="btn btn-sm btn-warning" onclick="openSwapDamagedModal('${s.sn}', '${s.loc_id}', '${group.loc_id}')" style="font-size:9px; padding:3px 6px; background:var(--orange); color:#fff; border:none; border-radius:4px;">🔄 Swap</button>
            <button class="btn btn-sm btn-secondary" onclick="openRecoverFromCustomerModal('${s.sn}', '${s.loc_id}', '${group.loc_id}')" style="font-size:9px; padding:3px 6px;">📦 Recover</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  const techRows = techAssets.map((s, idx) => {
    const it = DB.getItem(s.item_id);
    const techObj = DB.getTechnician(s.loc_id);
    return `
      <tr>
        <td class="mono fs-12">${idx + 1}</td>
        <td><div class="mono fw-600" style="color:var(--accent);">${s.sn}</div><div class="mono fs-11 text-muted">MAC: ${s.mac || 'N/A'}</div></td>
        <td><div class="fw-600 fs-12">${it?.name || s.item_id}</div></td>
        <td><div class="fw-600">${techObj?.name || s.loc_id}</div><div class="fs-11 text-secondary">${techObj?.phone || 'N/A'}</div></td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-sm btn-secondary" onclick="returnAssetToBranch('${s.sn}', '${group.loc_id}')" style="font-size:9px; padding:3px 6px;">Return Stock</button>
            <button class="btn btn-sm btn-danger" onclick="markFaulty('${s.sn}')" style="font-size:9px; padding:3px 6px;">Mark Faulty</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  const faultyRows = faultyAssets.map((s, idx) => {
    const it = DB.getItem(s.item_id);
    let exactLoc = '';
    if (s.loc_type === 'Central_Warehouse' || s.loc_type === 'Branch' || s.loc_type === 'Faulty') {
      exactLoc = '🏢 Warehouse';
    } else if (s.loc_type === 'With_Technician') {
      exactLoc = '👷 Tech: ' + (DB.getTechnician(s.loc_id)?.name || s.loc_id);
    } else if (s.loc_type === 'Infrastructure') {
      exactLoc = '🌐 POP/Infra: ' + (DB.getLocation(s.loc_id)?.name || s.loc_id);
    } else {
      exactLoc = `🏠 Cust Acc: ${s.loc_id}`;
    }
    let actionBtn = group.loc_id !== 'LOC001' 
      ? `<button class="btn btn-sm btn-primary" onclick="sendFaultyToCentral('${s.sn}', '${group.loc_id}')" style="font-size:9px; padding:3px 6px;">🚚 Return to Central</button>` 
      : `<div style="display:flex; gap:4px;">
          <button class="btn btn-sm btn-warning" onclick="openClaimWarrantyModal('${s.sn}')" style="font-size:9px; padding:3px 6px;">🚚 Return Vendor</button>
          <button class="btn btn-sm btn-scrap" onclick="openScrapModal('${s.sn}')" style="font-size:9px; padding:3px 6px;">✕ Scrap</button>
         </div>`;
    return `
      <tr>
        <td class="mono fs-12">${idx + 1}</td>
        <td><div class="mono fw-600" style="color:var(--accent);">${s.sn}</div><div class="mono fs-11 text-muted">MAC: ${s.mac || 'N/A'}</div></td>
        <td><div class="fw-600 fs-12">${it?.name || s.item_id}</div></td>
        <td><span class="badge badge-red">Faulty</span></td>
        <td>${exactLoc}</td>
        <td>${actionBtn}</td>
      </tr>`;
  }).join('');

  const transitRows = transitAssets.map((s, idx) => {
    const it = DB.getItem(s.item_id);
    return `
      <tr>
        <td class="mono fs-12">${idx + 1}</td>
        <td><div class="mono fw-600" style="color:var(--accent);">${s.sn}</div><div class="mono fs-11 text-muted">MAC: ${s.mac || 'N/A'}</div></td>
        <td><div class="fw-600 fs-12">${it?.name || s.item_id}</div></td>
        <td><span class="badge badge-blue">In Transit</span></td>
        <td class="mono fw-600">${s.loc_id}</td>
      </tr>`;
  }).join('');

  // Expand state logic based on search active
  const whDisplay = isSearchActive ? 'block' : 'none';
  const whClass = isSearchActive ? 'expanded' : '';
  const whArrowStyle = isSearchActive ? 'transform: rotate(180deg);' : '';
  
  // Section show/hide and expand logic based on active filter and item counts
  const totalConsQty = warehouseConsumables.reduce((sum, c) => sum + c.qty, 0);
  const availCount = warehouseAssets.length + totalConsQty;
  const showAvailSection = !isSearchActive || availCount > 0;
  const availSecWrapperStyle = showAvailSection ? 'display: block;' : 'display: none;';
  const availContentDisplay = (isSearchActive && availCount > 0) ? 'block' : 'none';
  const availCaretStyle = (isSearchActive && availCount > 0) ? 'transform: rotate(90deg);' : '';

  const deployedCount = deployedAssets.length;
  const showDeployedSection = !isSearchActive || deployedCount > 0;
  const deployedSecWrapperStyle = showDeployedSection ? 'display: block;' : 'display: none;';
  const deployedContentDisplay = (isSearchActive && deployedCount > 0) ? 'block' : 'none';
  const deployedCaretStyle = (isSearchActive && deployedCount > 0) ? 'transform: rotate(90deg);' : '';

  const techCount = techAssets.length;
  const showTechSection = !isSearchActive || techCount > 0;
  const techSecWrapperStyle = showTechSection ? 'display: block;' : 'display: none;';
  const techContentDisplay = (isSearchActive && techCount > 0) ? 'block' : 'none';
  const techCaretStyle = (isSearchActive && techCount > 0) ? 'transform: rotate(90deg);' : '';

  const faultyCount = faultyAssets.length;
  const showFaultySection = !isSearchActive || faultyCount > 0;
  const faultySecWrapperStyle = showFaultySection ? 'display: block;' : 'display: none;';
  const faultyContentDisplay = (isSearchActive && faultyCount > 0) ? 'block' : 'none';
  const faultyCaretStyle = (isSearchActive && faultyCount > 0) ? 'transform: rotate(90deg);' : '';

  const transitCount = transitAssets.length;
  const showTransitSection = !isSearchActive || transitCount > 0;
  const transitSecWrapperStyle = showTransitSection ? 'display: block;' : 'display: none;';
  const transitContentDisplay = (isSearchActive && transitCount > 0) ? 'block' : 'none';
  const transitCaretStyle = (isSearchActive && transitCount > 0) ? 'transform: rotate(90deg);' : '';

  return `
    <div id="warehouse-row-${group.loc_id}" class="warehouse-row ${whClass}" style="--bar-color: ${barColor};" onclick="toggleWarehouseExpand('${group.loc_id}')">
      <div style="display:flex; align-items:center; gap:20px;">
        <div>
          <h3 style="font-size:15px; font-weight:700; color:var(--text-primary);">${group.name}</h3>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:3px;">📍 ${group.city} | 👤 Mgr: ${group.manager} | <span class="text-secondary fw-600">${typeLabel}</span></div>
        </div>
      </div>
      
      <div class="status-badge-row" style="margin-left: 20px; flex: 1; justify-content: center;">
        ${badgeHtmls.join(' ') || '<span class="text-muted fs-11">No Active Inventory</span>'}
      </div>

      <div style="display:flex; align-items:center; gap:24px;">
        <div style="text-align:right;">
          <div style="font-size:9px; text-transform:uppercase; color:var(--text-secondary); font-weight:700; letter-spacing:0.05em;">Valuation</div>
          <div class="mono fw-800" style="color:var(--green); font-size:14px; margin-top:2px;">NPR ${group.total_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
        <span class="expand-caret" id="arrow-${group.loc_id}" style="${whArrowStyle}">▼</span>
      </div>
    </div>

    <div id="warehouse-details-${group.loc_id}" class="warehouse-details-container" style="display:${whDisplay};">
      
      <!-- Collapsible Ecosystem Sections -->
      <div class="ecosystem-section" style="${availSecWrapperStyle}">
        <div class="ecosystem-header" onclick="event.stopPropagation(); toggleEcosystemExpand('${group.loc_id}', 'available')">
          <span>🏢 Available Warehouse Stock (${availCount} Items)</span>
          <span class="expand-caret" id="icon-${group.loc_id}-available" style="${availCaretStyle}">▶</span>
        </div>
        <div id="ecosystem-content-${group.loc_id}-available" class="ecosystem-content" style="display:${availContentDisplay};">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Item Model</th><th>Category</th><th>Qty Available</th><th>Batch / Details</th><th>Unit Cost</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${availableRows || '<tr><td colspan="6" class="text-secondary" style="text-align:center; padding:12px;">No available stock physically present in the warehouse.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="ecosystem-section" style="${deployedSecWrapperStyle}">
        <div class="ecosystem-header" onclick="event.stopPropagation(); toggleEcosystemExpand('${group.loc_id}', 'deployed')">
          <span>🏠 Deployed at Customer (${deployedCount} Assets)</span>
          <span class="expand-caret" id="icon-${group.loc_id}-deployed" style="${deployedCaretStyle}">▶</span>
        </div>
        <div id="ecosystem-content-${group.loc_id}-deployed" class="ecosystem-content" style="display:${deployedContentDisplay};">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th style="width:30px;">#</th><th>Serial & MAC</th><th>Model</th><th>Customer Account</th><th>Deployed By</th><th>Deployed Date</th><th>Warranty Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${deployedRows || '<tr><td colspan="8" class="text-secondary" style="text-align:center; padding:12px;">No equipment deployed under this branch.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="ecosystem-section" style="${techSecWrapperStyle}">
        <div class="ecosystem-header" onclick="event.stopPropagation(); toggleEcosystemExpand('${group.loc_id}', 'tech')">
          <span>👷 With Technicians (${techCount} Assets)</span>
          <span class="expand-caret" id="icon-${group.loc_id}-tech" style="${techCaretStyle}">▶</span>
        </div>
        <div id="ecosystem-content-${group.loc_id}-tech" class="ecosystem-content" style="display:${techContentDisplay};">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th style="width:30px;">#</th><th>Serial & MAC</th><th>Model</th><th>Assigned Technician</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${techRows || '<tr><td colspan="5" class="text-secondary" style="text-align:center; padding:12px;">No gear issued to technicians of this branch.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="ecosystem-section" style="${faultySecWrapperStyle}">
        <div class="ecosystem-header" onclick="event.stopPropagation(); toggleEcosystemExpand('${group.loc_id}', 'faulty')">
          <span>⚠️ Faulty Stock (${faultyCount} Assets)</span>
          <span class="expand-caret" id="icon-${group.loc_id}-faulty" style="${faultyCaretStyle}">▶</span>
        </div>
        <div id="ecosystem-content-${group.loc_id}-faulty" class="ecosystem-content" style="display:${faultyContentDisplay};">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th style="width:30px;">#</th><th>Serial & MAC</th><th>Model</th><th>Status</th><th>Current Position</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${faultyRows || '<tr><td colspan="6" class="text-secondary" style="text-align:center; padding:12px;">No faulty gear registered at this branch.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="ecosystem-section" style="${transitSecWrapperStyle}">
        <div class="ecosystem-header" onclick="event.stopPropagation(); toggleEcosystemExpand('${group.loc_id}', 'transit')">
          <span>🚚 In Transit (${transitCount} Assets)</span>
          <span class="expand-caret" id="icon-${group.loc_id}-transit" style="${transitCaretStyle}">▶</span>
        </div>
        <div id="ecosystem-content-${group.loc_id}-transit" class="ecosystem-content" style="display:${transitContentDisplay};">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th style="width:30px;">#</th><th>Serial & MAC</th><th>Model</th><th>Status</th><th>Transfer ID</th></tr>
              </thead>
              <tbody>
                ${transitRows || '<tr><td colspan="5" class="text-secondary" style="text-align:center; padding:12px;">No shipments currently in transit to/from this branch.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  `;
}

function toggleWarehouseExpand(locId) {
  const details = document.getElementById(`warehouse-details-${locId}`);
  const row = document.getElementById(`warehouse-row-${locId}`);
  const arrow = document.getElementById(`arrow-${locId}`);
  
  if (!details) return;

  const isExpanded = details.style.display === 'block';

  if (isExpanded) {
    details.style.display = 'none';
    row.classList.remove('expanded');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  } else {
    details.style.display = 'block';
    row.classList.add('expanded');
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  }
}

function toggleEcosystemExpand(locId, sectionId) {
  const content = document.getElementById(`ecosystem-content-${locId}-${sectionId}`);
  const icon = document.getElementById(`icon-${locId}-${sectionId}`);
  
  if (!content) return;

  const isExpanded = content.style.display === 'block';

  if (isExpanded) {
    content.style.display = 'none';
    if (icon) icon.style.transform = 'rotate(0deg)';
  } else {
    content.style.display = 'block';
    if (icon) icon.style.transform = 'rotate(90deg)';
  }
}

// Second-Level: View Serial Numbers inside that item shelf modal (physical available warehouse stock)
function openShelfSerialsModal(groupKey) {
  const group = tempInvGroups[groupKey];
  if (!group) return;

  const it = DB.getItem(group.item_id);
  
  const serialRows = group.assets.map((s, idx) => {
    let warrantyText = '—';
    if (s.deployed_date) {
      const dDate = new Date(s.deployed_date);
      const wExpDate = new Date(dDate.setMonth(dDate.getMonth() + (s.warranty_months || 12)));
      const expDateStr = wExpDate.toISOString().slice(0, 10);
      const now = new Date();
      const isExpired = now > wExpDate;
      warrantyText = `<span style="color: ${isExpired ? 'var(--red)' : 'var(--green)'}; font-weight:600;">${isExpired ? 'Expired' : 'Active'} (Exp: ${expDateStr})</span>`;
    }

    let actionBtn = `<button class="btn btn-sm btn-danger" onclick="App.closeModal(); markFaulty('${s.sn}')" style="font-size:10px; padding:4px 8px; border-radius:4px;">Mark Faulty</button>`;

    return `<tr class="modal-shelf-tr" data-search="${s.sn.toLowerCase()} ${(s.mac||'').toLowerCase()}">
      <td><span class="mono fw-600">${idx + 1}</span></td>
      <td class="mono fw-600" style="color:var(--accent);">${s.sn}</td>
      <td class="mono">${s.mac || 'N/A'}</td>
      <td><span class="badge badge-green">Available</span></td>
      <td>🏢 Warehouse Stock</td>
      <td class="fs-11 mono">${warrantyText}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');

  App.showModal(`Shelf Serials Checklist — Available Stock`, `
    <div style="margin-bottom:14px; background:rgba(255,255,255,0.015); border:1px solid var(--border); border-radius:8px; padding:12px;">
      <div class="fw-700" style="font-size:14px;color:var(--accent);">${it?.name || group.item_id}</div>
      <div class="fs-12 text-secondary mt-4">Warehouse Location: <strong>${group.location_name}</strong> | Total Quantity: <strong>${group.assets.length} Units</strong></div>
    </div>

    <div class="fg" style="margin-bottom:12px">
      <input type="text" class="fi" id="modal-shelf-search" placeholder="🔍 Search serial or MAC on this shelf..." oninput="filterModalShelfSerials()"/>
    </div>

    <div class="table-wrap" style="max-height: 250px; overflow-y: auto;">
      <table id="modal-shelf-table">
        <thead>
          <tr>
            <th style="width: 40px;">#</th>
            <th>Serial Number</th>
            <th>MAC Address</th>
            <th>Status</th>
            <th>Exact Position</th>
            <th>Warranty Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${serialRows}
        </tbody>
      </table>
    </div>
  `, [{ label: 'Close Shelf Panel', cls: 'btn-secondary', onclick: 'App.closeModal()' }]);
}

function filterModalShelfSerials() {
  const query = (document.getElementById('modal-shelf-search')?.value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#modal-shelf-table tbody tr');
  rows.forEach(row => {
    const searchData = row.getAttribute('data-search') || '';
    if (!query || searchData.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function markFaulty(sn) {
  const s = DB.serialized.find(x => x.sn === sn);
  if (!s) return;
  App.showModal('Mark Item as Faulty', `
    <div class="fg"><label class="fl">Serial Number</label><input class="fi" value="${sn}" readonly/></div>
    <div class="fg"><label class="fl">Item</label><input class="fi" value="${DB.getItem(s.item_id)?.name}" readonly/></div>
    <div class="fg"><label class="fl">Reason</label><select class="fi" id="fault-reason">
      <option>Physical Damage</option><option>Power Surge</option><option>Customer Returned</option><option>Manufacturing Defect</option><option>Other</option>
    </select></div>
    <div class="fg"><label class="fl">Notes</label><textarea class="fi" id="fault-notes" rows="3" placeholder="Optional notes..."></textarea></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'Mark as Faulty', cls:'btn-danger', onclick:`confirmFaulty('${sn}')` }
  ]);
}

async function confirmFaulty(sn) {
  try {
    await DB.markAssetAsFaulty(sn);
    App.closeModal();
    App.toast('Item marked as faulty', 'warning');
    applyInvFilter();
  } catch (e) {
    App.toast(`Failed to mark faulty: ${e.message}`, 'error');
  }
}

function openConsumableLog(csId, itemId, locId) {
  const it = DB.getItem(itemId);
  const cs = DB.consumable_stock.find(c => c.id === csId);
  const techOptions = DB.technicians.filter(t => t.branch_id === locId || true).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  App.showModal('Log Consumable Usage', `
    <div class="fg"><label class="fl">Item</label><input class="fi" value="${it?.name}" readonly/></div>
    <div class="fg"><label class="fl">Current Stock</label><input class="fi" value="${cs?.qty?.toLocaleString()} ${it?.uom}" readonly/></div>
    <div class="fg"><label class="fl">Qty Used (${it?.uom})</label><input type="number" class="fi" id="use-qty" min="1" max="${cs?.qty}" placeholder="e.g. 75"/></div>
    
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; margin-top:12px;">
      <input type="checkbox" id="is-trunk-use" onchange="toggleTrunkUsage(this)" style="width:16px; height:16px; cursor:pointer;" />
      <label for="is-trunk-use" style="font-size:12px; font-weight:600; cursor:pointer; user-select:none;">🛠️ Use for Internal Network (Not a customer)</label>
    </div>
    
    <div id="trunk-coords-container" style="display:none; margin-bottom:12px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="fg" style="margin-bottom:0;"><label class="fl">Latitude (optional)</label><input class="fi" id="use-lat" placeholder="e.g. 27.70076"/></div>
        <div class="fg" style="margin-bottom:0;"><label class="fl">Longitude (optional)</label><input class="fi" id="use-lng" placeholder="e.g. 85.30014"/></div>
      </div>
    </div>
    
    <div class="fg"><label class="fl" id="cust-label">Customer Account #</label><input class="fi" id="use-cust" placeholder="e.g. CUST-10923"/></div>
    <div class="fg"><label class="fl">Technician</label><select class="fi" id="use-tech"><option value="">-- Select --</option>${techOptions}</select></div>
    <div class="fg"><label class="fl">Notes</label><textarea class="fi" id="use-notes" rows="2" placeholder="Installation or infrastructure route details..."></textarea></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'Log Usage', cls:'btn-primary', onclick:`confirmConsumableLog('${csId}','${locId}','${itemId}')` }
  ]);
}

async function confirmConsumableLog(csId, locId, itemId) {
  const qty = parseInt(document.getElementById('use-qty')?.value);
  const cust = document.getElementById('use-cust')?.value;
  const tech = document.getElementById('use-tech')?.value;
  const notes = document.getElementById('use-notes')?.value;
  
  const isTrunk = document.getElementById('is-trunk-use')?.checked;
  const lat = isTrunk ? (document.getElementById('use-lat')?.value || '').trim() || null : null;
  const lng = isTrunk ? (document.getElementById('use-lng')?.value || '').trim() || null : null;
  
  const cs = DB.consumable_stock.find(c => c.id === csId);
  if (!qty || qty <= 0) { App.toast('Enter a valid quantity', 'error'); return; }
  if (qty > cs.qty) { App.toast('Quantity exceeds available stock', 'error'); return; }
  
  const logId = DB.nextId('LOG', DB.consumable_logs);
  
  try {
    await DB.logConsumableUsage({
      id: logId,
      item_id: itemId,
      loc_id: locId,
      qty_used: qty,
      customer_acc: cust,
      date: new Date().toISOString().slice(0,10),
      tech_id: tech,
      notes: notes,
      latitude: lat,
      longitude: lng
    });
    
    App.closeModal();
    App.toast(`Usage logged: ${qty} ${DB.getItem(itemId)?.uom} consumed`, 'success');
    applyInvFilter();
  } catch (e) {
    App.toast(`Failed to log usage: ${e.message}`, 'error');
  }
}

async function returnAssetToBranch(sn, branchId) {
  if (confirm(`Are you sure you want to return asset ${sn} back to the warehouse physical stock?`)) {
    try {
      await DB.returnAssetFromTech(sn, branchId);
      App.toast('Asset returned to physical stock successfully!', 'success');
      applyInvFilter();
    } catch (e) {
      App.toast(`Failed to return asset: ${e.message}`, 'error');
    }
  }
}

// Reverse Logistics: Dispatch faulty asset back to Kathmandu Central Hub
async function sendFaultyToCentral(sn, currentLocId) {
  const s = DB.serialized.find(x => x.sn === sn);
  if (!s) return;
  
  if (confirm(`Are you sure you want to transfer the faulty asset ${sn} back to Kathmandu Central Hub?`)) {
    const trfId = DB.nextId('TRF', DB.transfers);
    const currentUser = getCurrentUser(); // Exposed from js/auth.js
    
    try {
      await DB.saveTransfer({
        id: trfId,
        from_loc: currentLocId,
        to_loc: 'LOC001',
        status: 'In_Transit', // Automatically mark as In Transit directly
        notes: `Automated return of faulty asset ${sn} from ${DB.getLocation(currentLocId)?.name || currentLocId} to Kathmandu Central Hub.`,
        created_by: currentUser?.name || 'Storekeeper',
        items: [{
          item_id: s.item_id,
          qty: 1,
          serials: [sn]
        }]
      });
      
      App.toast(`Faulty asset ${sn} successfully dispatched back to Central (Transfer ${trfId})!`, 'success');
      applyInvFilter();
    } catch (e) {
      App.toast(`Failed to initiate return: ${e.message}`, 'error');
    }
  }
}

function exportInventoryCSV() {
  const rows = [['Serial/Batch','Item','Category','MAC','Location','Status','Unit Value']];
  DB.serialized.forEach(s => {
    if (s.status === 'Returned_To_Vendor' || s.status === 'Scrapped') return;
    const it = DB.getItem(s.item_id);
    rows.push([s.sn, it?.name, 'Asset', s.mac||'', s.loc_type+':'+s.loc_id, s.status, it?.unit_cost]);
  });
  DB.consumable_stock.forEach(c => {
    const it = DB.getItem(c.item_id);
    rows.push([c.batch, it?.name, 'Consumable', '', c.loc_id, 'In Stock', c.unit_cost]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fwcpl_inventory.csv';
  a.click();
  App.toast('Inventory exported as CSV', 'success');
}

// ─── CUSTOMER ASSET RECOVERY FUNCTIONS ───

// Case 1: Swap Damaged Router — Pick a replacement from branch stock
function openSwapDamagedModal(faultySn, customerAcc, branchId) {
  const s = DB.serialized.find(x => x.sn === faultySn);
  if (!s) return;
  const it = DB.getItem(s.item_id);
  
  // Get available replacement assets from the same branch (same item type preferred first, then all)
  const sameTypeAvailable = DB.serialized.filter(a => 
    a.status === 'Available' && a.branch_id === branchId && a.item_id === s.item_id && a.sn !== faultySn
  );
  const otherAvailable = DB.serialized.filter(a => 
    a.status === 'Available' && a.branch_id === branchId && a.item_id !== s.item_id && 
    DB.getItem(a.item_id)?.category === 'Asset'
  );
  
  const replOptions = [
    ...sameTypeAvailable.map(a => {
      const ait = DB.getItem(a.item_id);
      return `<option value="${a.sn}">[Same Model] ${ait?.name} — ${a.sn}</option>`;
    }),
    ...otherAvailable.map(a => {
      const ait = DB.getItem(a.item_id);
      return `<option value="${a.sn}">[Other] ${ait?.name} — ${a.sn}</option>`;
    })
  ].join('');

  const techOptions = DB.technicians.filter(t => t.status === 'Active').map(t => 
    `<option value="${t.id}" ${t.id === s.deployed_tech_id ? 'selected' : ''}>${t.name} (${DB.getLocation(t.branch_id)?.name || t.branch_id})</option>`
  ).join('');

  if (!sameTypeAvailable.length && !otherAvailable.length) {
    App.showModal('⚠️ No Replacement Available', `
      <div style="text-align:center; padding:20px;">
        <div style="font-size:48px; margin-bottom:12px;">📭</div>
        <p style="color:var(--text-secondary); font-size:14px;">No available assets found at <strong>${DB.getLocation(branchId)?.name || branchId}</strong> to replace the damaged router.</p>
        <p style="color:var(--text-muted); font-size:12px; margin-top:8px;">Transfer stock from Central Warehouse first, then retry the swap.</p>
      </div>
    `, [{ label: 'Close', cls: 'btn-secondary', onclick: 'App.closeModal()' }]);
    return;
  }

  App.showModal('🔄 Swap Damaged Router', `
    <div style="background:rgba(255,165,0,0.08); border:1px solid rgba(255,165,0,0.25); border-radius:8px; padding:12px; margin-bottom:16px;">
      <div style="font-size:12px; color:var(--orange); font-weight:600;">⚠️ Damaged Asset Swap</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
        The faulty router will be sent to Central Warehouse (LOC001) automatically. A replacement will be deployed to the same customer.
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
      <div class="fg"><label class="fl">Faulty Serial Number</label><input class="fi mono" value="${faultySn}" readonly style="color:var(--red); font-weight:600;"/></div>
      <div class="fg"><label class="fl">Item Model</label><input class="fi" value="${it?.name || s.item_id}" readonly/></div>
    </div>
    <div class="fg"><label class="fl">Customer Account</label><input class="fi mono" value="${customerAcc}" readonly style="font-weight:600;"/></div>
    
    <div style="border-top:1px solid var(--border); margin:16px 0; padding-top:16px;"></div>
    <h4 style="font-size:12px; text-transform:uppercase; color:var(--green); letter-spacing:0.5px; margin-bottom:12px;">🆕 Select Replacement</h4>
    
    <div class="fg"><label class="fl">Replacement Asset Serial</label>
      <select class="fi" id="swap-replacement-sn">${replOptions}</select>
    </div>
    <div class="fg"><label class="fl">Technician (Performing Swap)</label>
      <select class="fi" id="swap-tech-id"><option value="">-- Select Technician --</option>${techOptions}</select>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: '🔄 Confirm Swap', cls: 'btn-primary', onclick: `confirmSwapDamaged('${faultySn}', '${customerAcc}', '${branchId}')` }
  ]);
}

async function confirmSwapDamaged(faultySn, customerAcc, branchId) {
  const replacementSn = document.getElementById('swap-replacement-sn')?.value;
  const techId = document.getElementById('swap-tech-id')?.value;
  
  if (!replacementSn) { App.toast('Please select a replacement asset', 'error'); return; }

  try {
    await DB.swapDamagedAsset(faultySn, replacementSn, customerAcc, techId, branchId);
    App.closeModal();
    App.toast(`✅ Swap complete! ${faultySn} → Central (Faulty), ${replacementSn} → Customer ${customerAcc}`, 'success');
    applyInvFilter();
  } catch (e) {
    App.toast(`Swap failed: ${e.message}`, 'error');
  }
}

// Case 2: Recover Router from Customer (Non-Renewal)
function openRecoverFromCustomerModal(sn, customerAcc, branchId) {
  const s = DB.serialized.find(x => x.sn === sn);
  if (!s) return;
  const it = DB.getItem(s.item_id);
  const branchName = DB.getLocation(branchId)?.name || branchId;

  App.showModal('📦 Recover Asset from Customer', `
    <div style="background:rgba(100,149,237,0.08); border:1px solid rgba(100,149,237,0.25); border-radius:8px; padding:12px; margin-bottom:16px;">
      <div style="font-size:12px; color:var(--blue); font-weight:600;">📋 Non-Renewal Recovery</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
        This will return the router to <strong>${branchName}</strong> as available stock, ready to be redeployed to another customer.
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="fg"><label class="fl">Serial Number</label><input class="fi mono" value="${sn}" readonly style="font-weight:600; color:var(--accent);"/></div>
      <div class="fg"><label class="fl">Item Model</label><input class="fi" value="${it?.name || s.item_id}" readonly/></div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="fg"><label class="fl">Customer Account</label><input class="fi mono" value="${customerAcc}" readonly/></div>
      <div class="fg"><label class="fl">Return To</label><input class="fi" value="🏢 ${branchName}" readonly style="color:var(--green); font-weight:600;"/></div>
    </div>

    <div style="margin-top:8px; padding:10px; background:rgba(255,255,255,0.02); border-radius:6px; border:1px solid var(--border);">
      <div style="font-size:11px; color:var(--text-muted);">
        ✓ Asset status will change from <strong style="color:var(--orange);">Deployed</strong> → <strong style="color:var(--green);">Available</strong><br/>
        ✓ Router will be available for reuse within <strong>${branchName}</strong>
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: '📦 Confirm Recovery', cls: 'btn-success', onclick: `confirmRecoverFromCustomer('${sn}', '${branchId}')` }
  ]);
}

async function confirmRecoverFromCustomer(sn, branchId) {
  try {
    await DB.recoverAssetFromCustomer(sn, branchId);
    App.closeModal();
    App.toast(`✅ Asset ${sn} recovered from customer and returned to ${DB.getLocation(branchId)?.name || branchId}`, 'success');
    applyInvFilter();
  } catch (e) {
    App.toast(`Recovery failed: ${e.message}`, 'error');
  }
}

// Global expose hooks
window.sendFaultyToCentral = sendFaultyToCentral;
window.inventoryMounted = inventoryMounted;
window.applyInvFilter = applyInvFilter;
window.openShelfSerialsModal = openShelfSerialsModal;
window.filterModalShelfSerials = filterModalShelfSerials;
window.markFaulty = markFaulty;
window.confirmFaulty = confirmFaulty;
window.openConsumableLog = openConsumableLog;
window.confirmConsumableLog = confirmConsumableLog;
window.returnAssetToBranch = returnAssetToBranch;
window.exportInventoryCSV = exportInventoryCSV;
window.toggleWarehouseExpand = toggleWarehouseExpand;
window.toggleEcosystemExpand = toggleEcosystemExpand;
window.openSwapDamagedModal = openSwapDamagedModal;
window.confirmSwapDamaged = confirmSwapDamaged;
window.openRecoverFromCustomerModal = openRecoverFromCustomerModal;
window.confirmRecoverFromCustomer = confirmRecoverFromCustomer;
window.openScrapModal = openScrapModal;
window.submitScrapAsset = submitScrapAsset;

function openClaimWarrantyModal(sn) {
  const s = DB.serialized.find(x => x.sn === sn);
  if (!s) return;
  const it = DB.getItem(s.item_id);

  // Link via po_id first, fallback to invoice_no
  const po = s.po_id ? DB.procurements.find(p => p.id === s.po_id) : ((s.invoice_no && s.invoice_no !== 'N/A') ? DB.procurements.find(p => p.invoice_no === s.invoice_no) : null);

  let warrantyInfoHtml = '';
  let invoiceSelectHtml = '';

  if (po) {
    const purchaseDate = po.date;
    const warrantyMonths = s.warranty_months || 12;
    const dDate = new Date(purchaseDate);
    const wExpDate = new Date(dDate.setMonth(dDate.getMonth() + warrantyMonths));
    const expDateStr = wExpDate.toISOString().slice(0, 10);
    const now = new Date();
    const isExpired = now > wExpDate;
    const warrantyStatusBadge = `<span class="badge ${isExpired ? 'badge-red' : 'badge-green'}" style="font-weight:600;">${isExpired ? 'Expired' : 'Active'}</span>`;

    warrantyInfoHtml = `
      <div style="background:var(--bg-card2); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:12px; font-size:12px; line-height:1.6;">
        <div style="font-weight:700; color:var(--accent); margin-bottom:6px;">📋 Linked Purchase Details</div>
        <div>Vendor: <strong>${po.vendor}</strong></div>
        <div>Purchase Order: <strong>${po.id}</strong></div>
        <div>Bill/Invoice Number: <strong>${po.invoice_no || 'N/A'}</strong></div>
        <div>Purchase Date: <strong>${po.date}</strong></div>
        <div style="margin-top:6px;">Warranty status: ${warrantyStatusBadge} (Exp: ${expDateStr})</div>
      </div>
    `;
    invoiceSelectHtml = `<input type="hidden" id="claim-po-id" value="${po.id}" />`;
  } else {
    // Show select dropdown of received POs that match this item
    const matchingPOs = DB.procurements.filter(p => p.status === 'Received' && p.items.some(pi => pi.item_id === s.item_id));
    const poOptions = matchingPOs
      .map(p => `<option value="${p.id}">${p.vendor} (PO: ${p.id} | Invoice: ${p.invoice_no || 'N/A'} - ${p.date})</option>`)
      .join('');

    warrantyInfoHtml = `
      <div style="background:rgba(255, 165, 0, 0.05); border:1px solid var(--orange); border-radius:8px; padding:12px; margin-bottom:12px; font-size:12px; color:var(--text); line-height:1.5;">
        <strong>⚠ No purchase order linked to this serial number</strong>
        <p style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
          This serial number is not yet associated with a purchase. Please select the purchase order below to link it.
        </p>
      </div>
    `;

    if (poOptions.length > 0) {
      invoiceSelectHtml = `
        <div class="fg">
          <label class="fl">Select Purchase Order to Link</label>
          <select class="fi" id="claim-po-id" onchange="updateClaimWarrantyInfo('${sn}')">
            <option value="">-- Choose Purchase Order --</option>
            ${poOptions}
          </select>
        </div>
        <div id="dynamic-claim-po-info"></div>
      `;
    } else {
      invoiceSelectHtml = `
        <div class="fg">
          <label class="fl">Select Purchase Order</label>
          <div style="color:var(--red); font-size:11px; font-weight:600;">No purchase orders found in the system for this item model.</div>
          <input type="hidden" id="claim-po-id" value="__NO_POS__" />
        </div>
      `;
    }
  }

  App.showModal('🚚 Return Faulty Stock to Vendor', `
    <div style="background:rgba(255, 140, 0, 0.08); border:1px solid rgba(255, 140, 0, 0.25); border-radius:8px; padding:12px; margin-bottom:16px;">
      <div style="font-size:12px; color:var(--orange); font-weight:600;">🚚 Vendor Return (Warranty Claim)</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
        This action will send the faulty hardware back to the vendor. It will be removed from your warehouse inventory and tracked under the purchase statement.
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="fg"><label class="fl">Serial Number</label><input class="fi mono" value="${sn}" readonly style="font-weight:600; color:var(--accent);"/></div>
      <div class="fg"><label class="fl">Item Model</label><input class="fi" value="${it?.name || s.item_id}" readonly/></div>
    </div>

    ${warrantyInfoHtml}
    ${invoiceSelectHtml}

    <div class="fg">
      <label class="fl">Claim/Return Details / Notes</label>
      <textarea class="fi" id="claim-notes" rows="3" placeholder="Enter RMA claim details, courier reference, or vendor case ID..."></textarea>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: '🚚 Confirm Send to Vendor', cls: 'btn-warning', onclick: `submitWarrantyClaim('${sn}')` }
  ]);
}

function updateClaimWarrantyInfo(sn) {
  const poId = document.getElementById('claim-po-id')?.value;
  const container = document.getElementById('dynamic-claim-po-info');
  if (!container) return;

  if (!poId) {
    container.innerHTML = '';
    return;
  }

  const po = DB.procurements.find(p => p.id === poId);
  const s = DB.serialized.find(x => x.sn === sn);
  if (!po || !s) {
    container.innerHTML = '';
    return;
  }

  const purchaseDate = po.date;
  const warrantyMonths = s.warranty_months || 12;
  const dDate = new Date(purchaseDate);
  const wExpDate = new Date(dDate.setMonth(dDate.getMonth() + warrantyMonths));
  const expDateStr = wExpDate.toISOString().slice(0, 10);
  const now = new Date();
  const isExpired = now > wExpDate;
  const warrantyStatusBadge = `<span class="badge ${isExpired ? 'badge-red' : 'badge-green'}" style="font-weight:600;">${isExpired ? 'Expired' : 'Active'}</span>`;

  container.innerHTML = `
    <div style="background:var(--bg-card2); border:1px solid var(--border); border-radius:8px; padding:10px; margin-top:8px; font-size:11px; line-height:1.5;">
      <div>Vendor: <strong>${po.vendor}</strong></div>
      <div>Invoice/Bill: <strong>${po.invoice_no || 'N/A'}</strong></div>
      <div>Purchase Date: <strong>${po.date}</strong></div>
      <div>Warranty: ${warrantyStatusBadge} (Exp: ${expDateStr})</div>
    </div>
  `;
}

async function submitWarrantyClaim(sn) {
  const poId = document.getElementById('claim-po-id')?.value;
  const notes = document.getElementById('claim-notes')?.value;

  if (!poId || poId === '__NO_POS__') {
    App.toast('Please select or verify the purchase order first.', 'error');
    return;
  }

  try {
    await DB.returnAssetToVendor(sn, poId, notes);
    App.closeModal();
    App.toast(`✅ Faulty serial ${sn} successfully returned to vendor.`, 'success');
    applyInvFilter();
  } catch (e) {
    App.toast(`Return failed: ${e.message}`, 'error');
  }
}

window.openClaimWarrantyModal = openClaimWarrantyModal;
window.updateClaimWarrantyInfo = updateClaimWarrantyInfo;
window.submitWarrantyClaim = submitWarrantyClaim;

function openScrapModal(sn) {
  const s = DB.serialized.find(x => x.sn === sn);
  if (!s) return;
  const it = DB.getItem(s.item_id);

  // Link via po_id first, fallback to invoice_no
  const po = s.po_id ? DB.procurements.find(p => p.id === s.po_id) : ((s.invoice_no && s.invoice_no !== 'N/A') ? DB.procurements.find(p => p.invoice_no === s.invoice_no) : null);

  let warrantyInfoHtml = '';
  let activeWarrantyWarning = '';

  if (po) {
    const purchaseDate = po.date;
    const warrantyMonths = s.warranty_months || 12;
    const dDate = new Date(purchaseDate);
    const wExpDate = new Date(dDate.setMonth(dDate.getMonth() + warrantyMonths));
    const expDateStr = wExpDate.toISOString().slice(0, 10);
    const now = new Date();
    const isExpired = now > wExpDate;
    const warrantyStatusBadge = `<span class="badge ${isExpired ? 'badge-red' : 'badge-green'}" style="font-weight:600;">${isExpired ? 'Expired' : 'Active'}</span>`;

    warrantyInfoHtml = `
      <div style="background:var(--bg-card2); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:12px; font-size:12px; line-height:1.6;">
        <div style="font-weight:700; color:var(--accent); margin-bottom:6px;">📋 Linked Purchase Details</div>
        <div>Vendor: <strong>${po.vendor}</strong></div>
        <div>Purchase Order: <strong>${po.id}</strong></div>
        <div>Bill/Invoice Number: <strong>${po.invoice_no || 'N/A'}</strong></div>
        <div>Purchase Date: <strong>${po.date}</strong></div>
        <div style="margin-top:6px;">Warranty status: ${warrantyStatusBadge} (Exp: ${expDateStr})</div>
      </div>
    `;

    if (!isExpired) {
      activeWarrantyWarning = `
        <div style="background:rgba(239, 68, 68, 0.15); border:1px solid var(--red); color:var(--red); border-radius:8px; padding:12px; margin-bottom:12px; font-size:11px; font-weight:600; line-height:1.4;">
          ⚠️ ALERT: This device has active warranty until ${expDateStr}! You should consider returning it to the vendor (${po.vendor}) instead of scrapping it.
        </div>
      `;
    }
  } else {
    warrantyInfoHtml = `
      <div style="background:var(--bg-card2); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:12px; font-size:12px;">
        <span style="color:var(--text-muted)">No linked purchase order found to verify warranty status.</span>
      </div>
    `;
  }

  App.showModal('✕ Scrap / Write Off Asset', `
    <div style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.25); border-radius:8px; padding:12px; margin-bottom:16px;">
      <div style="font-size:12px; color:var(--red); font-weight:600;">⚠️ Scrap Asset (Permanent Write-off)</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
        This action will permanently write-off the device as scrap. It will be removed from active inventory ledger and stock valuation.
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
      <div class="fg"><label class="fl">Serial Number</label><input class="fi mono" value="${sn}" readonly style="font-weight:600; color:var(--accent);"/></div>
      <div class="fg"><label class="fl">Item Model</label><input class="fi" value="${it?.name || s.item_id}" readonly/></div>
    </div>

    ${activeWarrantyWarning}
    ${warrantyInfoHtml}

    <div class="fg">
      <label class="fl">Scrap Reason</label>
      <select class="fi" id="scrap-reason">
        <option value="Expired Warranty & Dead">Expired Warranty & Dead</option>
        <option value="Beyond Economic Repair">Beyond Economic Repair</option>
        <option value="Physical/Water Damage">Physical/Water Damage</option>
        <option value="Obsolete/Retired Model">Obsolete/Retired Model</option>
        <option value="Other">Other</option>
      </select>
    </div>

    <div class="fg">
      <label class="fl">Additional Disposal Details / Notes</label>
      <textarea class="fi" id="scrap-notes" rows="3" placeholder="Enter disposal reference, e-waste details, or reasons..."></textarea>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: '✕ Confirm Write-off as Scrap', cls: 'btn-scrap', onclick: `submitScrapAsset('${sn}')` }
  ]);
}

async function submitScrapAsset(sn) {
  const reason = document.getElementById('scrap-reason')?.value;
  const notes = document.getElementById('scrap-notes')?.value;

  try {
    await DB.scrapAsset(sn, reason, notes);
    App.closeModal();
    App.toast(`Asset ${sn} has been successfully scrapped and written off.`, 'success');
    applyInvFilter();
  } catch (e) {
    App.toast(`Failed to scrap asset: ${e.message}`, 'error');
  }
}

function openImportSerialsModal() {
  const itemOpts = DB.items.map(i => `<option value="${i.id}">${i.name} [${i.category}] (${i.id})</option>`).join('');
  const nextItemId = DB.nextId('ITM', DB.items);
  
  const destNodes = DB.locations;
  const destOpts = destNodes.map(l => `<option value="${l.id}">${l.name} (${l.type})</option>`).join('');

  App.showModal('Bulk Import Inventory Assets or Consumables', `
    <div class="fg">
      <label class="fl">Select Product Catalog Model</label>
      <select class="fi" id="import-item-id" onchange="handleImportItemChange(this.value)">
        <option value="">-- Select Catalog Model --</option>
        ${itemOpts}
        <option value="NEW_ITEM" style="font-weight:bold;color:var(--accent)">➕ [Create New Item on the fly...]</option>
      </select>
    </div>

    <div class="fg" id="import-mode-fg">
      <label class="fl">Placement / Status (For Assets Only)</label>
      <select class="fi" id="import-mode" onchange="handleImportModeChange(this.value)">
        <option value="Available">Available Stock (in Warehouse)</option>
        <option value="Deployed">Already Deployed to Customers</option>
      </select>
    </div>

    <!-- Inline new catalog item creation sub-form -->
    <div id="import-new-item-fields" style="display:none;background:rgba(255,255,255,0.02);padding:12px;border-radius:6px;margin-bottom:15px;border:1px dashed rgba(255,255,255,0.15)">
      <div style="font-weight:600;margin-bottom:8px;font-size:12px;color:var(--accent)">Create New Catalog blueprint:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div class="fg" style="margin-bottom:0">
          <label class="fl" style="font-size:11px">Generated Item ID</label>
          <input class="fi" id="import-new-id" value="${nextItemId}" readonly style="opacity:0.6;font-family:monospace" />
        </div>
        <div class="fg" style="margin-bottom:0">
          <label class="fl" style="font-size:11px">Item Category</label>
          <select class="fi" id="import-new-category" onchange="handleImportCategoryChange(this.value)">
            <option value="Asset">Asset (has serial numbers)</option>
            <option value="Consumable">Consumable (no serials, e.g. wire, RJ45)</option>
          </select>
        </div>
      </div>
      <div class="fg" style="margin-bottom:8px">
        <label class="fl" style="font-size:11px">Product Model Name</label>
        <input class="fi" id="import-new-name" placeholder="e.g. CAT6 Cable Box" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="fg" style="margin-bottom:0">
          <label class="fl" style="font-size:11px">Base Unit Cost (NPR)</label>
          <input type="number" class="fi" id="import-new-cost" placeholder="e.g. 15000" />
        </div>
        <div class="fg" style="margin-bottom:0">
          <label class="fl" style="font-size:11px">Reorder Level (Units)</label>
          <input type="number" class="fi" id="import-new-reorder" value="5" />
        </div>
      </div>
    </div>

    <div class="fg">
      <label class="fl">Receiving Warehouse Location</label>
      <select class="fi" id="import-loc">${destOpts}</select>
    </div>

    <!-- For Assets: Serial Numbers Textarea -->
    <div class="fg" id="import-serials-fg">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <label class="fl" style="margin-bottom:0;">Serial Numbers List <span style="color:var(--red)">*</span></label>
        <div style="display:flex; align-items:center; gap:6px;">
          <input type="file" id="import-csv-file" accept=".csv,.txt" style="display:none" onchange="handleCSVUpload(this)"/>
          <button class="btn btn-secondary btn-xs" onclick="document.getElementById('import-csv-file').click()" type="button" style="padding:3px 8px; font-size:10px; border-radius:4px; display:inline-flex; align-items:center; gap:3px;">📎 Upload CSV File</button>
        </div>
      </div>
      <span class="text-muted fs-11" style="display:block; margin-bottom:4px;">Upload a '.csv' file (Serial Numbers in first column) or copy & paste from Excel directly.</span>
      <textarea class="fi" id="import-serials" rows="6" placeholder="e.g.&#10;SN-88776655&#10;SN-88776656" style="font-family:monospace; min-height:100px; font-size:12px;"></textarea>
    </div>

    <!-- For Consumables: Quantity & Batch -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="fg" id="import-qty-fg" style="display:none;">
        <label class="fl">Consumable Quantity to Import <span style="color:var(--red)">*</span></label>
        <input type="number" class="fi" id="import-qty" placeholder="e.g. 500" />
      </div>
      <div class="fg" id="import-batch-fg" style="display:none;">
        <label class="fl">Batch Number (Optional)</label>
        <input class="fi" id="import-batch" placeholder="e.g. BATCH-IMPORT-1" />
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="fg">
        <label class="fl">Purchase Cost per Unit (Optional)</label>
        <input type="number" class="fi" id="import-cost" placeholder="Leave blank to use catalog cost" />
      </div>
      <div class="fg">
        <label class="fl">Warranty (Months)</label>
        <input type="number" class="fi" id="import-warranty" value="12" />
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: '📥 Start Bulk Import', cls: 'btn-primary', onclick: 'submitBulkImportSerials()' }
  ]);
}
window.openImportSerialsModal = openImportSerialsModal;

function handleImportItemChange(value) {
  const container = document.getElementById('import-new-item-fields');
  if (value === 'NEW_ITEM') {
    if (container) container.style.display = 'block';
    const newCat = document.getElementById('import-new-category')?.value || 'Asset';
    handleImportCategoryChange(newCat);
  } else {
    if (container) container.style.display = 'none';
    if (value) {
      const item = DB.getItem(value);
      if (item) {
        handleImportCategoryChange(item.category);
      }
    } else {
      handleImportCategoryChange('Asset');
    }
  }
}
window.handleImportItemChange = handleImportItemChange;

function handleImportCategoryChange(category) {
  const serialsFg = document.getElementById('import-serials-fg');
  const qtyFg = document.getElementById('import-qty-fg');
  const batchFg = document.getElementById('import-batch-fg');

  if (category === 'Consumable') {
    if (serialsFg) serialsFg.style.display = 'none';
    if (qtyFg) qtyFg.style.display = 'block';
    if (batchFg) batchFg.style.display = 'block';
  } else {
    if (serialsFg) serialsFg.style.display = 'block';
    if (qtyFg) qtyFg.style.display = 'none';
    if (batchFg) batchFg.style.display = 'none';
  }
}
window.handleImportCategoryChange = handleImportCategoryChange;

async function submitBulkImportSerials() {
  const selectItemId = document.getElementById('import-item-id')?.value;
  const is_new_item = (selectItemId === 'NEW_ITEM');
  const loc_id = document.getElementById('import-loc')?.value;
  const purchase_cost = document.getElementById('import-cost')?.value;
  const warranty_months = document.getElementById('import-warranty')?.value || 12;
  const import_mode = document.getElementById('import-mode')?.value || 'Available';

  if (!selectItemId) {
    App.toast('Please select or create a catalog model.', 'error');
    return;
  }

  let category = 'Asset';
  let item_id = selectItemId;
  let new_item_details = null;

  if (is_new_item) {
    const newId = (document.getElementById('import-new-id')?.value || '').trim();
    const newName = (document.getElementById('import-new-name')?.value || '').trim();
    const newCategory = document.getElementById('import-new-category')?.value || 'Asset';
    const newCost = document.getElementById('import-new-cost')?.value;
    const newReorder = document.getElementById('import-new-reorder')?.value;

    if (!newId || !newName) {
      App.toast('Please specify item ID and Product Model Name for the new catalog item.', 'error');
      return;
    }

    category = newCategory;
    item_id = newId;
    new_item_details = {
      name: newName,
      category: newCategory,
      uom: newCategory === 'Asset' ? 'Pcs' : 'Mtr',
      reorder: parseInt(newReorder || 5),
      unit_cost: parseFloat(newCost || 0)
    };
  } else {
    const item = DB.getItem(selectItemId);
    if (item) {
      category = item.category;
    }
  }

  const payload = {
    item_id,
    loc_id,
    purchase_cost: purchase_cost ? parseFloat(purchase_cost) : null,
    warranty_months: parseInt(warranty_months),
    is_new_item,
    new_item_details,
    import_mode
  };

  if (category === 'Consumable') {
    const qty = parseInt(document.getElementById('import-qty')?.value || 0);
    const batch = (document.getElementById('import-batch')?.value || '').trim();
    
    if (qty <= 0) {
      App.toast('Please specify a valid quantity greater than zero.', 'error');
      return;
    }
    
    payload.qty = qty;
    if (batch) {
      payload.batch = batch;
    }
  } else {
    const rawSerials = document.getElementById('import-serials')?.value || '';
    const lines = rawSerials.split(/[\r\n]+/);
    const serials = [];

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      if (import_mode === 'Deployed') {
        const parts = trimmedLine.split(/[,;\t]+/);
        const sn = parts[0] ? parts[0].trim().replace(/^["']|["']$/g, '') : '';
        const customer_acc = parts[1] ? parts[1].trim().replace(/^["']|["']$/g, '') : '';
        if (sn && customer_acc) {
          serials.push({ sn, customer_acc });
        }
      } else {
        const parts = trimmedLine.split(/[,;\t]+/);
        const sn = parts[0] ? parts[0].trim().replace(/^["']|["']$/g, '') : '';
        if (sn) {
          serials.push(sn);
        }
      }
    });

    if (serials.length === 0) {
      App.toast('Please enter or paste at least one valid serial number entry.', 'error');
      return;
    }
    
    payload.serials = serials;
  }

  try {
    App.toast(`Processing bulk import...`, 'info');
    const result = await DB.bulkImportSerials(payload);

    App.closeModal();
    App.toast(result.message, 'success');
    
    // Refresh inventory view
    if (window.applyInvFilter) {
      window.applyInvFilter();
    } else {
      App.navigate('inventory');
    }
  } catch (e) {
    App.toast(`Bulk import failed: ${e.message}`, 'error');
  }
}
window.submitBulkImportSerials = submitBulkImportSerials;

function handleImportModeChange(mode) {
  const noteSpan = document.querySelector('#import-serials-fg .text-muted');
  const textarea = document.getElementById('import-serials');
  if (mode === 'Deployed') {
    if (noteSpan) noteSpan.textContent = "Upload a '.csv' file (Col 1: Serial, Col 2: Customer Account) or paste comma-separated values (e.g. SN-001, CUST-102) line by line.";
    if (textarea) textarea.placeholder = "e.g.\nSN-88776655, CUST-10023\nSN-88776656, CUST-10024";
  } else {
    if (noteSpan) noteSpan.textContent = "Upload a '.csv' file (Serial Numbers in first column) or copy & paste from Excel directly.";
    if (textarea) textarea.placeholder = "e.g.\nSN-88776655\nSN-88776656";
  }
}
window.handleImportModeChange = handleImportModeChange;

function handleCSVUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const mode = document.getElementById('import-mode')?.value || 'Available';

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split(/[\r\n]+/);
    const parsedSerials = [];
    
    lines.forEach((line, idx) => {
      const cols = line.split(/[,;\t]+/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length === 0 || !cols[0]) return;
      
      // Skip header row if it matches common keywords
      if (idx === 0) {
        const lowerVal = cols[0].toLowerCase();
        if (lowerVal.includes('serial') || lowerVal.includes('sn') || lowerVal.includes('number') || lowerVal.includes('model') || lowerVal.includes('router') || lowerVal.includes('mac') || lowerVal.includes('item')) {
          return;
        }
      }

      if (mode === 'Deployed') {
        const custAcc = cols[1] || '';
        parsedSerials.push(`${cols[0]}, ${custAcc}`);
      } else {
        parsedSerials.push(cols[0]);
      }
    });

    const textarea = document.getElementById('import-serials');
    if (textarea) {
      textarea.value = parsedSerials.join('\n');
      App.toast(`Successfully loaded ${parsedSerials.length} entries from ${file.name}`, 'success');
    }
  };
  reader.readAsText(file);
}
window.handleCSVUpload = handleCSVUpload;


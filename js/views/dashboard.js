// ═══════════════════════════════════════
// View: Dashboard
// ═══════════════════════════════════════
function renderDashboard() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  const locId = isBranchKeeper ? user.location_id : null;

  const low = DB.getLowStockItems(locId);
  const pending = DB.getPendingTransfers(locId);
  const totalVal = DB.getTotalValuation(locId);

  const activeAssets = DB.serialized.filter(s => {
    if (s.status === 'Returned_To_Vendor' || s.status === 'Sold' || s.status === 'Scrapped') return false;
    if (locId && (s.branch_id || (s.loc_type === 'Branch' ? s.loc_id : 'LOC001')) !== locId) return false;
    return true;
  });

  const uniqueAssetItemIds = new Set();
  const assetUOMBreakdown = {};

  activeAssets.forEach(s => {
    uniqueAssetItemIds.add(s.item_id);
    const item = DB.getItem(s.item_id);
    if (item) {
      const uom = item.uom || 'Pcs';
      assetUOMBreakdown[uom] = (assetUOMBreakdown[uom] || 0) + 1;
    }
  });

  const assetTypeCount = uniqueAssetItemIds.size;
  const assetBreakdownStr = Object.entries(assetUOMBreakdown)
    .map(([uom, qty]) => `${qty.toLocaleString()} ${uom}`)
    .join(' | ') || '0 Items';

  const consumableUOMBreakdown = {};
  const uniqueItemIds = new Set();
  const activeConsumables = DB.consumable_stock.filter(c => (!locId || c.loc_id === locId) && c.qty > 0);
  
  activeConsumables.forEach(c => {
    const item = DB.getItem(c.item_id);
    if (item) {
      uniqueItemIds.add(c.item_id);
      const uom = item.uom || 'Pcs';
      consumableUOMBreakdown[uom] = (consumableUOMBreakdown[uom] || 0) + c.qty;
    }
  });

  const consumableTypeCount = uniqueItemIds.size;
  const breakdownStr = Object.entries(consumableUOMBreakdown)
    .map(([uom, qty]) => `${qty.toLocaleString()} ${uom}`)
    .join(' | ') || '0 Items';

  const deployed = DB.serialized.filter(s => {
    if (s.status !== 'Deployed') return false;
    if (locId && (s.branch_id || (s.loc_type === 'Branch' ? s.loc_id : 'LOC001')) !== locId) return false;
    return true;
  }).length;

  const faulty = DB.serialized.filter(s => {
    if (s.status !== 'Faulty') return false;
    if (locId && (s.branch_id || (s.loc_type === 'Branch' ? s.loc_id : 'LOC001')) !== locId) return false;
    return true;
  }).length;

  const inTransit = DB.serialized.filter(s => {
    if (s.status !== 'In_Transit') return false;
    if (locId && (s.branch_id || (s.loc_type === 'Branch' ? s.loc_id : 'LOC001')) !== locId) return false;
    return true;
  }).length;

  const fmtCurrency = n => 'NPR ' + n.toLocaleString();

  const lowStockRows = low.map(l => `
    <tr>
      <td><div class="fw-600">${l.item.name}</div><div class="fs-11 text-muted">${l.item.id}</div></td>
      <td><span class="badge badge-red">${l.item.category}</span></td>
      <td class="mono text-red fw-600">${l.qty} ${l.item.uom}</td>
      <td class="mono">${l.reorder} ${l.item.uom}</td>
      <td>
        <div class="progress-bar"><div class="progress-fill ${l.qty === 0 ? 'red' : 'yellow'}" style="width:${Math.min(100, Math.round(l.qty/l.reorder*100))}%"></div></div>
        <div class="fs-11 text-muted mt-8">${Math.round(l.qty/l.reorder*100)}% of reorder level</div>
      </td>
    </tr>`).join('');

  const transferRows = pending.slice(0,5).map(t => {
    const from = DB.getLocation(t.from_loc)?.name || t.from_loc;
    const to = DB.getLocation(t.to_loc)?.name || t.to_loc;
    const statusMap = { 'In_Transit':'badge-blue', 'Pending':'badge-yellow', 'Completed':'badge-green' };
    return `<tr>
      <td class="mono fw-600">${t.id}</td>
      <td>${from}</td>
      <td>→</td>
      <td>${to}</td>
      <td>${t.created}</td>
      <td><span class="badge ${statusMap[t.status]||'badge-gray'}">${t.status.replace('_',' ')}</span></td>
    </tr>`;
  }).join('');

  const displayedLocations = locId ? DB.locations.filter(l => l.id === locId) : DB.locations;
  const locStockRows = displayedLocations.map(loc => {
    const assets = DB.serialized.filter(s => s.loc_id === loc.id && s.status === 'Available').length;
    const consumTotal = DB.consumable_stock.filter(c => c.loc_id === loc.id).reduce((s,c)=>s+c.qty,0);
    const locVal = DB.serialized.filter(s => s.loc_id === loc.id).reduce((s,sr)=>{ const it=DB.getItem(sr.item_id); return s + (sr.purchase_cost != null ? Number(sr.purchase_cost) : Number(it?.unit_cost || 0)); },0)
                 + DB.consumable_stock.filter(c=>c.loc_id===loc.id).reduce((s,c)=>s+Number(c.qty)*Number(c.unit_cost),0);
    return `<tr>
      <td><div class="fw-600">${loc.name}</div></td>
      <td><span class="badge ${loc.type==='Central'?'badge-purple':'badge-blue'}">${loc.type}</span></td>
      <td class="mono">${assets} units</td>
      <td class="mono">${consumTotal.toLocaleString()}</td>
      <td class="mono fw-600">${fmtCurrency(locVal)}</td>
    </tr>`;
  }).join('');

  const dashSubtitle = isBranchKeeper 
    ? `Real-time inventory overview for ${user.location_name}`
    : 'Real-time network inventory overview';

  const dashActions = isBranchKeeper ? '' : `
    <div class="view-actions">
      <button class="btn btn-secondary btn-sm" onclick="App.navigate('reports')">📄 Full Report</button>
      <button class="btn btn-primary btn-sm" onclick="App.navigate('procurement')">+ New Procurement</button>
    </div>`;

  return `
  <div class="view-header">
    <div><div class="view-title">📊 Dashboard</div><div class="view-subtitle">${dashSubtitle}</div></div>
    ${dashActions}
  </div>

  <div class="stats-grid">
    <div class="stat-card" style="--stat-color:var(--accent);--stat-soft:var(--accent-soft)" onclick="navigateToInventory('Asset', '')">
      <div class="stat-icon">🖥️</div>
      <div class="stat-val">${assetTypeCount} Product Types</div>
      <div class="stat-label">Assets In Stock</div>
      <div class="stat-delta">${assetBreakdownStr} tracked</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--blue);--stat-soft:var(--blue-soft)" onclick="navigateToInventory('Consumable', '')">
      <div class="stat-icon">📦</div>
      <div class="stat-val">${consumableTypeCount} Product Types</div>
      <div class="stat-label">Consumables In Stock</div>
      <div class="stat-delta">${breakdownStr}</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--green);--stat-soft:var(--green-soft)" onclick="navigateToInventory('Asset', 'Deployed')">
      <div class="stat-icon">✅</div>
      <div class="stat-val">${deployed}</div>
      <div class="stat-label">Deployed at Customers</div>
      <div class="stat-delta">Active field deployments</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--yellow);--stat-soft:var(--yellow-soft)" onclick="navigateToInventory('Asset', 'In_Transit')">
      <div class="stat-icon">🚚</div>
      <div class="stat-val">${inTransit}</div>
      <div class="stat-label">Units In Transit</div>
      <div class="stat-delta">${pending.length} active transfers</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--red);--stat-soft:var(--red-soft)" onclick="navigateToInventory('Asset', 'Faulty')">
      <div class="stat-icon">⚠️</div>
      <div class="stat-val">${faulty}</div>
      <div class="stat-label">Faulty / Damaged</div>
      <div class="stat-delta">Requires attention</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--purple);--stat-soft:var(--purple-soft)" onclick="App.navigate('reports')">
      <div class="stat-icon">💰</div>
      <div class="stat-val" style="font-size:18px;letter-spacing:-0.5px">${fmtCurrency(totalVal)}</div>
      <div class="stat-label">Total Inventory Valuation</div>
      <div class="stat-delta">Assets + Consumables</div>
    </div>
    ${isBranchKeeper ? '' : `
    <div class="stat-card" style="--stat-color:var(--orange);--stat-soft:var(--orange-soft)" onclick="navigateToInventory('', '')">
      <div class="stat-icon">🔴</div>
      <div class="stat-val">${low.length}</div>
      <div class="stat-label">Low Stock Alerts</div>
      <div class="stat-delta">Below reorder levels</div>
    </div>
    `}
  </div>

  ${isBranchKeeper ? `
  <div class="card" style="margin-bottom:16px">
    <div class="card-hdr">
      <div><div class="card-title">🚚 Active Transfers</div><div class="card-subtitle">Pending & in-transit shipments</div></div>
      <button class="btn btn-sm btn-secondary" onclick="App.navigate('transfers')">View All</button>
    </div>
    ${pending.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>From</th><th></th><th>To</th><th>Date</th><th>Status</th></tr></thead><tbody>${transferRows}</tbody></table></div>` : '<div class="empty-state"><div class="es-icon">✅</div><h3>No Active Transfers</h3></div>'}
  </div>
  ` : `
  <div class="grid-2" style="gap:16px;margin-bottom:16px">
    <div class="card">
      <div class="card-hdr">
        <div><div class="card-title">🔴 Low Stock Warnings</div><div class="card-subtitle">Items below minimum reorder level</div></div>
        <button class="btn btn-sm btn-secondary" onclick="App.navigate('inventory')">View All</button>
      </div>
      ${low.length ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Type</th><th>Current Qty</th><th>Reorder At</th><th>Level</th></tr></thead><tbody>${lowStockRows}</tbody></table></div>` : '<div class="empty-state"><div class="es-icon">✅</div><h3>All Stock Healthy</h3><p>No items below reorder levels</p></div>'}
    </div>

    <div class="card">
      <div class="card-hdr">
        <div><div class="card-title">🚚 Active Transfers</div><div class="card-subtitle">Pending & in-transit shipments</div></div>
        <button class="btn btn-sm btn-secondary" onclick="App.navigate('transfers')">View All</button>
      </div>
      ${pending.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>From</th><th></th><th>To</th><th>Date</th><th>Status</th></tr></thead><tbody>${transferRows}</tbody></table></div>` : '<div class="empty-state"><div class="es-icon">✅</div><h3>No Active Transfers</h3></div>'}
    </div>
  </div>
  `}

  <div class="card" style="margin-bottom:16px">
    <div class="card-hdr">
      <div><div class="card-title">📍 Stock by Location</div><div class="card-subtitle">${isBranchKeeper ? 'Your branch inventory summary' : 'Inventory distribution across all branches'}</div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Location</th><th>Type</th><th>Available Assets</th><th>Consumables</th><th>Valuation</th></tr></thead>
      <tbody>${locStockRows}</tbody>
    </table></div>
  </div>
  
  <div class="card" style="margin-top:24px;border:1px dashed var(--accent)">
    <div class="card-hdr" style="flex-wrap:wrap; gap:12px; align-items:center;">
      <div>
        <div class="card-title">🛠️ Debug: Active Assets List</div>
        <div class="card-subtitle">Verify status, location type, and branch assignments of tracked items.</div>
      </div>
      <div style="margin-left:auto; width: 100%; max-width: 320px;">
        <input type="text" class="fi" id="debug-asset-search" placeholder="🔍 Search SN, Item ID, or Model Name..." style="margin-bottom:0;" oninput="filterDebugAssets()"/>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>SN</th>
            <th>Item ID</th>
            <th>Item Name</th>
            <th>Status</th>
            <th>Loc Type</th>
            <th>Loc ID</th>
            <th>Branch ID</th>
          </tr>
        </thead>
        <tbody id="debug-assets-tbody">
          ${activeAssets.map(s => {
            const it = DB.getItem(s.item_id);
            const statusBadges = {
              'Available': 'badge-green',
              'Deployed': 'badge-purple',
              'Deployed_Infrastructure': 'badge-purple',
              'Faulty': 'badge-red',
              'In_Transit': 'badge-blue',
              'Assigned': 'badge-orange',
              'Scrapped': 'badge-red',
              'Returned_To_Vendor': 'badge-yellow'
            };
            const badgeClass = statusBadges[s.status] || 'badge-gray';
            const searchStr = `${s.sn} ${s.item_id} ${it?.name || ''} ${s.status} ${s.loc_type} ${s.loc_id} ${s.branch_id || ''}`.toLowerCase();
            return `<tr class="debug-asset-tr" data-search="${searchStr}">
              <td class="mono fw-600" style="color:var(--accent);">${s.sn}</td>
              <td class="mono">${s.item_id}</td>
              <td class="fw-600">${it?.name || 'Unknown'}</td>
              <td><span class="badge ${badgeClass}">${s.status.replace(/_/g, ' ')}</span></td>
              <td>${s.loc_type.replace(/_/g, ' ')}</td>
              <td class="mono">${s.loc_id}</td>
              <td class="mono">${s.branch_id}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function filterDebugAssets() {
  const query = (document.getElementById('debug-asset-search')?.value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#debug-assets-tbody tr');
  rows.forEach(row => {
    const text = row.getAttribute('data-search') || '';
    if (!query || text.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}
window.filterDebugAssets = filterDebugAssets;

function navigateToInventory(cat, status, search = '', loc = '') {
  window.invPreFilters = { cat, status, search, loc };
  App.navigate('inventory');
}
window.navigateToInventory = navigateToInventory;

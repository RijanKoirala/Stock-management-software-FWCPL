
// ═══════════════════════════════════════
// View: Item Catalog
// ═══════════════════════════════════════
function renderCatalog() {
  const rows = DB.items.map(it => {
    const totalStock = it.category==='Asset'
      ? DB.serialized.filter(s=>s.item_id===it.id&&s.status==='Available').length
      : DB.consumable_stock.filter(c=>c.item_id===it.id).reduce((s,c)=>s+c.qty,0);
    const isLow = totalStock < it.reorder;
    const infraBadge = it.is_infrastructure ? `<span class="badge badge-red" style="margin-left:6px;font-size:10px;padding:2px 6px">Infra Only</span>` : '';
    return `<tr>
      <td class="mono fw-600">${it.id}</td>
      <td><div class="fw-600">${it.name}${infraBadge}</div></td>
      <td><span class="badge badge-${it.category==='Asset'?'purple':'blue'}">${it.category}</span></td>
      <td>${it.uom}</td>
      <td class="mono">${it.reorder.toLocaleString()} ${it.uom}</td>
      <td class="mono ${isLow?'text-red fw-600':'text-green'}">${totalStock.toLocaleString()} ${it.uom}</td>
      <td class="mono">NPR ${it.unit_cost.toLocaleString()}</td>
      <td><span class="badge ${isLow?'badge-red':'badge-green'}">${isLow?'Low Stock':'OK'}</span></td>
      <td>
        <div style="display:inline-flex;gap:6px">
          <button class="btn btn-sm btn-secondary" onclick="editItem('${it.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCatalogItem('${it.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="view-header">
    <div><div class="view-title">≡ Item Catalog</div><div class="view-subtitle">Master catalog of all ISP hardware and consumables</div></div>
    <div class="view-actions">
      <button class="btn btn-primary btn-sm" onclick="openAddItem()">+ Add Item</button>
    </div>
  </div>
  <div class="filter-bar mb-16">
    <input class="search-input" id="cat-search" placeholder="🔍 Search items..." oninput="filterCatalog()">
    <select class="filter-select" id="cat-type" onchange="filterCatalog()">
      <option value="">All Categories</option>
      <option value="Asset">Assets</option>
      <option value="Consumable">Consumables</option>
    </select>
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>Item ID</th><th>Name</th><th>Category</th><th>UOM</th><th>Reorder Level</th><th>Current Stock</th><th>Unit Cost</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="cat-tbody">${rows}</tbody>
    </table></div>
  </div>`;
}

function filterCatalog() {
  const search = (document.getElementById('cat-search')?.value||'').toLowerCase();
  const type = document.getElementById('cat-type')?.value||'';
  const items = DB.items.filter(it => {
    const matchSearch = !search || it.name.toLowerCase().includes(search) || it.id.toLowerCase().includes(search);
    const matchType = !type || it.category===type;
    return matchSearch && matchType;
  });
  document.getElementById('cat-tbody').innerHTML = items.map(it => {
    const totalStock = it.category==='Asset' ? DB.serialized.filter(s=>s.item_id===it.id&&s.status==='Available').length : DB.consumable_stock.filter(c=>c.item_id===it.id).reduce((s,c)=>s+c.qty,0);
    const isLow = totalStock < it.reorder;
    const infraBadge = it.is_infrastructure ? `<span class="badge badge-red" style="margin-left:6px;font-size:10px;padding:2px 6px">Infra Only</span>` : '';
    return `<tr><td class="mono fw-600">${it.id}</td><td><div class="fw-600">${it.name}${infraBadge}</div></td><td><span class="badge badge-${it.category==='Asset'?'purple':'blue'}">${it.category}</span></td><td>${it.uom}</td><td class="mono">${it.reorder.toLocaleString()}</td><td class="mono ${isLow?'text-red fw-600':'text-green'}">${totalStock.toLocaleString()}</td><td class="mono">NPR ${it.unit_cost.toLocaleString()}</td><td><span class="badge ${isLow?'badge-red':'badge-green'}">${isLow?'Low Stock':'OK'}</span></td><td><div style="display:inline-flex;gap:6px"><button class="btn btn-sm btn-secondary" onclick="editItem('${it.id}')">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteCatalogItem('${it.id}')">Delete</button></div></td></tr>`;
  }).join('');
}

function openAddItem() {
  App.showModal('Add New Item', `
    <div class="fg"><label class="fl">Item ID (SKU)</label><input class="fi" id="it-id" placeholder="e.g. ITM013"/></div>
    <div class="fg"><label class="fl">Item Name</label><input class="fi" id="it-name" placeholder="e.g. Nokia G-2425G-B ONU"/></div>
    <div class="fg"><label class="fl">Category</label>
      <select class="fi" id="it-cat"><option value="Asset">Asset (Serialized)</option><option value="Consumable">Consumable (Bulk)</option></select></div>
    <div class="fg"><label class="fl">Unit of Measure</label>
      <select class="fi" id="it-uom"><option>Pcs</option><option>Meters</option><option>Boxes</option><option>Rolls</option><option>Pairs</option></select></div>
    <div class="fg"><label class="fl">Minimum Reorder Level</label><input type="number" class="fi" id="it-reorder" min="1" placeholder="e.g. 20"/></div>
    <div class="fg"><label class="fl">Unit Cost (NPR)</label><input type="number" class="fi" id="it-cost" min="0" placeholder="e.g. 4500"/></div>
    <div class="fg" style="margin-top:14px; display:flex; align-items:center; gap:8px">
      <input type="checkbox" id="it-infra" style="width:16px; height:16px; cursor:pointer"/>
      <label for="it-infra" class="fl" style="margin-bottom:0; cursor:pointer; font-weight: 500;">Core Network Infrastructure Only (Exclude from branch requests)</label>
    </div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'Add Item', cls:'btn-primary', onclick:'saveNewItem()' }
  ]);
}

async function saveNewItem() {
  const id = document.getElementById('it-id')?.value;
  const name = document.getElementById('it-name')?.value;
  const category = document.getElementById('it-cat')?.value;
  const uom = document.getElementById('it-uom')?.value;
  const reorder = parseInt(document.getElementById('it-reorder')?.value);
  const unit_cost = parseInt(document.getElementById('it-cost')?.value);
  const is_infrastructure = document.getElementById('it-infra')?.checked || false;
  
  try {
    await DB.saveItem({ id, name, category, uom, reorder, unit_cost, is_infrastructure });
    App.closeModal();
    App.toast(`Item ${id} added to catalog`, 'success');
    App.navigate('catalog');
  } catch (e) {
    App.toast(`Failed to add item: ${e.message}`, 'error');
  }
}
window.saveNewItem = saveNewItem;

function editItem(id) {
  const it = DB.getItem(id);
  if(!it) return;
  App.showModal(`Edit Item — ${it.id}`, `
    <div class="fg"><label class="fl">Item ID</label><input class="fi" value="${it.id}" readonly/></div>
    <div class="fg"><label class="fl">Item Name</label><input class="fi" id="eit-name" value="${it.name}"/></div>
    <div class="fg"><label class="fl">Minimum Reorder Level</label><input type="number" class="fi" id="eit-reorder" value="${it.reorder}"/></div>
    <div class="fg"><label class="fl">Unit Cost (NPR)</label><input type="number" class="fi" id="eit-cost" value="${it.unit_cost}"/></div>
    <div class="fg" style="margin-top:14px; display:flex; align-items:center; gap:8px">
      <input type="checkbox" id="eit-infra" style="width:16px; height:16px; cursor:pointer" ${it.is_infrastructure ? 'checked' : ''}/>
      <label for="eit-infra" class="fl" style="margin-bottom:0; cursor:pointer; font-weight: 500;">Core Network Infrastructure Only (Exclude from branch requests)</label>
    </div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'Save Changes', cls:'btn-primary', onclick:`saveEditItem('${id}')` }
  ]);
}

async function saveEditItem(id) {
  const name = document.getElementById('eit-name')?.value;
  const reorder = parseInt(document.getElementById('eit-reorder')?.value);
  const cost = parseInt(document.getElementById('eit-cost')?.value);
  const is_infrastructure = document.getElementById('eit-infra')?.checked || false;
  if(!name||!reorder||isNaN(cost)){ App.toast('Fill in all fields','error'); return; }
  
  try {
    await DB.put(`/api/items/${id}`, { name, reorder, unit_cost: cost, is_infrastructure });
    await DB.load();
    App.closeModal();
    App.toast('Item updated successfully', 'success');
    App.navigate('catalog');
  } catch (e) {
    App.toast(`Failed to update item: ${e.message}`, 'error');
  }
}
window.saveEditItem = saveEditItem;

async function deleteCatalogItem(itemId) {
  const it = DB.getItem(itemId);
  if (!it) return;

  // Verify database references to preserve integrity
  const inSerials = DB.serialized.some(s => s.item_id === itemId);
  const inConsStock = DB.consumable_stock.some(c => c.item_id === itemId);
  const inProc = DB.procurements.some(p => p.item_id === itemId);
  const inTrans = DB.transfers.some(t => t.item_id === itemId || (t.items && t.items.some(ti => ti.item_id === itemId)));
  const inReq = DB.requisitions.some(r => r.item_id === itemId || (r.items && r.items.some(ri => ri.item_id === itemId)));

  if (inSerials || inConsStock || inProc || inTrans || inReq) {
    App.toast(`Cannot delete "${it.name}" because it has active inventory or transaction history.`, 'error');
    return;
  }

  if (confirm(`Are you sure you want to delete "${it.name}" from the product catalog?`)) {
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete request failed');
      await DB.load();
      App.toast(`Item "${it.name}" successfully deleted from catalog`, 'success');
      App.navigate('catalog');
    } catch (e) {
      App.toast(`Failed to delete item: ${e.message}`, 'error');
    }
  }
}
window.deleteCatalogItem = deleteCatalogItem;

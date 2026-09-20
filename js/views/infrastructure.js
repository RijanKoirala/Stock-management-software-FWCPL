let infraFilter = { search: '' };

function renderInfrastructure() {
  const user = getCurrentUser();
  
  // Calculate summary metrics
  const deployedInfra = DB.serialized.filter(s => s.status === 'Deployed_Infrastructure');
  const totalValuation = deployedInfra.reduce((sum, s) => {
    const item = DB.getItem(s.item_id);
    return sum + (s.purchase_cost != null ? Number(s.purchase_cost) : Number(item?.unit_cost || 0));
  }, 0);
  
  const popNodes = DB.locations.filter(l => l.type === 'POP');
  const activeNodesCount = DB.locations.filter(l => 
    l.type === 'POP' || 
    (l.type === 'Branch' && DB.serialized.some(s => s.status === 'Deployed_Infrastructure' && s.loc_id === l.id))
  ).length;

  return `
  <div class="view-header">
    <div><div class="view-title">📡 Network POPs & Infrastructure</div><div class="view-subtitle">Monitor OLTs, core switches, and backbone routers deployed across POPs and branches</div></div>
    <div class="view-actions" style="display:flex;gap:8px">
      <button class="btn btn-secondary btn-sm" onclick="openRegisterActiveDeviceModal()">+ Register Active Device</button>
      <button class="btn btn-primary btn-sm" onclick="openDeployInfraModal()">+ Deploy Core Device</button>
    </div>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
    <div class="stat-card" style="--stat-color:var(--purple)">
      <div class="stat-icon">💰</div>
      <div class="stat-val">NPR ${totalValuation.toLocaleString()}</div>
      <div class="stat-label">Infrastructure CapEx Valuation</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--green)">
      <div class="stat-icon">📡</div>
      <div class="stat-val">${popNodes.length} POPs <span style="font-size:12px;color:var(--text-muted)">(${activeNodesCount} Active Nodes)</span></div>
      <div class="stat-label">Backbone Node Sites</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--blue)">
      <div class="stat-icon">⚙</div>
      <div class="stat-val">${deployedInfra.length} Devices</div>
      <div class="stat-label">Active Core Devices Deployed</div>
    </div>
  </div>

  <div id="infra-map-container" class="card mb-16" style="display:none; padding: 12px; background: rgba(0,0,0,0.15)">
    <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 6px;">
        🗺️ Node GIS Map Layout
        <span class="text-muted" style="font-weight: normal; font-size: 11px;">(Interactive OpenStreetMap showing network locations)</span>
      </div>
      <button class="btn btn-xs btn-secondary" onclick="closeInfraMap()" style="padding: 2px 8px; font-size: 11px;">✕ Close Map</button>
    </div>
    <div id="infra-map" style="height: 300px; width: 100%; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); z-index: 1;"></div>
  </div>

  <div class="card mb-16" style="background:var(--accent-soft);border-color:rgba(99,102,241,0.3)">
    <div style="display:flex;gap:12px;align-items:center">
      <span style="font-size:20px">🌐</span>
      <div class="fs-12 text-secondary">
        <strong>Backbone Infrastructure Policy:</strong> These assets are critical network devices deployed directly to POP stations or branch offices. They are tracked as capital assets, require management IP allocations, and are separate from user-end technicians wallets or consumer customer sales.
      </div>
    </div>
  </div>

  <div class="card mb-16">
    <div class="filter-bar">
      <input class="search-input" id="infra-search" placeholder="🔍 Search POP/Branch nodes by name or city..." oninput="applyInfraFilter()" value="${infraFilter.search || ''}">
    </div>
  </div>

  <div id="infra-nodes-list"></div>
  `;
}

function closeInfraMap() {
  const container = document.getElementById('infra-map-container');
  if (container) {
    container.style.display = 'none';
  }
}
window.closeInfraMap = closeInfraMap;

function applyInfraFilter() {
  const query = (document.getElementById('infra-search')?.value || '').toLowerCase().trim();
  infraFilter.search = query;
  
  const container = document.getElementById('infra-nodes-list');
  if (container) {
    container.innerHTML = renderInfraNodeCards();
  }
}
window.applyInfraFilter = applyInfraFilter;

function renderInfraNodeCards() {
  const search = (infraFilter.search || '').toLowerCase();
  
  const nodes = DB.locations.filter(l => 
    (l.type === 'POP' || l.type === 'Branch') &&
    (!search || l.name.toLowerCase().includes(search) || l.city.toLowerCase().includes(search) || l.type.toLowerCase().includes(search))
  );

  if (nodes.length === 0) {
    return `<div class="empty-state card"><div class="es-icon">🔍</div><h3>No matching POP/Branch nodes found</h3><p>Try adjusting your search query</p></div>`;
  }
  
  return nodes.map(loc => {
    const infra = DB.serialized.filter(s => s.status === 'Deployed_Infrastructure' && s.loc_id === loc.id);
    const badgeMap = { Central: 'badge-purple', Branch: 'badge-blue', POP: 'badge-green' };
    
    const deviceRows = infra.map(s => {
      const item = DB.getItem(s.item_id);
      const photoUrl = s.device_photo ? `/uploads/${s.device_photo}` : null;
      const photoHtml = photoUrl 
        ? `<div style="margin-top:4px;"><a href="#" onclick="event.preventDefault(); openPhotoViewer('${s.sn}', '${photoUrl}')" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; color:var(--accent); font-weight:600; text-decoration:none;"><img src="${photoUrl}" style="width:24px; height:24px; border-radius:4px; object-fit:cover; border:1px solid var(--border);"/> View Photo</a></div>`
        : '';
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.03)">
          <td class="mono fw-600">
            ${s.sn}
            ${photoHtml}
          </td>
          <td>
            <div class="fw-600">${item?.name || s.item_id}</div>
            ${s.notes ? `<div class="text-secondary fs-11" style="margin-top:2px; font-style:italic;">📝 Note: ${s.notes}</div>` : ''}
          </td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="openRetireModal('${s.sn}')" style="padding: 3px 8px; font-size:11px;">Retire</button>
          </td>
        </tr>
      `;
    }).join('');

    const deviceTable = infra.length > 0 
      ? `
        <div class="table-wrap mt-8">
          <table style="background:transparent">
            <thead>
              <tr>
                <th>Serial Number</th>
                <th>Device Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${deviceRows}
            </tbody>
          </table>
        </div>
      `
      : `<div class="text-muted fs-12" style="padding:16px;text-align:center;background:rgba(0,0,0,0.1);border-radius:8px">No network devices currently deployed at this node.</div>`;

    return `
      <div class="card mb-16" style="border-left: 4px solid ${loc.type === 'POP' ? 'var(--green)' : 'var(--blue)'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
            <span class="badge ${badgeMap[loc.type] || 'badge-gray'}">${loc.type} Node</span>
            <strong style="font-size:15px;color:var(--text-primary)">${loc.name}</strong>
            <span class="text-muted fs-12">📍 ${loc.city}</span>
            <button class="btn btn-xs btn-secondary" onclick="focusNodeOnMap('${loc.id}')" style="padding: 2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;">
              🗺️ View in Map
            </button>
          </div>
          <div class="fs-12 fw-600 text-secondary">${infra.length} active devices</div>
        </div>
        ${deviceTable}
      </div>
    `;
  }).join('');
}

function openDeployInfraModal() {
  // 1. Get available serialized assets that are marked as Core Infrastructure Only
  const availAssets = DB.serialized.filter(s => {
    const item = DB.getItem(s.item_id);
    return s.status === 'Available' && item?.is_infrastructure === true;
  });
  const assetOpts = availAssets.map(s => {
    const item = DB.getItem(s.item_id);
    const loc = DB.getLocation(s.loc_id || s.branch_id);
    return `<option value="${s.sn}">${s.sn} — ${item?.name || s.item_id} (Currently at: ${loc?.name || s.loc_id})</option>`;
  }).join('');

  if (!availAssets.length) {
    App.toast('No available Core Infrastructure devices in stock to deploy. Register or purchase them first.', 'error');
    return;
  }

  // 2. Get target locations (Branches + POPs)
  const destNodes = DB.locations.filter(l => l.type === 'POP' || l.type === 'Branch');
  const destOpts = destNodes.map(l => `<option value="${l.id}">${l.name} (${l.type})</option>`).join('');

  App.showModal('Deploy Device to Infrastructure', `
    <div class="fg">
      <label class="fl">Select Hardware Device (Available Serials)</label>
      <select class="fi" id="dinfra-sn" style="font-family:monospace">${assetOpts}</select>
    </div>
    <div class="fg">
      <label class="fl">Destination POP Node / Branch</label>
      <select class="fi" id="dinfra-loc">${destOpts}</select>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: '📡 Deploy Active Device', cls: 'btn-primary', onclick: 'submitDeployInfra()' }
  ]);
}

async function submitDeployInfra() {
  const sn = document.getElementById('dinfra-sn')?.value;
  const loc_id = document.getElementById('dinfra-loc')?.value;

  if (!sn || !loc_id) {
    App.toast('Please select device and destination.', 'error');
    return;
  }

  try {
    await DB.deployInfrastructureAsset({ 
      sn, 
      loc_id, 
      infra_ip: null, 
      infra_rack: null, 
      infra_role: 'Infrastructure Device' 
    });
    App.closeModal();
    App.toast(`Device ${sn} successfully deployed`, 'success');
    App.navigate('infrastructure');
  } catch (e) {
    App.toast(`Failed to deploy asset: ${e.message}`, 'error');
  }
}
window.submitDeployInfra = submitDeployInfra;

function openRetireModal(sn) {
  const asset = DB.serialized.find(s => s.sn === sn);
  const item = DB.getItem(asset?.item_id);
  
  // Get list of branch/central warehouses where it can be returned
  const warehouses = DB.locations.filter(l => l.type === 'Central' || l.type === 'Branch');
  const whOpts = warehouses.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

  App.showModal(`Retire Core Hardware Device`, `
    <p class="text-secondary mb-16 fs-12">
      You are removing device <strong>${item?.name || sn}</strong> (SN: <code>${sn}</code>) from active service in the infrastructure backbone.
    </p>
    <div class="fg">
      <label class="fl">Retire Destination Condition</label>
      <select class="fi" id="rinfra-status">
        <option value="Available">Available (Return to branch warehouse stock for reuse)</option>
        <option value="Faulty">Faulty (Send to branch faulty warehouse for repair)</option>
      </select>
    </div>
    <div class="fg">
      <label class="fl">Receiving Warehouse Location</label>
      <select class="fi" id="rinfra-wh">${whOpts}</select>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: '✕ Remove from Service', cls: 'btn-danger', onclick: `submitRetireInfra('${sn}')` }
  ]);
}
window.openRetireModal = openRetireModal;

async function submitRetireInfra(sn) {
  const target_status = document.getElementById('rinfra-status')?.value;
  const branch_id = document.getElementById('rinfra-wh')?.value;

  if (!sn || !target_status || !branch_id) {
    App.toast('Select condition and receiving warehouse.', 'error');
    return;
  }

  try {
    await DB.retireInfrastructureAsset({ sn, target_status, branch_id });
    App.closeModal();
    App.toast(`Device retired to ${target_status} status`, 'success');
    App.navigate('infrastructure');
  } catch (e) {
    App.toast(`Failed to retire device: ${e.message}`, 'error');
  }
}
window.submitRetireInfra = submitRetireInfra;

function openRegisterActiveDeviceModal() {
  const assetItems = DB.items.filter(i => i.category === 'Asset');
  const itemOpts = assetItems.map(i => `<option value="${i.id}">${i.name} (${i.id})</option>`).join('');
  const nextItemId = DB.nextId('ITM', DB.items);
  
  const destNodes = DB.locations.filter(l => l.type === 'POP' || l.type === 'Branch');
  const destOpts = destNodes.map(l => `<option value="${l.id}">${l.name} (${l.type})</option>`).join('');

  App.showModal('Register Active Infrastructure Device', `
    <div class="fg">
      <label class="fl">Asset Catalog Model</label>
      <select class="fi" id="intake-item-id" onchange="handleIntakeItemChange(this.value)">
        <option value="">-- Select Catalog Model --</option>
        ${itemOpts}
        <option value="NEW_ITEM" style="font-weight:bold;color:var(--accent)">➕ [Create New Item on the fly...]</option>
      </select>
    </div>

    <!-- Inline new catalog item creation sub-form -->
    <div id="intake-new-item-fields" style="display:none;background:rgba(255,255,255,0.02);padding:12px;border-radius:6px;margin-bottom:15px;border:1px dashed rgba(255,255,255,0.15)">
      <div style="font-weight:600;margin-bottom:8px;font-size:12px;color:var(--accent)">Create New Catalog blueprint:</div>
      <div class="fg" style="margin-bottom:8px">
        <label class="fl" style="font-size:11px">Generated Item ID</label>
        <input class="fi" id="intake-new-id" value="${nextItemId}" readonly style="opacity:0.6;font-family:monospace" />
      </div>
      <div class="fg" style="margin-bottom:8px">
        <label class="fl" style="font-size:11px">Product Model Name</label>
        <input class="fi" id="intake-new-name" placeholder="e.g. VSOL 8-Port GPON OLT" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="fg" style="margin-bottom:0">
          <label class="fl" style="font-size:11px">Base Unit Cost (NPR)</label>
          <input type="number" class="fi" id="intake-new-cost" placeholder="e.g. 45000" />
        </div>
        <div class="fg" style="margin-bottom:0">
          <label class="fl" style="font-size:11px">Reorder Level (Units)</label>
          <input type="number" class="fi" id="intake-new-reorder" value="5" />
        </div>
      </div>
    </div>

    <div class="fg">
      <label class="fl">Serial Number <span style="color:var(--red)">*</span></label>
      <input class="fi" id="intake-sn" placeholder="e.g. SN-OLT-8877" style="font-family:monospace" required />
    </div>

    <div class="fg">
      <label class="fl">Deployment Target Location</label>
      <select class="fi" id="intake-loc">${destOpts}</select>
    </div>

    <div class="fg">
      <label class="fl">Notes / Comment</label>
      <textarea class="fi" id="intake-notes" placeholder="e.g. Rack A-04, Secondary fiber link node" rows="3" style="resize:vertical"></textarea>
    </div>

    <div class="fg">
      <label class="fl">Device Photo / Image (Optional)</label>
      <input type="file" class="fi" id="intake-photo" accept="image/*" onchange="previewIntakePhoto(this)"/>
      <div id="intake-photo-preview" style="margin-top: 8px; display: none;">
        <img id="intake-photo-img" style="max-width: 100%; max-height: 120px; border-radius: 6px; border: 1px solid var(--border);" />
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: '📥 Register & Deploy Active', cls: 'btn-primary', onclick: 'submitDirectInfraIntake()' }
  ]);
}
window.openRegisterActiveDeviceModal = openRegisterActiveDeviceModal;

function previewIntakePhoto(input) {
  const file = input.files[0];
  const previewDiv = document.getElementById('intake-photo-preview');
  const previewImg = document.getElementById('intake-photo-img');
  
  if (file && previewDiv && previewImg) {
    const reader = new FileReader();
    reader.onload = function(e) {
      previewImg.src = e.target.result;
      previewDiv.style.display = 'block';
      input.setAttribute('data-base64', e.target.result);
      input.setAttribute('data-filename', file.name);
    };
    reader.readAsDataURL(file);
  } else if (previewDiv) {
    previewDiv.style.display = 'none';
    input.removeAttribute('data-base64');
    input.removeAttribute('data-filename');
  }
}
window.previewIntakePhoto = previewIntakePhoto;

function handleIntakeItemChange(value) {
  const container = document.getElementById('intake-new-item-fields');
  if (container) {
    container.style.display = (value === 'NEW_ITEM') ? 'block' : 'none';
  }
}
window.handleIntakeItemChange = handleIntakeItemChange;

async function submitDirectInfraIntake() {
  const selectItemId = document.getElementById('intake-item-id')?.value;
  const is_new_item = (selectItemId === 'NEW_ITEM');
  
  const sn = (document.getElementById('intake-sn')?.value || '').trim();
  const loc_id = document.getElementById('intake-loc')?.value;
  const notes = (document.getElementById('intake-notes')?.value || '').trim();
  
  if (!sn) {
    App.toast('Serial Number is strictly mandatory.', 'error');
    return;
  }
  if (!loc_id) {
    App.toast('Please select target location.', 'error');
    return;
  }
  
  let item_id = selectItemId;
  let new_item_details = null;
  
  if (is_new_item) {
    const newId = (document.getElementById('intake-new-id')?.value || '').trim();
    const newName = (document.getElementById('intake-new-name')?.value || '').trim();
    const newCost = document.getElementById('intake-new-cost')?.value;
    const newReorder = document.getElementById('intake-new-reorder')?.value;
    
    if (!newId || !newName) {
      App.toast('Please specify item ID and Product Model Name for the new catalog item.', 'error');
      return;
    }
    
    item_id = newId;
    new_item_details = {
      name: newName,
      category: 'Asset',
      uom: 'Pcs',
      reorder: parseInt(newReorder || 5),
      unit_cost: parseFloat(newCost || 0)
    };
  } else {
    if (!item_id) {
      App.toast('Please select a catalog model.', 'error');
      return;
    }
  }
  
  const photoInput = document.getElementById('intake-photo');
  const photoData = photoInput?.getAttribute('data-base64') || null;
  const photoName = photoInput?.getAttribute('data-filename') || null;

  try {
    await DB.directInfrastructureIntake({
      sn,
      mac: null,
      item_id,
      loc_id,
      infra_role: 'Infrastructure Device',
      infra_ip: null,
      infra_rack: null,
      purchase_cost: 0,
      warranty_months: 12,
      is_new_item,
      new_item_details,
      notes,
      devicePhoto: photoData,
      devicePhotoName: photoName
    });
    App.closeModal();
    App.toast(`Device ${sn} successfully registered at node ${loc_id}`, 'success');
    App.navigate('infrastructure');
  } catch (e) {
    App.toast(`Failed to register device: ${e.message}`, 'error');
  }
}
window.submitDirectInfraIntake = submitDirectInfraIntake;

let mapInstance = null;
let mapMarkers = {};

function initInfraMap() {
  const mapElement = document.getElementById('infra-map');
  if (!mapElement) return;

  // Find all locations with coordinates
  const mappedNodes = DB.locations.filter(l => 
    (l.type === 'POP' || l.type === 'Branch') && 
    l.latitude && l.longitude && 
    !isNaN(parseFloat(l.latitude)) && 
    !isNaN(parseFloat(l.longitude))
  );

  // Default center: Nepal center
  let centerLat = 28.3949;
  let centerLng = 84.1240;
  let zoom = 7;

  if (mappedNodes.length > 0) {
    let latSum = 0;
    let lngSum = 0;
    mappedNodes.forEach(n => {
      latSum += parseFloat(n.latitude);
      lngSum += parseFloat(n.longitude);
    });
    centerLat = latSum / mappedNodes.length;
    centerLng = lngSum / mappedNodes.length;
    zoom = mappedNodes.length === 1 ? 12 : 8;
  }

  try {
    if (mapInstance) {
      mapInstance.remove();
    }
    mapMarkers = {};

    mapInstance = L.map('infra-map').setView([centerLat, centerLng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);

    mappedNodes.forEach(loc => {
      const infra = DB.serialized.filter(s => s.status === 'Deployed_Infrastructure' && s.loc_id === loc.id);
      const iconColor = loc.type === 'POP' ? '#10b981' : '#3b82f6';
      
      const markerHtml = `
        <div style="background-color: ${iconColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5)"></div>
      `;
      
      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-map-icon',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const marker = L.marker([parseFloat(loc.latitude), parseFloat(loc.longitude)], { icon: customIcon }).addTo(mapInstance);
      
      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; color: #333; min-width: 160px;">
          <strong style="font-size:13px; display:block; margin-bottom:2px;">${loc.name}</strong>
          <span style="color:#666; font-size:11px; display:block; margin-bottom:4px;">📍 ${loc.city} (${loc.type} Node)</span>
          <span style="font-weight:600; color:#4f46e5; display:block; margin-bottom:6px;">${infra.length} Active Devices Deployed</span>
          <div style="border-top:1px solid #eee; padding-top:4px; max-height:80px; overflow-y:auto;">
            ${infra.map(s => {
              const item = DB.getItem(s.item_id);
              return `<div style="font-size:10px; margin-bottom:2px; color:#555;">• <b>${s.sn}</b> (${s.infra_role || 'Device'})</div>`;
            }).join('') || '<span style="color:#999; font-size:10px;">No deployed devices</span>'}
          </div>
        </div>
      `;
      
      marker.bindPopup(popupHtml);
      mapMarkers[loc.id] = marker;
    });

    // Plot mapped consumables (internal infrastructure usage e.g. Fiber)
    const mappedConsumables = DB.consumable_logs.filter(log =>
      log.latitude && log.longitude &&
      !isNaN(parseFloat(log.latitude)) &&
      !isNaN(parseFloat(log.longitude))
    );

    mappedConsumables.forEach(log => {
      const item = DB.getItem(log.item_id);
      const iconColor = '#f97316'; // Orange for deployed consumables / fiber
      
      const markerHtml = `
        <div style="background-color: ${iconColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5)"></div>
      `;
      
      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-map-icon',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      const marker = L.marker([parseFloat(log.latitude), parseFloat(log.longitude)], { icon: customIcon }).addTo(mapInstance);
      
      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; color: #333; min-width: 180px;">
          <strong style="font-size:13px; display:block; margin-bottom:2px; color:#f97316;">📦 Consumable Deployed</strong>
          <span style="font-weight:600; font-size:12px; display:block; margin-bottom:2px;">${item?.name || log.item_id}</span>
          <span style="color:#666; font-size:11px; display:block; margin-bottom:4px;">Qty: <b>${log.qty_used} ${item?.uom || 'Pcs'}</b></span>
          <div style="border-top:1px solid #eee; padding-top:4px; font-size:10px; color:#555;">
            <b>Date:</b> ${log.date ? String(log.date).substring(0, 10) : 'N/A'}<br/>
            <b>Technician:</b> ${DB.getTechnician(log.tech_id)?.name || log.tech_id || 'N/A'}<br/>
            ${log.notes ? `<b>Notes:</b> ${log.notes}<br/>` : ''}
            ${log.customer_acc ? `<b>Infra Details:</b> ${log.customer_acc}<br/>` : ''}
            <b>Coordinates:</b> <a href="https://www.google.com/maps/search/?api=1&query=${log.latitude},${log.longitude}" target="_blank" style="color:var(--accent); text-decoration:none; font-weight:600;">${log.latitude}, ${log.longitude} 🔗</a><br/>
          </div>
        </div>
      `;
      
      marker.bindPopup(popupHtml);
      mapMarkers['LOG-' + log.id] = marker;
    });

    setTimeout(() => {
      if (mapInstance) mapInstance.invalidateSize();
    }, 100);

  } catch (error) {
    console.error('Leaflet initialization failed:', error);
  }
}

function infrastructureMounted() {
  mapInstance = null;
  mapMarkers = {};
  
  const container = document.getElementById('infra-map-container');
  if (container && container.style.display !== 'none') {
    initInfraMap();
  }
  applyInfraFilter();
}
window.infrastructureMounted = infrastructureMounted;

function focusNodeOnMap(locId) {
  const loc = DB.getLocation(locId);
  if (!loc || !loc.latitude || !loc.longitude) {
    App.toast('Location coordinates not set. Edit this location under the Locations tab to add coordinates.', 'warning');
    return;
  }

  const container = document.getElementById('infra-map-container');
  if (container) {
    container.style.display = 'block';
  }

  if (!mapInstance) {
    initInfraMap();
  }

  if (mapInstance) {
    mapInstance.invalidateSize();
    const lat = parseFloat(loc.latitude);
    const lng = parseFloat(loc.longitude);
    mapInstance.setView([lat, lng], 14);
    
    const marker = mapMarkers[locId];
    if (marker) {
      setTimeout(() => {
        marker.openPopup();
      }, 250);
    }
  }

  container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
window.focusNodeOnMap = focusNodeOnMap;

function focusConsumableOnMap(logId, lat, lng) {
  if (!lat || !lng) {
    App.toast('This log entry does not have coordinates.', 'warning');
    return;
  }
  App.navigate('infrastructure');
  
  const container = document.getElementById('infra-map-container');
  if (container) {
    container.style.display = 'block';
  }
  
  if (!mapInstance) {
    initInfraMap();
  }
  
  if (mapInstance) {
    mapInstance.invalidateSize();
    mapInstance.setView([parseFloat(lat), parseFloat(lng)], 15);
    
    const marker = mapMarkers['LOG-' + logId];
    if (marker) {
      setTimeout(() => {
        marker.openPopup();
      }, 250);
    }
  }
  if (container) {
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
window.focusConsumableOnMap = focusConsumableOnMap;

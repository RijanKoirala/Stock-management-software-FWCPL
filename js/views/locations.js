
// View: Locations Management
function renderLocations() {
  const rows = DB.locations.map(loc => {
    const assetCount = DB.serialized.filter(s=>s.loc_id===loc.id&&s.status==='Available').length;
    const consItems = DB.consumable_stock.filter(c=>c.loc_id===loc.id).length;
    const techCount = DB.technicians.filter(t=>t.branch_id===loc.id).length;
    const badgeMap = { Central: 'badge-purple', Branch: 'badge-blue', POP: 'badge-green' };
    return `<tr>
      <td class="mono fw-600">${loc.id}</td>
      <td><div class="fw-600">${loc.name}</div></td>
      <td><span class="badge ${badgeMap[loc.type]||'badge-gray'}">${loc.type}</span></td>
      <td>${loc.city}</td>
      <td>${loc.manager || '—'}</td>
      <td class="mono">${assetCount}</td>
      <td class="mono">${consItems} item types</td>
      <td class="mono">${techCount}</td>
      <td><button class="btn btn-sm btn-secondary" onclick="editLoc('${loc.id}')">Edit</button></td>
    </tr>`;
  }).join('');

  return `
  <div class="view-header">
    <div><div class="view-title">◉ Locations</div><div class="view-subtitle">Manage warehouse and branch locations</div></div>
    <div class="view-actions">
      <button class="btn btn-primary btn-sm" onclick="openAddLoc()">+ Add Location</button>
    </div>
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>Location ID</th><th>Name</th><th>Type</th><th>City</th><th>Manager</th><th>Assets</th><th>Consumables</th><th>Technicians</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function openAddLoc() {
  App.showModal('Add New Location', `
    <div class="fg"><label class="fl">Location Name</label><input class="fi" id="loc-name" placeholder="e.g. Chitwan POP Station"/></div>
    <div class="fg"><label class="fl">Type</label><select class="fi" id="loc-type" onchange="toggleBranchAuthFields()"><option value="Branch">Branch Office</option><option value="Central">Central Warehouse</option><option value="POP">Network POP / Backbone Node</option></select></div>
    <div class="fg"><label class="fl">City</label><input class="fi" id="loc-city" placeholder="e.g. Chitwan"/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="fg"><label class="fl">Latitude (optional)</label><input class="fi" id="loc-lat" placeholder="e.g. 27.700769"/></div>
      <div class="fg"><label class="fl">Longitude (optional)</label><input class="fi" id="loc-lng" placeholder="e.g. 85.300140"/></div>
    </div>
    <div id="manager-info-fields">
      <div class="fg"><label class="fl">Manager Name</label><input class="fi" id="loc-mgr" placeholder="e.g. Ram Bahadur"/></div>
      <div class="fg" style="margin-bottom:12px">
        <label class="fl">Manager Digital Signature (Upload PNG/JPG)</label>
        <div style="display:flex; align-items:center; gap:8px">
          <input type="file" id="loc-sig-file" style="display:none" onchange="handleSigUpload(this)"/>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('loc-sig-file').click()" type="button" style="padding: 6px 12px; font-size: 12px;">📎 Choose Signature Image</button>
          <span id="sig-file-name" class="fs-11 text-muted">No signature uploaded</span>
        </div>
        <img id="sig-preview" style="display:none; margin-top:8px; max-height:40px; border:1px solid var(--border); padding:4px; background:white; object-fit:contain;" />
      </div>
    </div>
    <div id="branch-auth-fields">
      <div class="fg"><label class="fl">Storekeeper Login Email</label><input type="email" class="fi" id="loc-email" placeholder="e.g. chitwan@fwcpl.com"/></div>
      <div class="fg"><label class="fl">Storekeeper Password</label><input type="password" class="fi" id="loc-pwd" placeholder="e.g. password123"/></div>
    </div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'Add Location', cls:'btn-primary', onclick:'saveNewLoc()' }
  ]);
}

function toggleBranchAuthFields() {
  const type = document.getElementById('loc-type')?.value;
  const authSec = document.getElementById('branch-auth-fields');
  const mgrSec = document.getElementById('manager-info-fields');
  if (authSec) authSec.style.display = type === 'Branch' ? 'block' : 'none';
  if (mgrSec) mgrSec.style.display = type === 'POP' ? 'none' : 'block';
}
window.toggleBranchAuthFields = toggleBranchAuthFields;

async function saveNewLoc() {
  const name=document.getElementById('loc-name')?.value;
  const type=document.getElementById('loc-type')?.value;
  const city=document.getElementById('loc-city')?.value;
  const manager=type==='POP' ? '—' : document.getElementById('loc-mgr')?.value;
  if(!name||!city||!manager){ App.toast('Fill in all fields','error'); return; }
  
  let email = '';
  let pwd = '';
  if (type === 'Branch') {
    email = (document.getElementById('loc-email')?.value || '').trim();
    pwd = (document.getElementById('loc-pwd')?.value || '').trim();
    if (!email || !pwd) { App.toast('Provide both login email and password', 'error'); return; }
  }

  const id = DB.nextId('LOC', DB.locations);
  const manager_signature = document.getElementById('loc-sig-file')?.dataset.base64 || null;
  const latitude = (document.getElementById('loc-lat')?.value || '').trim() || null;
  const longitude = (document.getElementById('loc-lng')?.value || '').trim() || null;
  
  try {
    await DB.saveLocation({ id, name, type, city, manager, manager_signature, latitude, longitude });
    
    if (type === 'Branch') {
      const initials = manager.split(' ').map(n=>n[0]).join('').toUpperCase() || 'BM';
      const userPayload = {
        email: email.toLowerCase(),
        name: `${manager} (${name})`,
        initials: initials,
        role: 'branch_storekeeper',
        role_label: `${name} Storekeeper`,
        location_id: id,
        location_name: name,
        password: pwd
      };
      await DB.saveUser(userPayload);
      USERS[email.toLowerCase()] = userPayload;
      if (window.saveUsers) window.saveUsers();
    }

    App.closeModal();
    App.toast(`Location ${id} added and credentials saved successfully`, 'success');
    App.navigate('locations');
  } catch (e) {
    App.toast(`Failed to add location: ${e.message}`, 'error');
  }
}
window.saveNewLoc = saveNewLoc;

function editLoc(id) {
  const loc = DB.getLocation(id);
  const isPop = loc.type === 'POP';
  const isBranch = loc.type === 'Branch';
  const userObj = Object.values(USERS).find(u => u.location_id === id && u.role === 'branch_storekeeper');

  App.showModal(`Edit Location — ${loc.name}`, `
    <div class="fg"><label class="fl">Location ID</label><input class="fi" value="${loc.id}" readonly/></div>
    <div class="fg"><label class="fl">Name</label><input class="fi" id="eloc-name" value="${loc.name}"/></div>
    <div class="fg"><label class="fl">City</label><input class="fi" id="eloc-city" value="${loc.city}"/></div>
    <div id="eloc-mgr-container" style="display: ${isPop ? 'none' : 'block'}">
      <div class="fg"><label class="fl">Manager</label><input class="fi" id="eloc-mgr" value="${loc.manager || ''}"/></div>
      <div class="fg" style="margin-bottom:12px">
        <label class="fl">Manager Digital Signature (Upload PNG/JPG)</label>
        <div style="display:flex; align-items:center; gap:8px">
          <input type="file" id="eloc-sig-file" style="display:none" onchange="handleSigUpload(this)"/>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('eloc-sig-file').click()" type="button" style="padding: 6px 12px; font-size: 12px;">📎 Choose Signature Image</button>
          <span id="esig-file-name" class="fs-11 text-muted">${loc.manager_signature ? 'Signature uploaded' : 'No signature uploaded'}</span>
        </div>
        <img id="sig-preview" src="${loc.manager_signature || ''}" style="${loc.manager_signature ? 'display:block;' : 'display:none;'} margin-top:8px; max-height:40px; border:1px solid var(--border); padding:4px; background:white; object-fit:contain;" />
      </div>
    </div>
    <div id="eloc-branch-auth-fields" style="display: ${isBranch ? 'block' : 'none'}">
      <div class="fg"><label class="fl">Storekeeper Login Email</label><input type="email" class="fi" id="eloc-email" value="${userObj ? userObj.email : ''}" placeholder="e.g. branch@fwcpl.com"/></div>
      <div class="fg"><label class="fl">Storekeeper Password (Leave blank to keep unchanged)</label><input type="password" class="fi" id="eloc-pwd" placeholder="Enter new password to reset"/></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="fg"><label class="fl">Latitude (optional)</label><input class="fi" id="eloc-lat" value="${loc.latitude || ''}" placeholder="e.g. 27.700769"/></div>
      <div class="fg"><label class="fl">Longitude (optional)</label><input class="fi" id="eloc-lng" value="${loc.longitude || ''}" placeholder="e.g. 85.300140"/></div>
    </div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'Save', cls:'btn-primary', onclick:`saveEditLoc('${id}')` }
  ]);
}

async function saveEditLoc(id) {
  const name=document.getElementById('eloc-name')?.value;
  const city=document.getElementById('eloc-city')?.value;
  const loc = DB.getLocation(id);
  const manager=loc.type==='POP' ? '—' : document.getElementById('eloc-mgr')?.value;
  if(!name||!city||!manager){ App.toast('Fill in all fields','error'); return; }
  
  let email = '';
  let pwd = '';
  if (loc.type === 'Branch') {
    email = (document.getElementById('eloc-email')?.value || '').trim();
    pwd = (document.getElementById('eloc-pwd')?.value || '').trim();
    if (!email) { App.toast('Provide a login email', 'error'); return; }
  }

  try {
    const sigInput = document.getElementById('eloc-sig-file');
    const manager_signature = sigInput?.dataset.base64 || loc.manager_signature || null;
    const latitude = (document.getElementById('eloc-lat')?.value || '').trim() || null;
    const longitude = (document.getElementById('eloc-lng')?.value || '').trim() || null;
    
    // 1. Update Location Details
    await DB.put(`/api/locations/${id}`, { name, city, manager, manager_signature, latitude, longitude });
    
    // 2. Update Branch Storekeeper credentials if applicable
    if (loc.type === 'Branch') {
      const initials = manager.split(' ').map(n=>n[0]).join('').toUpperCase() || 'BM';
      const userPayload = {
        email: email.toLowerCase(),
        name: `${manager} (${name})`,
        initials: initials,
        location_name: name,
        password: pwd || undefined // only update password if provided
      };
      
      await DB.put(`/api/users/location/${id}`, userPayload);
      
      // Update local cache map
      const oldUser = Object.values(USERS).find(u => u.location_id === id && u.role === 'branch_storekeeper');
      if (oldUser) {
        delete USERS[oldUser.email.toLowerCase()];
      }
      const newUser = {
        email: email.toLowerCase(),
        name: `${manager} (${name})`,
        initials: initials,
        role: 'branch_storekeeper',
        role_label: `${name} Storekeeper`,
        location_id: id,
        location_name: name,
        password: pwd || (oldUser ? oldUser.password : 'password')
      };
      USERS[email.toLowerCase()] = newUser;
      if (window.saveUsers) window.saveUsers();
    }

    await DB.load();
    App.closeModal(); 
    App.toast('Location updated','success'); 
    App.navigate('locations');
  } catch (e) {
    App.toast(`Failed to update location: ${e.message}`, 'error');
  }
}
window.saveEditLoc = saveEditLoc;

function handleSigUpload(input) {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      input.dataset.base64 = e.target.result;
      const preview = document.getElementById('sig-preview');
      if (preview) {
        preview.src = e.target.result;
        preview.style.display = 'block';
      }
      const nameSpan = document.getElementById('sig-file-name') || document.getElementById('esig-file-name');
      if (nameSpan) {
        nameSpan.textContent = file.name;
        nameSpan.style.color = 'var(--green)';
      }
    };
    reader.readAsDataURL(file);
  }
}
window.handleSigUpload = handleSigUpload;

// ═══════════════════════════════════════
// View: Technician Wallet
// ═══════════════════════════════════════

function renderTechnicians() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  
  const branchFilterHtml = isBranchKeeper ? '' : `
    <select class="filter-select" id="tech-branch-filter" onchange="filterTechByBranch()">
      <option value="">All Branches</option>
      ${DB.locations.filter(l=>l.type==='Branch').map(l=>`<option value="${l.id}">${l.name}</option>`).join('')}
    </select>
  `;

  const techs = isBranchKeeper 
    ? DB.technicians.filter(t => t.branch_id === user.location_id)
    : DB.technicians;

  const techCards = techs.map(tech => renderTechnicianCard(tech)).join('');

  return `
  <div class="view-header">
    <div><div class="view-title">◎ Technician Wallet</div><div class="view-subtitle">Track equipment currently held by each field technician</div></div>
    <div class="view-actions" style="display:flex;gap:10px">
      ${branchFilterHtml}
      <button class="btn btn-primary btn-sm" onclick="openAddTechnician()">+ Register Technician</button>
    </div>
  </div>
  
  <div id="tech-cards">${techCards}</div>`;
}

function filterTechByBranch() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  const branchId = isBranchKeeper ? user.location_id : document.getElementById('tech-branch-filter')?.value;
  const techs = branchId ? DB.technicians.filter(t=>t.branch_id===branchId) : DB.technicians;
  document.getElementById('tech-cards').innerHTML = techs.map(tech => renderTechnicianCard(tech)).join('');
}

function renderTechnicianCard(tech) {
  const stock = DB.getTechStock(tech.id);
  const techCons = DB.getTechConsumables(tech.id);
  const branch = DB.getLocation(tech.branch_id);
  const totalVal = stock.reduce((s,sr) => { const it = DB.getItem(sr.item_id); return s + Number(it?.unit_cost||0); }, 0) +
                   techCons.reduce((s,tc) => { const it = DB.getItem(tc.item_id); return s + (Number(tc.qty) * Number(it?.unit_cost||0)); }, 0);
  
  const itemGroups = {};
  stock.forEach(s => { if (!itemGroups[s.item_id]) itemGroups[s.item_id] = []; itemGroups[s.item_id].push(s); });
  
  const itemRows = Object.entries(itemGroups).map(([iid, serials]) => {
    const it = DB.getItem(iid);
    return `<tr>
      <td><div class="fw-600 fs-12">${it?.name||iid}</div></td>
      <td class="mono">${serials.map(s=>`<span class="tag">${s.sn}</span>`).join(' ')}</td>
      <td class="mono">${serials.length}</td>
      <td>
        ${serials.map(s => `<button class="btn btn-sm btn-success" style="margin:2px" onclick="deployToCustomer('${s.sn}','${tech.id}')">Deploy</button> <button class="btn btn-sm btn-secondary" style="margin:2px" onclick="returnAsset('${s.sn}','${tech.branch_id}')">Return</button>`).join('')}
      </td>
    </tr>`;
  }).join('');

  const consRows = techCons.map(tc => {
    const it = DB.getItem(tc.item_id);
    return `<tr>
      <td><div class="fw-600 fs-12">${it?.name || tc.item_id}</div></td>
      <td class="mono">${tc.qty} ${it?.uom || 'Pcs'}</td>
      <td class="mono">NPR ${it?.unit_cost?.toLocaleString()}</td>
      <td>
        <button class="btn btn-sm btn-success" style="margin:2px; padding:3px 8px; font-size:10px;" onclick="openLogWalletConsumableUsage('${tech.id}', '${tc.item_id}')">Deploy</button>
        <button class="btn btn-sm btn-secondary" style="margin:2px; padding:3px 8px; font-size:10px;" onclick="openReturnWalletConsumables('${tech.id}', '${tc.item_id}')">Return</button>
      </td>
    </tr>`;
  }).join('');

  const assetsTable = stock.length ? `
    <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--accent); margin:12px 16px 4px 16px; letter-spacing:0.5px;">📦 Serialized Assets in Wallet</div>
    <div class="table-wrap" style="margin-bottom:12px;"><table>
      <thead><tr><th>Item</th><th>Serial Numbers</th><th>Qty</th><th>Actions</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table></div>` : '';

  const consTable = techCons.length ? `
    <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--orange); margin:12px 16px 4px 16px; letter-spacing:0.5px;">🔌 Consumables in Wallet</div>
    <div class="table-wrap" style="margin-bottom:12px;"><table>
      <thead><tr><th>Item</th><th>Quantity</th><th>Unit Cost</th><th>Actions</th></tr></thead>
      <tbody>${consRows}</tbody>
    </table></div>` : '';

  const walletContents = (stock.length || techCons.length) ? `
    ${assetsTable}
    ${consTable}
  ` : `<div class="empty-state" style="padding:24px"><div class="es-icon" style="font-size:32px">🎒</div><p>No stock assigned to technician wallet</p></div>`;

  const vehiclePlate = tech.vehicle_plate;

  return `
  <div class="card" style="margin-bottom:16px">
    <div class="card-hdr" style="align-items:flex-start">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--accent-soft);border:1.5px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--accent)">
          ${tech.name.split(' ').map(n=>n[0]).join('')}
        </div>
        <div>
          <div class="fw-600">${tech.name}</div>
          <div class="fs-12 text-muted" style="margin-bottom:4px">${tech.id} · ${branch?.name||tech.branch_id} · 📞 ${tech.phone}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${vehiclePlate ? `
              <span class="tag" style="background:var(--blue-soft);color:var(--blue);font-size:10px;padding:2px 6px">🏍️ ${vehiclePlate}</span>
              <span class="tag" style="background:var(--purple-soft);color:var(--purple);font-size:10px;padding:2px 6px">⛽ ${tech.vehicle_mileage} km/L</span>
              <span class="tag" style="background:rgba(255,255,255,0.05);color:var(--text-secondary);font-size:10px;padding:2px 6px">🏁 Odo: ${tech.current_odometer} km</span>
            ` : `<span style="color:var(--text-muted);font-size:11px">🏍️ No vehicle assigned</span>`}
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="text-align:right">
          <div class="fw-700 text-accent">NPR ${totalVal.toLocaleString()}</div>
          <div class="fs-11 text-muted">${stock.length + techCons.length} item(s) in wallet</div>
        </div>
        <span class="badge ${tech.status==='Active'?'badge-green':'badge-gray'}">${tech.status}</span>
        <button class="btn btn-sm btn-primary" onclick="issueToTech('${tech.id}')">Issue Stock</button>
        ${vehiclePlate ? `<button class="btn btn-sm btn-secondary" onclick="openLogTripFuel('${tech.id}')">🏍️ Log Trip</button>` : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteTechnician('${tech.id}', ${stock.length + techCons.length})">Delete</button>
      </div>
    </div>
    ${walletContents}
  </div>`;
}

function issueToTech(techId) {
  const tech = DB.getTechnician(techId);
  const availAssets = DB.serialized.filter(s => s.status === 'Available' && s.loc_id === tech.branch_id);
  const assetRowsHtml = availAssets.map(s => {
    const it = DB.getItem(s.item_id);
    return `
      <label class="issue-asset-row" data-search="${s.sn.toLowerCase()} ${(s.mac||'').toLowerCase()} ${(it?.name||'').toLowerCase()}" style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:6px; cursor:pointer; transition:var(--transition); background:rgba(255,255,255,0.01); margin-bottom:2px">
        <input type="checkbox" name="chk-issue-asset" value="${s.sn}" style="width:16px; height:16px; accent-color:var(--accent); cursor:pointer" />
        <span class="mono" style="font-size:12px; color:var(--text-primary)">
          <strong>[${it?.id || 'N/A'}] ${it?.name || s.item_id}</strong><br/>
          <span style="font-size:11px; color:var(--text-secondary)">SN: ${s.sn} ${s.mac ? `· MAC: ${s.mac}` : ''}</span>
        </span>
      </label>
    `;
  }).join('');

  const branchConsumables = DB.getConsumableStock(tech.branch_id).filter(c => c.qty > 0);
  const consRowsHtml = branchConsumables.map(c => {
    const it = DB.getItem(c.item_id);
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:6px; padding:6px 12px;">
        <span style="font-size:12px; font-weight:600;">${it?.name} <span class="text-secondary" style="font-size:11px;">(Avail: ${c.qty} ${it?.uom})</span></span>
        <input type="number" class="fi issue-cons-qty-input" data-item="${c.item_id}" min="0" max="${c.qty}" placeholder="0" style="width:80px; margin-bottom:0; text-align:right;" />
      </div>
    `;
  }).join('');

  App.showModal(`Issue Stock to ${tech?.name}`, `
    <p class="text-secondary mb-16">Select assets and enter quantities of consumables from <strong>${DB.getLocation(tech.branch_id)?.name || tech.branch_id}</strong> to assign to the technician.</p>
    
    <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--accent); margin-bottom:8px; letter-spacing:0.5px;">📦 Serialized Assets</div>
    <div class="fg" style="margin-bottom:12px">
      <input type="text" class="fi" placeholder="🔍 Search Serial Number or MAC..." oninput="filterIssueAssets(this.value)" style="margin-bottom:8px; font-size:12px;" />
      <div id="issue-assets-list" style="border:1px solid var(--border); border-radius:8px; max-height:180px; overflow-y:auto; background:var(--bg-card2); padding:6px; display:flex; flex-direction:column; gap:2px">
        ${assetRowsHtml || '<div class="text-muted fs-12" style="padding:10px; text-align:center">No available assets in branch warehouse</div>'}
      </div>
    </div>
    
    <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--orange); margin:16px 0 8px 0; letter-spacing:0.5px;">🔌 Bulk Consumables</div>
    <div style="max-height: 150px; overflow-y: auto; margin-bottom:16px;">
      ${consRowsHtml.length ? consRowsHtml : '<div class="text-muted" style="font-size:11px;">No consumables in branch warehouse.</div>'}
    </div>
    
    <div class="fg"><label class="fl">Notes</label><textarea class="fi" id="issue-notes" rows="2"></textarea></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: 'Issue to Technician', cls: 'btn-primary', onclick: `confirmIssue('${techId}')` }
  ]);
}

async function confirmIssue(techId) {
  const checkedInputs = document.querySelectorAll('input[name="chk-issue-asset"]:checked');
  const sns = Array.from(checkedInputs).map(chk => chk.value);

  const consInputs = document.querySelectorAll('.issue-cons-qty-input');
  const consumablesToIssue = [];
  consInputs.forEach(input => {
    const qty = parseInt(input.value || 0);
    if (qty > 0) {
      const itemId = input.getAttribute('data-item');
      consumablesToIssue.push({ itemId, qty });
    }
  });

  if (!sns.length && !consumablesToIssue.length) {
    App.toast('Please select at least one asset or enter consumable quantity to issue', 'error');
    return;
  }

  try {
    if (sns.length > 0) {
      await DB.issueAssetsToTech(sns, techId);
    }
    if (consumablesToIssue.length > 0) {
      await DB.issueConsumablesToTech(techId, consumablesToIssue);
    }

    App.closeModal();
    App.toast(`✅ Stock successfully issued to technician!`, 'success');
    App.navigate('technicians');
  } catch (e) {
    App.toast(`Failed to issue stock: ${e.message}`, 'error');
  }
}

function deployToCustomer(sn, techId) {
  const s = DB.serialized.find(x=>x.sn===sn);
  const it = DB.getItem(s?.item_id);
  App.showModal('Deploy to Customer', `
    <div class="fg"><label class="fl">Serial Number</label><input class="fi" value="${sn}" readonly/></div>
    <div class="fg"><label class="fl">Item</label><input class="fi" value="${it?.name}" readonly/></div>
    <div class="fg"><label class="fl">Customer Account #</label><input class="fi" id="deploy-cust" placeholder="e.g. CUST-10923" required/></div>
    <div class="fg"><label class="fl">Installation Address</label><input class="fi" id="deploy-addr" placeholder="Street address..."/></div>
    <div class="fg"><label class="fl">Notes</label><textarea class="fi" id="deploy-notes" rows="2"></textarea></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'✓ Confirm Deployment', cls:'btn-success', onclick:`confirmDeploy('${sn}', '${techId}')` }
  ]);
}

async function confirmDeploy(sn, techId) {
  const cust = document.getElementById('deploy-cust')?.value;
  if (!cust) { App.toast('Customer account is required', 'error'); return; }
  
  try {
    await DB.deployAssetToCustomer(sn, cust, techId);
    App.closeModal();
    App.toast(`Device deployed to customer ${cust}`, 'success');
    App.navigate('technicians');
  } catch (e) {
    App.toast(`Failed to deploy device: ${e.message}`, 'error');
  }
}

function openAddTechnician() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  const allowedLocs = isBranchKeeper ? DB.locations.filter(l => l.id === user.location_id) : DB.locations.filter(l=>l.type==='Branch');
  const branchOpts = allowedLocs.map(l=>`<option value="${l.id}">${l.name}</option>`).join('');
  const selectDisabled = isBranchKeeper ? 'disabled' : '';

  App.showModal('Register New Field Technician', `
    <div class="fg"><label class="fl">Technician Full Name</label><input class="fi" id="new-tech-name" placeholder="e.g. Ramesh Giri" required/></div>
    <div class="fg"><label class="fl">Phone Number</label><input class="fi" id="new-tech-phone" placeholder="e.g. 9841234567" required/></div>
    <div class="fg"><label class="fl">Assign to Branch</label><select class="fi" id="new-tech-branch" ${selectDisabled}>${branchOpts}</select></div>
    
    <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px"></div>
    <h4 style="font-size:12px;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin-bottom:12px">🏍️ Vehicle Details (Fuel Tracking)</h4>
    
    <div class="fg"><label class="fl">Vehicle Plate Number (Optional)</label><input class="fi" id="new-tech-plate" placeholder="e.g. BA 3 PA 8812"/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="fg"><label class="fl">Bike Mileage (KM/L)</label><input type="number" class="fi" id="new-tech-mileage" value="40" step="0.5"/></div>
      <div class="fg"><label class="fl">Current Odometer (KM)</label><input type="number" class="fi" id="new-tech-odo" value="0"/></div>
    </div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'Register Technician', cls:'btn-primary', onclick:'saveNewTechnician()' }
  ]);
}
window.openAddTechnician = openAddTechnician;

async function saveNewTechnician() {
  const name = document.getElementById('new-tech-name')?.value;
  const phone = document.getElementById('new-tech-phone')?.value;
  const branchId = document.getElementById('new-tech-branch')?.value;
  const plate = document.getElementById('new-tech-plate')?.value || '';
  const mileage = parseFloat(document.getElementById('new-tech-mileage')?.value || '40.00');
  const odo = parseInt(document.getElementById('new-tech-odo')?.value || '0');

  if(!name || !phone) { App.toast('Fill in all fields', 'error'); return; }
  
  const id = DB.nextId('TECH', DB.technicians);
  
  try {
    await DB.saveTechnician({
      id,
      name,
      branch_id: branchId,
      phone,
      status: 'Active',
      vehicle_plate: plate,
      vehicle_mileage: mileage,
      current_odometer: odo
    });
    App.closeModal();
    App.toast(`Technician ${name} registered successfully under ${DB.getLocation(branchId)?.name}`, 'success');
    App.navigate('technicians');
  } catch (e) {
    App.toast(`Failed to register technician: ${e.message}`, 'error');
  }
}
window.saveNewTechnician = saveNewTechnician;

async function deleteTechnician(id, stockLength) {
  if (stockLength > 0) {
    App.toast("Cannot delete technician: please return or deploy all active items in their wallet first.", "error");
    return;
  }
  
  if (confirm(`Are you sure you want to delete technician ${id}?`)) {
    try {
      await DB.deleteTechnician(id);
      App.toast("Technician deleted successfully", "success");
      App.navigate('technicians');
    } catch (e) {
      App.toast(`Failed to delete technician: ${e.message}`, "error");
    }
  }
}
window.deleteTechnician = deleteTechnician;

async function returnAsset(sn, branchId) {
  if (confirm(`Are you sure you want to return device ${sn} back to the branch inventory?`)) {
    try {
      await DB.returnAssetFromTech(sn, branchId);
      App.toast(`Device ${sn} returned to branch inventory successfully`, 'success');
      App.navigate('technicians');
    } catch (e) {
      App.toast(`Failed to return device: ${e.message}`, 'error');
    }
  }
}
window.returnAsset = returnAsset;

function openLogWalletConsumableUsage(techId, itemId) {
  const tech = DB.getTechnician(techId);
  const tc = DB.getTechConsumables(techId).find(c => c.item_id === itemId);
  if (!tech || !tc) return;

  const it = DB.getItem(itemId);

  App.showModal(`🔌 Log Usage from ${tech.name}'s Bag`, `
    <div style="background:rgba(46, 204, 113, 0.08); border:1px solid rgba(46, 204, 113, 0.25); border-radius:8px; padding:12px; margin-bottom:16px;">
      <div style="font-size:12px; color:var(--green); font-weight:600;">🔌 Log Consumables Used</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
        This logs consumables (e.g. drop wire) used for a customer connection directly from this technician's wallet.
      </div>
    </div>
    <div class="fg">
      <label class="fl">Consumable Item</label>
      <input class="fi" value="${it?.name || itemId}" readonly />
    </div>
    <div class="fg">
      <label class="fl">Quantity in Bag</label>
      <input class="fi" value="${tc.qty} ${it?.uom || ''}" readonly />
    </div>
    <div class="fg">
      <label class="fl">Quantity Deployed</label>
      <input type="number" class="fi" id="log-wallet-qty" min="1" max="${tc.qty}" placeholder="Enter quantity used..."/>
    </div>
    
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; margin-top:12px;">
      <input type="checkbox" id="is-trunk-use" onchange="toggleTrunkUsage(this)" style="width:16px; height:16px; cursor:pointer;" />
      <label for="is-trunk-use" style="font-size:12px; font-weight:600; cursor:pointer; user-select:none;">🛠️ Use for Internal Network (Not a customer)</label>
    </div>
    
    <div class="fg">
      <label class="fl" id="cust-label">Customer Account #</label>
      <input class="fi" id="log-wallet-cust" placeholder="e.g. CUST-10923"/>
    </div>
    <div class="fg">
      <label class="fl">Notes</label>
      <textarea class="fi" id="log-wallet-notes" rows="2" placeholder="e.g. Fiber cable drop wire deployed at customer home or infrastructure details..."></textarea>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: 'Log Usage', cls: 'btn-success', onclick: `confirmWalletConsumableLog('${techId}', '${itemId}')` }
  ]);
}

async function confirmWalletConsumableLog(techId, itemId) {
  const qty = parseInt(document.getElementById('log-wallet-qty')?.value);
  const customerAcc = document.getElementById('log-wallet-cust')?.value;
  const notes = document.getElementById('log-wallet-notes')?.value;
  const isTrunk = document.getElementById('is-trunk-use')?.checked;

  if (!qty || qty <= 0) { App.toast('Please enter a valid quantity', 'error'); return; }
  if (!customerAcc) {
    App.toast(isTrunk ? 'Internal Network / Infrastructure details are required' : 'Customer account is required', 'error');
    return;
  }

  try {
    await DB.logTechConsumableUsage(techId, itemId, qty, customerAcc, notes);
    App.closeModal();
    App.toast(`✅ Consumable usage logged successfully.`, 'success');
    App.navigate('technicians');
  } catch (e) {
    App.toast(`Failed to log usage: ${e.message}`, 'error');
  }
}

function openReturnWalletConsumables(techId, itemId) {
  const tech = DB.getTechnician(techId);
  const tc = DB.getTechConsumables(techId).find(c => c.item_id === itemId);
  if (!tech || !tc) return;

  const it = DB.getItem(itemId);
  const branchName = DB.getLocation(tech.branch_id)?.name || tech.branch_id;

  App.showModal(`↩ Return Consumables to Branch`, `
    <div style="background:rgba(100,149,237,0.08); border:1px solid rgba(100,149,237,0.25); border-radius:8px; padding:12px; margin-bottom:16px;">
      <div style="font-size:12px; color:var(--blue); font-weight:600;">↩ Return to Warehouse</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
        This will return unused consumables back to the <strong>${branchName}</strong> warehouse inventory.
      </div>
    </div>
    <div class="fg">
      <label class="fl">Consumable Item</label>
      <input class="fi" value="${it?.name || itemId}" readonly />
    </div>
    <div class="fg">
      <label class="fl">Quantity in Bag</label>
      <input class="fi" value="${tc.qty} ${it?.uom || ''}" readonly />
    </div>
    <div class="fg">
      <label class="fl">Quantity to Return</label>
      <input type="number" class="fi" id="return-wallet-qty" min="1" max="${tc.qty}" placeholder="Enter quantity to return..."/>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: 'Return to Branch', cls: 'btn-primary', onclick: `confirmReturnWalletConsumables('${techId}', '${itemId}')` }
  ]);
}

async function confirmReturnWalletConsumables(techId, itemId) {
  const qty = parseInt(document.getElementById('return-wallet-qty')?.value);

  if (!qty || qty <= 0) { App.toast('Please enter a valid quantity', 'error'); return; }

  try {
    await DB.returnConsumablesToBranch(techId, itemId, qty);
    App.closeModal();
    App.toast(`✅ Consumables successfully returned to branch warehouse.`, 'success');
    App.navigate('technicians');
  } catch (e) {
    App.toast(`Return failed: ${e.message}`, 'error');
  }
}

window.renderTechnicians = renderTechnicians;
window.filterTechByBranch = filterTechByBranch;
window.renderTechnicianCard = renderTechnicianCard;
window.issueToTech = issueToTech;
window.confirmIssue = confirmIssue;
window.deployToCustomer = deployToCustomer;
window.confirmDeploy = confirmDeploy;
window.openLogWalletConsumableUsage = openLogWalletConsumableUsage;
window.confirmWalletConsumableLog = confirmWalletConsumableLog;
window.openReturnWalletConsumables = openReturnWalletConsumables;
window.confirmReturnWalletConsumables = confirmReturnWalletConsumables;

function filterIssueAssets(query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll('#issue-assets-list .issue-asset-row');
  rows.forEach(row => {
    const text = row.getAttribute('data-search') || '';
    if (!q || text.includes(q)) {
      row.style.display = 'flex';
    } else {
      row.style.display = 'none';
    }
  });
}
window.filterIssueAssets = filterIssueAssets;

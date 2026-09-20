// ═══════════════════════════════════════
// View: Fuel Tracker Dashboard
// ═══════════════════════════════════════

function renderFuelTracker() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  const locId = isBranchKeeper ? user.location_id : null;

  const localTechs = locId 
    ? DB.technicians.filter(t => t.branch_id === locId)
    : DB.technicians;
  const localTechIds = localTechs.map(t => t.id);

  const logs = locId
    ? DB.fuel_logs.filter(l => localTechIds.includes(l.tech_id))
    : DB.fuel_logs;

  const totalKm = logs.reduce((s,l) => s + l.distance, 0);
  const totalCost = logs.reduce((s,l) => s + Number(l.refuel_cost || 0), 0);
  const techsWithBikes = localTechs.filter(t => t.vehicle_plate);
  const avgEff = techsWithBikes.length ? (techsWithBikes.reduce((s,t) => s + Number(t.vehicle_mileage), 0) / techsWithBikes.length) : 40.00;
  const discrepancies = logs.filter(l => l.discrepancy).length;

  const logRows = logs.map(l => {
    const tech = DB.getTechnician(l.tech_id);
    const vehicle = tech?.vehicle_plate || 'N/A';
    const refuelStr = l.refuel_liters ? `${l.refuel_liters} L` : '<span style="color:var(--text-muted)">-</span>';
    const costStr = l.refuel_cost ? `NPR ${Number(l.refuel_cost).toLocaleString()}` : '<span style="color:var(--text-muted)">-</span>';
    const alertBadge = l.discrepancy 
      ? `<span class="badge badge-danger">⚠️ High Discrepancy</span>` 
      : `<span class="badge badge-green">Clear</span>`;
      
    return `<tr>
      <td class="mono fs-12">${l.date}</td>
      <td class="fw-600">${tech?.name || l.tech_id}</td>
      <td class="mono fw-600">${vehicle}</td>
      <td class="mono text-secondary">${l.start_odo} → ${l.end_odo} km</td>
      <td class="mono fw-600" style="text-align:center">${l.distance} km</td>
      <td class="mono text-secondary" style="text-align:center">${refuelStr}</td>
      <td class="mono text-accent" style="text-align:right">${costStr}</td>
      <td class="mono text-secondary" style="text-align:center">${Number(l.expected_liters || 0).toFixed(2)} L</td>
      <td><div style="font-size:12px;color:var(--text-secondary)">${l.notes || '-'}</div></td>
      <td>${alertBadge}</td>
    </tr>`;
  }).join('');

  return `
    <div class="view-header">
      <div>
        <div class="view-title">⛽ Fuel Tracker</div>
        <div class="view-subtitle">Monitor company bike mileage and fuel disbursements</div>
      </div>
      <div class="view-actions">
        <select class="filter-select" id="fuel-tech-filter" onchange="filterFuelLogs()">
          <option value="">All Technicians</option>
          ${techsWithBikes.map(t => `<option value="${t.id}">${t.name} (${t.vehicle_plate})</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="stat-card" style="--stat-color:var(--blue)">
        <div class="stat-icon">🏁</div>
        <div class="stat-val">${totalKm.toLocaleString()}</div>
        <div class="stat-label">Total Distance Traveled</div>
      </div>
      <div class="stat-card" style="--stat-color:var(--green)">
        <div class="stat-icon">⛽</div>
        <div class="stat-val">NPR ${totalCost.toLocaleString()}</div>
        <div class="stat-label">Total Fuel Cost</div>
      </div>
      <div class="stat-card" style="--stat-color:var(--purple)">
        <div class="stat-icon">🏍️</div>
        <div class="stat-val">${avgEff.toFixed(1)} km/L</div>
        <div class="stat-label">Avg Vehicle Efficiency</div>
      </div>
      <div class="stat-card" style="--stat-color:var(--red)">
        <div class="stat-icon">⚠️</div>
        <div class="stat-val" style="color:var(--red)">${discrepancies}</div>
        <div class="stat-label">Discrepancy Alerts</div>
      </div>
    </div>

    <div class="card">
      <div class="card-hdr">
        <div class="card-title">All Fuel & Mileage Logs</div>
      </div>
      <div class="table-wrap" id="fuel-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Technician</th>
              <th>Vehicle</th>
              <th>Odometer Range</th>
              <th style="text-align:center">Distance</th>
              <th style="text-align:center">Refueled</th>
              <th style="text-align:right">Fuel Cost</th>
              <th style="text-align:center">Expected L</th>
              <th>Notes / Task Purpose</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${logRows || '<tr><td colspan="10" class="text-center" style="padding:24px;color:var(--text-muted)">No logs recorded yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function filterFuelLogs() {
  const user = getCurrentUser();
  const isBranchKeeper = user && user.role === 'branch_storekeeper';
  const locId = isBranchKeeper ? user.location_id : null;

  const localTechs = locId 
    ? DB.technicians.filter(t => t.branch_id === locId)
    : DB.technicians;
  const localTechIds = localTechs.map(t => t.id);

  const logs = locId
    ? DB.fuel_logs.filter(l => localTechIds.includes(l.tech_id))
    : DB.fuel_logs;

  const techId = document.getElementById('fuel-tech-filter')?.value;
  const filtered = techId ? logs.filter(l => l.tech_id === techId) : logs;
  
  document.querySelector('#fuel-table tbody').innerHTML = filtered.map(l => {
    const tech = DB.getTechnician(l.tech_id);
    const vehicle = tech?.vehicle_plate || 'N/A';
    const refuelStr = l.refuel_liters ? `${l.refuel_liters} L` : '<span style="color:var(--text-muted)">-</span>';
    const costStr = l.refuel_cost ? `NPR ${Number(l.refuel_cost).toLocaleString()}` : '<span style="color:var(--text-muted)">-</span>';
    const alertBadge = l.discrepancy 
      ? `<span class="badge badge-danger">⚠️ High Discrepancy</span>` 
      : `<span class="badge badge-green">Clear</span>`;
      
    return `<tr>
      <td class="mono fs-12">${l.date}</td>
      <td class="fw-600">${tech?.name || l.tech_id}</td>
      <td class="mono fw-600">${vehicle}</td>
      <td class="mono text-secondary">${l.start_odo} → ${l.end_odo} km</td>
      <td class="mono fw-600" style="text-align:center">${l.distance} km</td>
      <td class="mono text-secondary" style="text-align:center">${refuelStr}</td>
      <td class="mono text-accent" style="text-align:right">${costStr}</td>
      <td class="mono text-secondary" style="text-align:center">${Number(l.expected_liters || 0).toFixed(2)} L</td>
      <td><div style="font-size:12px;color:var(--text-secondary)">${l.notes || '-'}</div></td>
      <td>${alertBadge}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="text-center" style="padding:24px;color:var(--text-muted)">No logs recorded for this technician</td></tr>';
}

// ─── TRIP & FUEL LOGGER DIALOGS ───
function openLogTripFuel(techId) {
  const tech = DB.getTechnician(techId);
  if (!tech) return;

  App.showModal(`Log Trip & Fuel — ${tech.name}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="fg"><label class="fl">Vehicle Assigned</label><input class="fi" value="${tech.vehicle_plate}" readonly/></div>
      <div class="fg"><label class="fl">Bike Mileage (KM/L)</label><input class="fi" value="${tech.vehicle_mileage} km/L" readonly/></div>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="fg"><label class="fl">Starting Odometer (KM)</label><input class="fi" id="log-start-odo" value="${tech.current_odometer}" readonly/></div>
      <div class="fg"><label class="fl">Ending Odometer (KM)</label><input type="number" class="fi" id="log-end-odo" placeholder="e.g. ${tech.current_odometer + 40}" oninput="calcLogDistance(${tech.current_odometer})"/></div>
    </div>

    <div style="padding:10px;background:var(--bg-card2);border-radius:8px;margin-bottom:16px;text-align:center;font-weight:600;color:var(--text-secondary)">
      🏁 Calculated Distance: <span id="log-calc-distance" style="color:var(--accent)">0 km</span>
    </div>

    <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px"></div>
    <h4 style="font-size:12px;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin-bottom:12px">⛽ Refueling details (Optional)</h4>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="fg"><label class="fl">Fuel Added (Liters)</label><input type="number" class="fi" id="log-fuel-liters" placeholder="e.g. 3.5" step="0.1"/></div>
      <div class="fg"><label class="fl">Fuel Cost (NPR)</label><input type="number" class="fi" id="log-fuel-cost" placeholder="e.g. 560"/></div>
    </div>

    <div class="fg"><label class="fl">Trip Purpose / Tasks Completed</label><textarea class="fi" id="log-notes" rows="2" placeholder="e.g. Completed deployments at Damak, fixed optical fiber link cuts..."></textarea></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', onclick:'App.closeModal()' },
    { label:'✓ Record Trip & Fuel', cls:'btn-success', onclick:`confirmLogTripFuel('${techId}')` }
  ]);
}
window.openLogTripFuel = openLogTripFuel;

function calcLogDistance(start) {
  const end = parseInt(document.getElementById('log-end-odo')?.value || '0');
  const diff = isNaN(end) ? 0 : Math.max(0, end - start);
  const el = document.getElementById('log-calc-distance');
  if (el) el.textContent = `${diff} km`;
}
window.calcLogDistance = calcLogDistance;

async function confirmLogTripFuel(techId) {
  const tech = DB.getTechnician(techId);
  const start = parseInt(document.getElementById('log-start-odo')?.value || '0');
  const end = parseInt(document.getElementById('log-end-odo')?.value || '0');
  const liters = parseFloat(document.getElementById('log-fuel-liters')?.value || '0');
  const cost = parseFloat(document.getElementById('log-fuel-cost')?.value || '0');
  const notes = document.getElementById('log-notes')?.value || '';

  if (isNaN(end) || end <= start) {
    App.toast("Ending odometer reading must be strictly greater than starting odometer!", "error");
    return;
  }

  const distance = end - start;
  const expectedLiters = parseFloat((distance / tech.vehicle_mileage).toFixed(2));

  // Auto detect high discrepancy: if refueled liters is > 2x expected liters (and at least 1 Liter over expected)
  let discrepancy = false;
  if (liters > 0 && liters > (expectedLiters * 2) && (liters - expectedLiters >= 1.0)) {
    discrepancy = true;
  }

  const id = DB.nextId('FL', DB.fuel_logs);
  const today = new Date().toISOString().slice(0, 10);

  try {
    await DB.saveFuelLog({
      id,
      tech_id: techId,
      date: today,
      start_odo: start,
      end_odo: end,
      distance,
      refuel_liters: liters > 0 ? liters : null,
      refuel_cost: cost > 0 ? cost : null,
      expected_liters: expectedLiters,
      discrepancy,
      notes
    });
    App.closeModal();
    App.toast(discrepancy ? `⚠️ Log recorded with high fuel discrepancy warning!` : `Trip logged successfully! Bike odometer updated to ${end} km.`, discrepancy ? 'warning' : 'success');
    
    // Refresh active view
    if (App.currentView === 'fuel') App.navigate('fuel');
    else App.navigate('technicians');
  } catch (e) {
    App.toast(`Failed to record fuel log: ${e.message}`, 'error');
  }
}
window.confirmLogTripFuel = confirmLogTripFuel;

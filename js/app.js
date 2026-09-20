
// ═══════════════════════════════════════
// FWCPL StockOS — Application Core
// ═══════════════════════════════════════
const VIEWS = {
  dashboard:  { render: renderDashboard,  label: 'Dashboard',          onMount: null },
  inventory:  { render: renderInventory,  label: 'Live Inventory',     onMount: inventoryMounted },
  transfers:  { render: renderTransfers,  label: 'Transfer Hub',       onMount: null },
  technicians:{ render: renderTechnicians,label: 'Technician Wallet',  onMount: null },
  fuel:       { render: renderFuelTracker,label: 'Fuel Tracker',       onMount: null },
  sales:      { render: renderSales,      label: 'Direct Sales',       onMount: null },
  procurement:{ render: renderProcurement,label: 'Purchases',          onMount: null },
  requisitions:{ render: renderRequisitions, label: 'Stock Requests',   onMount: null },
  infrastructure:{ render: renderInfrastructure, label: 'Network POPs & Infra', onMount: () => { if (window.infrastructureMounted) window.infrastructureMounted(); } },
  catalog:    { render: renderCatalog,    label: 'Item Catalog',       onMount: null },
  reports:    { render: renderReports,    label: 'Reports',            onMount: null },
  locations:  { render: renderLocations,  label: 'Locations',          onMount: null },
  payouts:    { render: renderPayouts,    label: 'Payouts Tracker',    onMount: null },
  settings:   { render: renderSettings,   label: 'System Settings',    onMount: settingsMounted },
};

const App = {
  currentView: 'dashboard',

  navigate(viewName) {
    if (!VIEWS[viewName]) return;
    if (!hasPermission(viewName)) { App.toast('Access denied for your role', 'error'); return; }
    this.currentView = viewName;
    if (window.location.hash !== '#' + viewName) {
      window.location.hash = viewName;
    }
    const view = VIEWS[viewName];
    const container = document.getElementById('view');
    container.innerHTML = view.render();
    document.getElementById('breadcrumb').textContent = view.label;
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewName);
    });
    if (view.onMount) setTimeout(() => view.onMount(), 0);
    App.updateBadges();
    window.scrollTo(0,0);
  },

  showModal(title, bodyHtml, buttons=[]) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    const ftr = document.getElementById('modal-ftr');
    ftr.innerHTML = buttons.map(b =>
      `<button class="btn ${b.cls}" onclick="${b.onclick}">${b.label}</button>`
    ).join('');
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-ftr').innerHTML = '';
  },

  toast(msg, type='info') {
    const container = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    el.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='all 0.3s ease'; setTimeout(()=>el.remove(),300); }, 3500);
  },

  updateBadges() {
    const user = getCurrentUser();
    const locId = user && user.role === 'branch_storekeeper' ? user.location_id : null;
    
    // Low stock count: only for Admin users!
    let low = 0;
    if (user && (user.role === 'super_admin' || user.role === 'central_manager')) {
      low = DB.getLowStockItems(null).length;
    }
    
    const transit = DB.getPendingTransfers(locId).length;
    
    // Calculate pending requisitions for Admins
    let pendingReqs = 0;
    if (user && (user.role === 'super_admin' || user.role === 'central_manager')) {
      pendingReqs = DB.requisitions.filter(r => r.status === 'Pending').length;
    }

    const nbLow = document.getElementById('nb-low');
    const nbTrans = document.getElementById('nb-trans');
    const nbReqs = document.getElementById('nb-reqs');
    
    if (nbLow) nbLow.textContent = low > 0 ? low : '';
    if (nbTrans) nbTrans.textContent = transit > 0 ? transit : '';
    if (nbReqs) nbReqs.textContent = pendingReqs > 0 ? pendingReqs : '';
    
    const ndot = document.getElementById('ndot');
    if (ndot) ndot.classList.toggle('hidden', low === 0 && transit === 0 && pendingReqs === 0);
  }
};

// ─── INIT ───
document.addEventListener('DOMContentLoaded', async () => {
  // Load data from production DB server
  const dbLoaded = await DB.load();
  if (!dbLoaded) {
    if (window.App) App.toast('Could not load inventory database from API server!', 'error');
  } else if (DB.custom_users) {
    DB.custom_users.forEach(u => {
      USERS[u.email.toLowerCase()] = u;
    });
  }

  // Show dynamic premium success notification if reset completed
  if (window.location.search.includes('reset_success=true')) {
    window.history.replaceState({}, document.title, window.location.pathname);
    setTimeout(() => {
      if (window.App) App.toast('StockOS database reset completed! Clean slate ready.', 'success');
    }, 600);
  }

  initAuth();

  // Initialize Theme Toggler Button Icon state on page load
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeToggleIcon(currentTheme);

  // Hook up Theme Toggle Click event
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('FWCPL_THEME', newTheme);
      updateThemeToggleIcon(newTheme);
    });
  }

  // After auth restore, navigate to the view from URL hash (or default to dashboard)
  if (getCurrentUser()) {
    const hashView = window.location.hash.replace('#', '');
    const targetView = (hashView && VIEWS[hashView] && hasPermission(hashView)) ? hashView : 'dashboard';
    App.navigate(targetView);
  }

  // Handle browser back/forward navigation
  window.addEventListener('hashchange', () => {
    if (!getCurrentUser()) return;
    const hashView = window.location.hash.replace('#', '');
    if (hashView && VIEWS[hashView] && hashView !== App.currentView) {
      App.navigate(hashView);
    }
  });

  // Sidebar toggle
  document.getElementById('sb-tog').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    const main = document.getElementById('main');
    main.classList.toggle('expanded');
    const tog = document.getElementById('sb-tog');
    tog.textContent = document.getElementById('sidebar').classList.contains('collapsed') ? '›' : '‹';
  });

  // Mobile menu
  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
  });

  // Nav click
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      App.navigate(el.dataset.view);
      // close mobile sidebar
      document.getElementById('sidebar').classList.remove('mobile-open');
    });
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', App.closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) App.closeModal();
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Notif bell
  document.getElementById('notif-btn').addEventListener('click', () => {
    const user = getCurrentUser();
    const locId = user && user.role === 'branch_storekeeper' ? user.location_id : null;
    
    let low = [];
    let reqs = [];
    if (user && (user.role === 'super_admin' || user.role === 'central_manager')) {
      low = DB.getLowStockItems(null);
      reqs = DB.requisitions.filter(r => r.status === 'Pending');
    }

    const transit = DB.getPendingTransfers(locId);

    const items = [
      ...low.map(l=>`🔴 Low stock: ${l.item.name} (${l.qty} left)`),
      ...transit.map(t=>`🚚 Transfer ${t.id} is ${t.status.replace('_',' ')}`),
      ...reqs.map(r => {
        const fromName = DB.getLocation(r.from_loc)?.name || r.from_loc;
        return `📋 Pending Request: Req ${r.id} from ${fromName}`;
      })
    ];
    if (!items.length) { App.toast('No active notifications', 'info'); return; }
    App.showModal('Notifications', `<ul style="list-style:none;display:flex;flex-direction:column;gap:10px">${items.map(i=>`<li style="padding:10px;background:var(--bg-card2);border-radius:8px;font-size:13px">${i}</li>`).join('')}</ul>`,
      [{ label:'Close', cls:'btn-secondary', onclick:'App.closeModal()' }]);
  });

  // Escape key closes modal
  document.addEventListener('keydown', e => { if(e.key==='Escape') App.closeModal(); });
});



function updateThemeToggleIcon(theme) {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeBtn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}
window.updateThemeToggleIcon = updateThemeToggleIcon;

function toggleTrunkUsage(chk) {
  const custInput = document.getElementById('use-cust') || document.getElementById('log-wallet-cust');
  const custLabel = document.getElementById('cust-label');
  if (custInput && custLabel) {
    if (chk.checked) {
      custLabel.textContent = 'Internal Network / Infrastructure Details';
      custInput.placeholder = 'e.g. Pokhara-Baglung Backbone Trunk, Branch Backup';
      if (!custInput.value || custInput.value === 'TRUNK' || custInput.value.startsWith('CUST-')) {
        custInput.value = '';
      }
      custInput.disabled = false;
      custInput.style.background = '';
      custInput.style.cursor = '';
    } else {
      custLabel.textContent = 'Customer Account #';
      custInput.placeholder = 'e.g. CUST-10923';
      custInput.disabled = false;
      custInput.style.background = '';
      custInput.style.cursor = '';
    }
  }
  const coordsSec = document.getElementById('trunk-coords-container');
  if (coordsSec) {
    coordsSec.style.display = chk.checked ? 'block' : 'none';
  }
}
window.toggleTrunkUsage = toggleTrunkUsage;

function openPhotoViewer(sn, url) {
  App.showModal(`Device Photo — SN: ${sn}`, `
    <div style="text-align:center; padding:10px;">
      <img src="${url}" style="max-width:100%; max-height:400px; border-radius:8px; border:1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.3);" />
    </div>
  `, [{ label: 'Close', cls: 'btn-secondary', onclick: 'App.closeModal()' }]);
}
window.openPhotoViewer = openPhotoViewer;


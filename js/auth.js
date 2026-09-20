// ═══════════════════════════════════════
// FWCPL StockOS — Auth & RBAC
// ═══════════════════════════════════════
const USERS = {
  'admin@fwcpl.com': { name:'Super Admin', initials:'SA', role:'super_admin', role_label:'Super Admin', location_id:null, location_name:'All Locations', password:'password' },
  'central@fwcpl.com': { name:'Central Manager', initials:'CM', role:'central_manager', role_label:'Central Warehouse', location_id:'LOC001', location_name:'Kathmandu Central Hub', password:'password' },
  'pokhara@fwcpl.com': { name:'Branch Storekeeper', initials:'BS', role:'branch_storekeeper', role_label:'Pokhara Branch Storekeeper', location_id:'LOC002', location_name:'Pokhara Branch', password:'password' },
};

const PERMISSIONS = {
  super_admin: ['dashboard','inventory','transfers','technicians','fuel','procurement','requisitions','infrastructure','catalog','reports','locations','sales','payouts','settings'],
  central_manager: ['dashboard','inventory','transfers','technicians','fuel','procurement','requisitions','infrastructure','catalog','sales','locations'],
  branch_storekeeper: ['dashboard','inventory','transfers','technicians','fuel','requisitions'],
};

let currentUser = null;

function initAuth() {
  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('login-password').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  
  // Auto-restore session on page load (navigation handled by app.js)
  restoreSession();
}

function restoreSession() {
  const saved = localStorage.getItem('FWCPL_SESSION');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      if (currentUser && !currentUser.email) {
        const foundEmail = Object.keys(USERS).find(k => USERS[k].name === currentUser.name && USERS[k].role === currentUser.role);
        if (foundEmail) currentUser.email = foundEmail;
      }
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app-shell').classList.remove('hidden');
      document.body.className = `role-${currentUser.role}`;
      document.getElementById('sb-av').textContent = currentUser.initials;
      document.getElementById('sb-un').textContent = currentUser.name;
      document.getElementById('sb-ul').textContent = currentUser.location_name;
      document.getElementById('loc-chip').textContent = `📍 ${currentUser.location_name}`;
      applyRBAC();
      // Remove the flash-prevention class and make app shell fully visible
      document.documentElement.classList.remove('has-session');
      document.getElementById('app-shell').style.visibility = 'visible';
      return true;
    } catch (e) {
      console.error("Failed to restore session", e);
      localStorage.removeItem('FWCPL_SESSION');
    }
  }
  return false;
}

function logout() {
  currentUser = null;
  localStorage.removeItem('FWCPL_SESSION');
  window.location.hash = '';
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.body.className = '';
}

function doLogin() {
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const btn = document.getElementById('login-btn');
  
  const email = (emailInput?.value || '').trim().toLowerCase();
  const password = passwordInput?.value || '';
  
  if (!email || !password) {
    if (window.App) App.toast('Please enter both email and password', 'error');
    return;
  }

  btn.textContent = 'Signing in...';
  btn.disabled = true;

  setTimeout(() => {
    const user = USERS[email];
    if (!user || user.password !== password) {
      if (window.App) App.toast('Invalid email or password', 'error');
      btn.textContent = 'Sign In →';
      btn.disabled = false;
      return;
    }

    currentUser = { ...user, email };
    localStorage.setItem('FWCPL_SESSION', JSON.stringify(currentUser));
    
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.body.className = `role-${currentUser.role}`;
    document.getElementById('sb-av').textContent = currentUser.initials;
    document.getElementById('sb-un').textContent = currentUser.name;
    document.getElementById('sb-ul').textContent = currentUser.location_name;
    document.getElementById('loc-chip').textContent = `📍 ${currentUser.location_name}`;
    applyRBAC();
    
    // Clear credentials
    emailInput.value = '';
    passwordInput.value = '';
    
    btn.textContent = 'Sign In →';
    btn.disabled = false;
    
    if (window.App) App.navigate('dashboard');
  }, 600);
}

function applyRBAC() {
  const perms = PERMISSIONS[currentUser.role] || [];
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    const view = item.dataset.view;
    item.style.display = perms.includes(view) ? 'flex' : 'none';
  });
}

function getCurrentUser() { return currentUser; }
function hasPermission(view) { return PERMISSIONS[currentUser?.role]?.includes(view) || false; }

// ═══════════════════════════════════════
// LocalStorage Auth Persistence
// ═══════════════════════════════════════
if (localStorage.getItem('FWCPL_USERS')) {
  try {
    const saved = JSON.parse(localStorage.getItem('FWCPL_USERS'));
    Object.assign(USERS, saved);
  } catch (e) {
    console.error("Failed to load USERS from localStorage", e);
  }
}

function saveUsers() {
  localStorage.setItem('FWCPL_USERS', JSON.stringify(USERS));
}
window.saveUsers = saveUsers;

function openChangePasswordModal() {
  const user = getCurrentUser();
  if (!user) return;
  
  App.showModal('Change Account Password', `
    <div class="fg">
      <label class="fl">Current Password</label>
      <input type="password" class="fi" id="cp-current" placeholder="••••••••" required />
    </div>
    <div class="fg">
      <label class="fl">New Password</label>
      <input type="password" class="fi" id="cp-new" placeholder="••••••••" required />
    </div>
    <div class="fg">
      <label class="fl">Confirm New Password</label>
      <input type="password" class="fi" id="cp-confirm" placeholder="••••••••" required />
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: 'Save Password', cls: 'btn-primary', onclick: 'submitChangePassword()' }
  ]);
}
window.openChangePasswordModal = openChangePasswordModal;

async function submitChangePassword() {
  const user = getCurrentUser();
  if (!user) return;
  
  const currentPassword = document.getElementById('cp-current')?.value;
  const newPassword = document.getElementById('cp-new')?.value;
  const confirmPassword = document.getElementById('cp-confirm')?.value;
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    App.toast('All password fields are required.', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    App.toast('New password and confirmation do not match.', 'error');
    return;
  }
  
  if (newPassword.length < 4) {
    App.toast('Password must be at least 4 characters long.', 'error');
    return;
  }
  
  try {
    const res = await fetch('/api/users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        currentPassword,
        newPassword
      })
    });
    
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Failed to change password');
    
    // Reload DB data to pick up the updated password in the USERS mapping
    await DB.load();
    if (DB.custom_users) {
      DB.custom_users.forEach(u => {
        USERS[u.email.toLowerCase()] = u;
      });
    }
    
    App.toast('Password changed successfully! Please log in again.', 'success');
    App.closeModal();
    logout();
  } catch (err) {
    App.toast(err.message, 'error');
  }
}
window.submitChangePassword = submitChangePassword;

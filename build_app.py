import os
B = "/Users/rijankoirala/Stock-management-software-FWCPL"
os.makedirs(f"{B}/css", exist_ok=True)
os.makedirs(f"{B}/js/views", exist_ok=True)

files = {}

files[f"{B}/index.html"] = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>FWCPL StockOS — ISP Inventory Management</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="css/styles.css"/>
</head>
<body>
<div id="login-screen" class="login-screen">
  <div class="login-bg"><div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div></div>
  <div class="login-card">
    <div class="login-logo">
      <div class="lmark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h11M3 18h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="20" cy="18" r="3.5" fill="var(--accent)"/></svg></div>
      <div><div class="lname">FWCPL <em>StockOS</em></div><div class="ltag">ISP Inventory Platform v2.0</div></div>
    </div>
    <h1 class="login-title">Welcome Back</h1>
    <p class="login-sub">Select your role to continue</p>
    <div class="role-grid" id="role-grid">
      <button class="role-pill active" data-role="super_admin">👑 Super Admin</button>
      <button class="role-pill" data-role="central_manager">🏭 Central Manager</button>
      <button class="role-pill" data-role="branch_storekeeper">🏪 Branch Storekeeper</button>
    </div>
    <div class="fg"><label class="fl">Email Address</label><input type="email" id="login-email" class="fi" value="admin@fwcpl.com"/></div>
    <div class="fg"><label class="fl">Password</label><input type="password" id="login-password" class="fi" value="password"/></div>
    <button id="login-btn" class="btn btn-primary wf">Sign In →</button>
    <p class="login-hint">Demo credentials pre-filled — click Sign In</p>
  </div>
</div>

<div id="app-shell" class="app-shell hidden">
  <aside class="sidebar" id="sidebar">
    <div class="sb-head">
      <div class="sb-logo"><div class="lmark sm"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h11M3 18h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="20" cy="18" r="3.5" fill="var(--accent)"/></svg></div><span>FWCPL <em>StockOS</em></span></div>
      <button class="sb-tog" id="sb-tog">‹</button>
    </div>
    <div class="sb-user">
      <div class="sb-av" id="sb-av">SA</div>
      <div class="sb-ui"><div class="sb-un" id="sb-un">Super Admin</div><div class="sb-ul" id="sb-ul">All Locations</div></div>
    </div>
    <nav class="sb-nav">
      <div class="sbs">Overview</div>
      <a class="nav-item active" data-view="dashboard"><span class="ni">⊞</span><span class="nl">Dashboard</span></a>
      <a class="nav-item" data-view="inventory"><span class="ni">◈</span><span class="nl">Live Inventory</span><span class="nb" id="nb-low"></span></a>
      <a class="nav-item" data-view="transfers"><span class="ni">⇌</span><span class="nl">Transfer Hub</span><span class="nb" id="nb-trans"></span></a>
      <a class="nav-item" data-view="technicians"><span class="ni">◎</span><span class="nl">Technician Wallet</span></a>
      <div class="sbs">Operations</div>
      <a class="nav-item" data-view="procurement"><span class="ni">＋</span><span class="nl">Procurement</span></a>
      <a class="nav-item" data-view="requisitions"><span class="ni">☰</span><span class="nl">Requisitions</span></a>
      <a class="nav-item" data-view="catalog"><span class="ni">≡</span><span class="nl">Item Catalog</span></a>
      <div class="sbs admin-only">Administration</div>
      <a class="nav-item admin-only" data-view="reports"><span class="ni">◫</span><span class="nl">Reports</span></a>
      <a class="nav-item admin-only" data-view="locations"><span class="ni">◉</span><span class="nl">Locations</span></a>
    </nav>
    <div class="sb-foot"><button id="logout-btn" class="btn-logout">⎋ Sign Out</button></div>
  </aside>
  <main class="main" id="main">
    <header class="topbar">
      <div class="tb-l"><button class="menu-btn" id="menu-btn">☰</button><span class="breadcrumb" id="breadcrumb">Dashboard</span></div>
      <div class="tb-r"><span class="loc-chip" id="loc-chip">📍 All Locations</span><button class="notif-btn" id="notif-btn">🔔<span class="ndot hidden" id="ndot"></span></button></div>
    </header>
    <div class="view" id="view"></div>
  </main>
</div>

<div class="modal-overlay hidden" id="modal-overlay">
  <div class="modal-box" id="modal-box">
    <div class="modal-hdr"><h3 class="modal-title" id="modal-title"></h3><button class="modal-x" id="modal-close">✕</button></div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-ftr" id="modal-ftr"></div>
  </div>
</div>
<div id="toasts"></div>

<script src="js/data.js"></script>
<script src="js/auth.js"></script>
<script src="js/views/dashboard.js"></script>
<script src="js/views/inventory.js"></script>
<script src="js/views/transfers.js"></script>
<script src="js/views/technicians.js"></script>
<script src="js/views/procurement.js"></script>
<script src="js/views/requisitions.js"></script>
<script src="js/views/catalog.js"></script>
<script src="js/views/reports.js"></script>
<script src="js/views/locations.js"></script>
<script src="js/app.js"></script>
</body>
</html>"""

for path, content in files.items():
    with open(path, 'w') as f:
        f.write(content)
    print(f"wrote {path}")

print("PHASE1_DONE")

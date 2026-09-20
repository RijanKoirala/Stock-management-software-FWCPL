// ═══════════════════════════════════════
// View: Payouts & Accounts Payable Tracker
// ═══════════════════════════════════════

function renderPayouts() {
  // 1. Calculate Aggregated Accounting Metrics
  const totalPurchases = DB.procurements.reduce((sum, p) => sum + Number(p.total), 0);
  const totalPaid = DB.procurements.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const totalOutstanding = Math.max(0, totalPurchases - totalPaid);

  // 2. Build Outstanding Invoices List (Unpaid or Partially Paid Invoices)
  const outstandingInvoices = DB.procurements.filter(p => p.payment_status !== 'Fully_Paid');
  const outstandingRows = outstandingInvoices.map(po => {
    const balance = Math.max(0, Number(po.total) - Number(po.amount_paid));
    
    // Status Badge Styling
    let statusBadge = '';
    if (po.payment_status === 'Partially_Paid') {
      statusBadge = `<span class="badge badge-orange">Partially Paid</span>`;
    } else {
      statusBadge = `<span class="badge badge-red">Unpaid</span>`;
    }

    const itemsSummary = po.items.map(pi => {
      const it = DB.getItem(pi.item_id);
      return `<div style="margin-bottom: 2px; line-height:1.3;">
        <span style="font-weight:600; font-size:12px;">${it?.name || pi.item_id}</span>
        <span class="fs-11 text-muted">(${pi.qty} ${it?.uom || 'Pcs'} @ NPR ${pi.unit_cost.toLocaleString()})</span>
      </div>`;
    }).join('');

    return `<tr>
      <td class="mono fw-600">${po.id}</td>
      <td><div class="fw-600">${po.vendor}</div><div class="fs-11 text-muted">Invoice: ${po.invoice_no || 'N/A'}</div></td>
      <td>${itemsSummary}</td>
      <td>${po.date}</td>
      <td class="mono fw-600">NPR ${Number(po.total).toLocaleString()}</td>
      <td class="mono text-green">NPR ${Number(po.amount_paid).toLocaleString()}</td>
      <td class="mono text-red fw-700">NPR ${balance.toLocaleString()}</td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="recordPayoutModal('${po.id}')">💳 Pay Vendor</button>
      </td>
    </tr>`;
  }).join('');

  // 3. Build Historical Payout Transaction Audit Logs
  const auditRows = DB.payouts.map(pay => {
    const po = DB.procurements.find(p => p.id === pay.po_id);
    
    // Payment Method Badge
    let methodBadge = '';
    const methodClean = pay.payment_method || 'Other';
    if (methodClean === 'Bank_Transfer') {
      methodBadge = `<span class="badge badge-blue">Bank Transfer</span>`;
    } else if (methodClean === 'Cash') {
      methodBadge = `<span class="badge badge-green">Cash</span>`;
    } else if (methodClean === 'Cheque') {
      methodBadge = `<span class="badge badge-purple">Cheque</span>`;
    } else {
      methodBadge = `<span class="badge badge-orange">${methodClean}</span>`;
    }

    // Attachment View Action Button
    const viewProofBtn = pay.payout_file 
      ? `<button class="btn btn-sm btn-secondary" onclick="viewPayoutVoucher('${pay.id}', '${pay.payment_method}', '${pay.payout_file}')" style="display:flex; align-items:center; gap:4px; padding:4px 8px; font-size:11px">📄 View Proof</button>` 
      : `<span class="text-muted fs-11">—</span>`;

    return `<tr>
      <td class="mono fw-600">${pay.id}</td>
      <td class="mono fw-600">${pay.po_id}</td>
      <td><div class="fw-600">${po?.vendor || 'Unknown Vendor'}</div></td>
      <td>${pay.date}</td>
      <td>${methodBadge}</td>
      <td class="mono fw-600 text-green">NPR ${Number(pay.amount).toLocaleString()}</td>
      <td class="fs-12 text-muted" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${pay.notes || '—'}">
        ${pay.notes || '—'}
      </td>
      <td>${viewProofBtn}</td>
    </tr>`;
  }).join('');

  return `
  <div class="view-header">
    <div>
      <div class="view-title">💳 Payouts & Accounts Payable</div>
      <div class="view-subtitle">Manage accounts payable, trace outstanding invoices, log vendor payouts, and attach receipts</div>
    </div>
  </div>

  <!-- 3-Column Accounting Metrics Grid -->
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
    <div class="stat-card" style="--stat-color:var(--red)">
      <div class="stat-icon">📈</div>
      <div class="stat-val" style="font-size:18px; color: var(--red);">NPR ${totalOutstanding.toLocaleString()}</div>
      <div class="stat-label">Total Accounts Payable (Outstanding)</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--green)">
      <div class="stat-icon">💰</div>
      <div class="stat-val" style="font-size:18px; color: var(--green);">NPR ${totalPaid.toLocaleString()}</div>
      <div class="stat-label">Total Payouts Made (Paid)</div>
    </div>
    <div class="stat-card" style="--stat-color:var(--blue)">
      <div class="stat-icon">🛒</div>
      <div class="stat-val" style="font-size:18px;">NPR ${totalPurchases.toLocaleString()}</div>
      <div class="stat-label">Total Procured Purchases</div>
    </div>
  </div>

  <!-- Outstanding Invoices Table -->
  <div class="card mb-16">
    <div class="card-hdr">
      <div class="card-title" style="display:flex; align-items:center; gap:8px;">
        ⏳ Outstanding Vendor Invoices 
        <span class="badge badge-purple mono" style="font-size: 11px;">${outstandingInvoices.length} Pending</span>
      </div>
    </div>
    ${outstandingRows ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>PO ID</th>
            <th>Vendor Details</th>
            <th>Item Purchased</th>
            <th>Date</th>
            <th>Total Cost</th>
            <th>Amount Paid</th>
            <th>Remaining Balance</th>
            <th>Payment Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${outstandingRows}
        </tbody>
      </table>
    </div>
    ` : `
    <div class="empty-state" style="padding: 40px; text-align: center;">
      <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
      <p class="fw-600" style="color: var(--green); margin: 0;">All vendor purchase orders are fully settled!</p>
      <p class="fs-12 text-muted" style="margin-top: 4px;">No outstanding accounts payable found.</p>
    </div>
    `}
  </div>

  <!-- Payout Audit Log Ledger -->
  <div class="card">
    <div class="card-hdr">
      <div class="card-title">📜 Payout Transaction Audit Log</div>
    </div>
    ${auditRows ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Payout ID</th>
            <th>Purchase ID</th>
            <th>Vendor</th>
            <th>Payment Date</th>
            <th>Method</th>
            <th>Amount Disbursed</th>
            <th>Transaction Notes / Reference</th>
            <th>Receipt Proof</th>
          </tr>
        </thead>
        <tbody>
          ${auditRows}
        </tbody>
      </table>
    </div>
    ` : `
    <div class="empty-state" style="padding: 30px; text-align: center;">
      <p class="text-muted" style="margin: 0;">No payout transactions recorded in history.</p>
    </div>
    `}
  </div>
  `;
}

// 4. Record Payout Modal Controller
function recordPayoutModal(poId) {
  const po = DB.procurements.find(p => p.id === poId);
  if (!po) return;
  const itemsText = po.items.map(pi => {
    const it = DB.getItem(pi.item_id);
    return `${it?.name || pi.item_id} (${pi.qty})`;
  }).join(', ');
  const outstanding = (Number(po.total) - Number(po.amount_paid)).toFixed(2);
  
  App.showModal(`Log Vendor Payout — PO ID: ${po.id}`, `
    <div class="fg">
      <label class="fl">Purchase Order ID</label>
      <input class="fi" value="${po.id}" readonly style="background: var(--bg-card2); border-color: var(--border); cursor: not-allowed; font-family: monospace; font-weight: 600;"/>
    </div>
    <div class="fg">
      <label class="fl">Vendor Name</label>
      <input class="fi" value="${po.vendor}" readonly style="background: var(--bg-card2); border-color: var(--border); cursor: not-allowed; font-weight: 600;"/>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <div class="fg">
        <label class="fl">Purchased Equipment</label>
        <input class="fi" value="${itemsText}" readonly style="background: var(--bg-card2); border-color: var(--border); cursor: not-allowed; font-size: 12px;" title="${itemsText}"/>
      </div>
      <div class="fg">
        <label class="fl">Purchased Invoice Total</label>
        <input class="fi" value="NPR ${Number(po.total).toLocaleString()}" readonly style="background: var(--bg-card2); border-color: var(--border); cursor: not-allowed;"/>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: -6px;">
      <div class="fg">
        <label class="fl">Cumulative Amount Paid</label>
        <input class="fi text-green" value="NPR ${Number(po.amount_paid).toLocaleString()}" readonly style="background: var(--bg-card2); border-color: var(--border); cursor: not-allowed; font-weight: 600;"/>
      </div>
      <div class="fg">
        <label class="fl">Remaining Payable Balance</label>
        <input class="fi text-red" value="NPR ${parseFloat(outstanding).toLocaleString()}" readonly style="background: var(--bg-card2); border-color: var(--border); cursor: not-allowed; font-weight: 700;"/>
      </div>
    </div>
    <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0;"/>
    
    <!-- Payout voucher / Proof Attachment Section -->
    <div class="fg" style="margin-bottom:12px">
      <label class="fl">Attach Payout Proof (QR Screenshot / Cheque Image / Receipt PDF)</label>
      <div style="display:flex; align-items:center; gap:8px">
        <input type="file" id="payout-proof-file" style="display:none" onchange="handlePayoutProofUpload(this)"/>
        <button class="btn btn-secondary" onclick="document.getElementById('payout-proof-file').click()" style="display:flex; align-items:center; gap:6px; padding:8px 12px; font-size:12px">📎 Choose Voucher/Proof File</button>
        <span id="payout-proof-file-name" class="fs-11 text-muted" style="display:inline-flex; align-items:center; word-break:break-all; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px">No file attached</span>
      </div>
    </div>

    <div class="fg">
      <label class="fl">Payout Date <span class="text-red">*</span></label>
      <input type="date" class="fi" id="payout-date" value="${new Date().toISOString().slice(0, 10)}"/>
    </div>
    <div class="fg">
      <label class="fl">Payment Method <span class="text-red">*</span></label>
      <select class="fi" id="payout-method">
        <option value="Bank_Transfer">Bank Transfer / Fonepay</option>
        <option value="Cash">Cash Ledger</option>
        <option value="Cheque">Cheque Disbursement</option>
        <option value="Other">Other Mode</option>
      </select>
    </div>
    <div class="fg">
      <label class="fl">Disbursed Amount (NPR) <span class="text-red">*</span></label>
      <div style="position: relative;">
        <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-weight: 600; font-size: 13px; color: var(--text-secondary);">NPR</span>
        <input type="number" step="0.01" class="fi" id="payout-amount" placeholder="e.g. ${outstanding}" max="${outstanding}" style="padding-left: 45px; font-weight: 600; font-family: monospace; color: var(--green);"/>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
        <span class="fs-11 text-muted">Enter the amount paid to the vendor.</span>
        <a href="#" class="fs-11" onclick="event.preventDefault(); document.getElementById('payout-amount').value = '${outstanding}';" style="color: var(--accent); font-weight: 600; text-decoration: none;">Pay Full Remaining Balance</a>
      </div>
    </div>
    <div class="fg">
      <label class="fl">Transaction Notes / Voucher Reference</label>
      <textarea class="fi" id="payout-notes" placeholder="e.g. Paid from Everest Bank, Voucher Reference #98021, Cheque No. 24890..." style="height:60px; font-size: 13px;"></textarea>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', onclick: 'App.closeModal()' },
    { label: 'Verify & Confirm Payout →', cls: 'btn-primary', onclick: `submitPayout('${po.id}', ${outstanding})` }
  ]);
}

// 5. Submit Payout Action Handler
async function submitPayout(poId, outstanding) {
  const date = document.getElementById('payout-date')?.value;
  const method = document.getElementById('payout-method')?.value;
  const amountStr = document.getElementById('payout-amount')?.value;
  const notes = document.getElementById('payout-notes')?.value || '';

  if (!date || !method || !amountStr) {
    App.toast('All starred fields are required.', 'error');
    return;
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    App.toast('Please enter a valid payout amount greater than zero.', 'error');
    return;
  }

  // Prevent overpayments
  const tolerance = 0.005; // Decimal roundoff guard
  if (amount > parseFloat(outstanding) + tolerance) {
    App.toast(`Overpayment blocked! Amount exceeds the outstanding balance of NPR ${parseFloat(outstanding).toLocaleString()}.`, 'error');
    return;
  }

  // Get proof attachment data if present
  const fileInput = document.getElementById('payout-proof-file');
  const payoutFile = fileInput?.dataset.base64 || null;
  const payoutFileName = fileInput?.files?.[0]?.name || null;

  // Generate dynamic unique payout voucher ID
  const id = DB.nextId('PAY', DB.payouts);

  try {
    // Post to Server SQL Database
    await DB.savePayout({
      id,
      po_id: poId,
      amount,
      payment_method: method,
      date,
      notes: notes.trim(),
      payoutFile,
      payoutFileName
    });

    App.closeModal();
    App.toast(`Payout transaction ${id} recorded. Outstanding balance adjusted successfully!`, 'success');
    
    // Dynamic navigation reload
    App.navigate('payouts');
  } catch (err) {
    App.toast(`Failed to record payout transaction: ${err.message}`, 'error');
  }
}

// 6. Attachment Preview Helper Modal
function viewPayoutVoucher(payId, paymentMethod, fileName) {
  App.showModal(`Payout Digital Proof — ${payId}`, `
    <div style="text-align:center; padding:16px;">
      <div style="font-size:48px; margin-bottom:12px">🧾</div>
      <h4 style="font-size:15px; margin-bottom:4px; font-weight:700; color:var(--text)">Vendor Payout Receipt Voucher</h4>
      <p class="fs-12 text-secondary mb-16">Payment Method: <strong style="color:var(--accent)">${paymentMethod.replace(/_/g, ' ')}</strong></p>
      
      <div style="border:1.5px dashed var(--border-hover); border-radius:10px; padding:16px; background:var(--bg-card2); display:flex; align-items:center; gap:12px; margin-bottom:16px; text-align:left">
        <div style="font-size:32px">📎</div>
        <div style="flex:1; overflow:hidden">
          <strong style="font-size:13px; color:var(--text); word-break:break-all; text-overflow:ellipsis; display:block">${fileName}</strong>
          <p class="fs-11 text-secondary mt-4">Verified digital attachment copy</p>
        </div>
      </div>
      
      <button class="btn btn-primary" onclick="window.open('/uploads/' + '${fileName}', '_blank')" style="width:100%">📥 Download / View Original Proof</button>
    </div>
  `, [{ label: 'Close', cls: 'btn-secondary', onclick: 'App.closeModal()' }]);
}

// 7. Base64 Upload File Reader callback
function handlePayoutProofUpload(input) {
  const nameSpan = document.getElementById('payout-proof-file-name');
  if (input.files && input.files[0] && nameSpan) {
    nameSpan.textContent = input.files[0].name;
    nameSpan.style.color = 'var(--green)';
    
    const reader = new FileReader();
    reader.onload = function(e) {
      input.dataset.base64 = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// Bind view functions globally for onclick templates
window.renderPayouts = renderPayouts;
window.recordPayoutModal = recordPayoutModal;
window.submitPayout = submitPayout;
window.viewPayoutVoucher = viewPayoutVoucher;
window.handlePayoutProofUpload = handlePayoutProofUpload;

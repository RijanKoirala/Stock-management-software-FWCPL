// ═══════════════════════════════════════
// FWCPL StockOS — Enterprise HTTP Data Client
// ═══════════════════════════════════════
const DB = {
  locations: [],
  items: [],
  serialized: [],
  consumable_stock: [],
  transfers: [],
  requisitions: [],
  technicians: [],
  consumable_logs: [],
  procurements: [],
  payouts: [],
  fuel_logs: [],
  tech_consumable_stock: [],

  // ─── HTTP LOAD & SYNC LAYER ───
  async load() {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Bootstrap request failed');
      const data = await res.json();
      
      this.locations = data.locations || [];
      this.items = data.items || [];
      this.serialized = data.serialized || [];
      this.consumable_stock = data.consumable_stock || [];
      this.transfers = data.transfers || [];
      this.requisitions = data.requisitions || [];
      this.technicians = data.technicians || [];
      this.consumable_logs = data.consumable_logs || [];
      this.procurements = data.procurements || [];
      this.payouts = data.payouts || [];
      this.fuel_logs = data.fuel_logs || [];
      this.tech_consumable_stock = data.tech_consumable_stock || [];
      this.custom_users = data.custom_users || [];
      return true;
    } catch (e) {
      console.error('❌ Failed to load production database from Express server:', e);
      return false;
    }
  },

  // ─── SYNCHRONOUS QUERY LOOKUPS (VIEW COMPATIBILITY) ───
  getItem(id) { return this.items.find(i => i.id === id); },
  getLocation(id) { return this.locations.find(l => l.id === id); },
  getTechnician(id) { return this.technicians.find(t => t.id === id); },
  getSerialsByLocation(locType, locId) { return this.serialized.filter(s => s.loc_type === locType && s.loc_id === locId); },
  getSerialsByItem(itemId) { return this.serialized.filter(s => s.item_id === itemId); },
  getTechStock(techId) { return this.serialized.filter(s => s.loc_type === 'With_Technician' && s.loc_id === techId); },
  getConsumableStock(locId, itemId) { return this.consumable_stock.filter(c => c.loc_id === locId && (itemId ? c.item_id === itemId : true)); },
  getTechConsumables(techId) { return this.tech_consumable_stock.filter(tc => tc.tech_id === techId); },
  
  getLowStockItems(locationId) {
    const low = [];
    this.items.forEach(item => {
      if (item.category === 'Asset') {
        const avail = this.serialized.filter(s => s.item_id === item.id && s.status === 'Available' && (!locationId || (s.branch_id || (s.loc_type === 'Branch' ? s.loc_id : 'LOC001')) === locationId)).length;
        if (avail < item.reorder) low.push({ item, qty: avail, reorder: item.reorder });
      } else {
        const total = this.consumable_stock.filter(c => c.item_id === item.id && (!locationId || c.loc_id === locationId)).reduce((s,c) => s + c.qty, 0);
        if (total < item.reorder) low.push({ item, qty: total, reorder: item.reorder });
      }
    });
    return low;
  },

  getTotalValuation(locationId) {
    let v = 0;
    this.serialized.forEach(s => { 
      if (s.status === 'Returned_To_Vendor' || s.status === 'Sold' || s.status === 'Scrapped') return;
      if (locationId && (s.branch_id || (s.loc_type === 'Branch' ? s.loc_id : 'LOC001')) !== locationId) return;
      const it = this.getItem(s.item_id); 
      v += s.purchase_cost != null ? Number(s.purchase_cost) : Number(it?.unit_cost || 0); 
    });
    this.consumable_stock.forEach(c => {
      if (locationId && c.loc_id !== locationId) return;
      v += Number(c.qty) * Number(c.unit_cost);
    });
    return v;
  },

  getPendingTransfers(locationId) {
    return this.transfers.filter(t => 
      (t.status === 'In_Transit' || t.status === 'Pending') &&
      (!locationId || t.from_loc === locationId || t.to_loc === locationId)
    );
  },
  nextId(prefix, arr, field='id') { const nums = arr.map(x => { const val = x && x[field] ? String(x[field]) : ''; return parseInt(val.replace(prefix,'')||0); }).filter(n=>!isNaN(n)); const max = nums.length ? Math.max(...nums) : 0; return `${prefix}${String(max+1).padStart(3,'0')}`; },

  // ─── API MUTATIONS (POST/PUT WRAPPERS) ───
  async post(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async put(url, data) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // ─── DATABASE OPERATIONS ───
  async saveLocation(loc) {
    await this.post('/api/locations', loc);
    await this.load();
  },

  async saveItem(item) {
    await this.post('/api/items', item);
    await this.load();
  },

  async saveTechnician(tech) {
    await this.post('/api/technicians', tech);
    await this.load();
  },

  async deleteTechnician(id) {
    const res = await fetch(`/api/technicians/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    await this.load();
  },

  async saveProcurement(po) {
    await this.post('/api/procurements', po);
    await this.load();
  },

  async saveRequisition(req) {
    await this.post('/api/requisitions', req);
    await this.load();
  },

  async updateRequisitionStatus(id, status) {
    await this.put(`/api/requisitions/${id}/status`, { status });
    await this.load();
  },

  async saveTransfer(trf) {
    await this.post('/api/transfers', trf);
    await this.load();
  },

  async startTransferDispatch(id, dispatchedBy) {
    await this.put(`/api/transfers/${id}/dispatch`, { dispatched_by: dispatchedBy });
    await this.load();
  },

  async completeTransferAcknowledge(id, acknowledgedBy, notes, condition) {
    const payload = {
      acknowledged_by: acknowledgedBy,
      notes: notes ? `${notes} (Condition: ${condition})` : `Condition: ${condition}`
    };
    await this.put(`/api/transfers/${id}/acknowledge`, payload);
    await this.load();
  },

  async logConsumableUsage(log) {
    await this.post('/api/consumable-logs', log);
    await this.load();
  },

  async issueAssetsToTech(sns, techId) {
    await this.post('/api/serialized/issue', { sns, techId });
    await this.load();
  },

  async deployAssetToCustomer(sn, customerAcc, techId) {
    await this.post('/api/serialized/deploy', { sn, customerAcc, techId });
    await this.load();
  },

  async returnAssetFromTech(sn, branchId) {
    await this.post('/api/serialized/return', { sn, branchId });
    await this.load();
  },

  async markAssetAsFaulty(sn) {
    await this.post(`/api/serialized/${sn}/faulty`);
    await this.load();
  },

  async deployInfrastructureAsset(payload) {
    await this.post('/api/serialized/deploy-infra', payload);
    await this.load();
  },

  async retireInfrastructureAsset(payload) {
    await this.post('/api/serialized/retire-infra', payload);
    await this.load();
  },

  async directInfrastructureIntake(payload) {
    await this.post('/api/serialized/direct-infra-intake', payload);
    await this.load();
  },
  async scrapAsset(sn, reason, notes) {
    await this.post('/api/serialized/scrap', { sn, reason, notes });
    await this.load();
  },

  async savePayout(payout) {
    await this.post('/api/payouts', payout);
    await this.load();
  },

  async saveFuelLog(log) {
    await this.post('/api/fuel-logs', log);
    await this.load();
  },

  async swapDamagedAsset(faultySn, replacementSn, customerAcc, techId, branchId) {
    await this.post('/api/serialized/swap-damaged', { faultySn, replacementSn, customerAcc, techId, branchId });
    await this.load();
  },

  async recoverAssetFromCustomer(sn, branchId) {
    await this.post('/api/serialized/recover-from-customer', { sn, branchId });
    await this.load();
  },
  async returnAssetToVendor(sn, poIdOrInvoiceNo, notes) {
    const payload = { sn, notes };
    if (poIdOrInvoiceNo && poIdOrInvoiceNo.startsWith('PO')) {
      payload.poId = poIdOrInvoiceNo;
    } else {
      payload.invoiceNo = poIdOrInvoiceNo;
    }
    await this.post('/api/serialized/return-to-vendor', payload);
    await this.load();
  },

  async issueConsumablesToTech(techId, items) {
    await this.post('/api/technicians/issue-consumables', { techId, items });
    await this.load();
  },

  async logTechConsumableUsage(techId, itemId, qty, customerAcc, notes) {
    await this.post('/api/technicians/log-consumable-usage', { techId, itemId, qty, customerAcc, notes });
    await this.load();
  },

  async returnConsumablesToBranch(techId, itemId, qty) {
    await this.post('/api/technicians/return-consumables', { techId, itemId, qty });
    await this.load();
  },

  async saveUser(user) {
    await this.post('/api/users', user);
    await this.load();
  },

  async bulkImportSerials(payload) {
    const res = await this.post('/api/serialized/bulk-import', payload);
    await this.load();
    return res;
  },

  async emailDatabaseBackup() {
    return await this.post('/api/backup/email', {});
  }
};

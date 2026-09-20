const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { sendDatabaseBackupEmail } = require('./backup_email');

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support base64 or attachment strings

// ══════════════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION POOL SETUP
// ══════════════════════════════════════════════════════════════════════════════════
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'stockos',
});

// Verify connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failure:', err.stack);
  } else {
    console.log('✅ Connected to PostgreSQL database successfully!');
    
    // Self-healing schema migration
    client.query(`
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS manager_signature TEXT;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS latitude VARCHAR(50);
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS longitude VARCHAR(50);
      ALTER TABLE locations ALTER COLUMN manager DROP NOT NULL;

      ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_type_check;
      ALTER TABLE locations ADD CONSTRAINT locations_type_check CHECK (type IN ('Central', 'Branch', 'POP'));

      ALTER TABLE items ADD COLUMN IF NOT EXISTS is_infrastructure BOOLEAN DEFAULT FALSE;

      ALTER TABLE serialized_assets 
      ADD COLUMN IF NOT EXISTS deployed_tech_id VARCHAR(20) REFERENCES technicians(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS deployed_date DATE,
      ADD COLUMN IF NOT EXISTS infra_ip VARCHAR(50),
      ADD COLUMN IF NOT EXISTS infra_rack VARCHAR(100),
      ADD COLUMN IF NOT EXISTS infra_role VARCHAR(100),
      ADD COLUMN IF NOT EXISTS infra_deployment_date DATE;

      ALTER TABLE serialized_assets DROP CONSTRAINT IF EXISTS serialized_assets_loc_type_check;
      ALTER TABLE serialized_assets ADD CONSTRAINT serialized_assets_loc_type_check CHECK (loc_type IN ('Central_Warehouse', 'Branch', 'With_Technician', 'Installed_At_Customer', 'Faulty', 'In_Transit', 'External_Sale', 'Returned_To_Vendor', 'Infrastructure', 'Scrapped'));

      ALTER TABLE serialized_assets DROP CONSTRAINT IF EXISTS serialized_assets_status_check;
      ALTER TABLE serialized_assets ADD CONSTRAINT serialized_assets_status_check CHECK (status IN ('Available', 'In_Transit', 'Assigned', 'Deployed', 'Faulty', 'Sold', 'Returned_To_Vendor', 'Deployed_Infrastructure', 'Scrapped'));

      ALTER TABLE serialized_assets 
      ADD COLUMN IF NOT EXISTS return_vendor_date DATE,
      ADD COLUMN IF NOT EXISTS return_vendor_notes TEXT,
      ADD COLUMN IF NOT EXISTS scrap_date DATE,
      ADD COLUMN IF NOT EXISTS scrap_reason TEXT;

      -- Unique PO link migration
      ALTER TABLE serialized_assets ADD COLUMN IF NOT EXISTS po_id VARCHAR(20);
      ALTER TABLE serialized_assets ADD COLUMN IF NOT EXISTS notes TEXT;
      
      ALTER TABLE transfers ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(100);
      ALTER TABLE transfers ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(100);
      
      ALTER TABLE serialized_assets DROP CONSTRAINT IF EXISTS fk_serialized_assets_po;
      ALTER TABLE serialized_assets ADD CONSTRAINT fk_serialized_assets_po FOREIGN KEY (po_id) REFERENCES procurements(id) ON DELETE SET NULL;

      DO $$
      DECLARE
          po_rec RECORD;
          item_rec RECORD;
      BEGIN
          FOR po_rec IN SELECT id, invoice_no FROM procurements ORDER BY date ASC, id ASC LOOP
              FOR item_rec IN SELECT item_id, qty FROM procurement_items WHERE po_id = po_rec.id LOOP
                  IF po_rec.invoice_no <> 'N/A' THEN
                      UPDATE serialized_assets 
                      SET po_id = po_rec.id 
                      WHERE sn IN (
                          SELECT sn FROM serialized_assets 
                          WHERE item_id = item_rec.item_id 
                            AND invoice_no = po_rec.invoice_no 
                            AND po_id IS NULL 
                          ORDER BY sn ASC 
                          LIMIT item_rec.qty
                      );
                  ELSE
                      UPDATE serialized_assets 
                      SET po_id = po_rec.id 
                      WHERE sn IN (
                          SELECT sn FROM serialized_assets 
                          WHERE item_id = item_rec.item_id 
                            AND po_id IS NULL 
                          ORDER BY sn ASC 
                          LIMIT item_rec.qty
                      );
                  END IF;
              END LOOP;
          END LOOP;
      END $$;

      ALTER TABLE procurements 
      ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'Unpaid';

      ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS batch VARCHAR(100);

      CREATE TABLE IF NOT EXISTS payouts (
          id VARCHAR(20) PRIMARY KEY,
          po_id VARCHAR(20) REFERENCES procurements(id) ON DELETE CASCADE,
          amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
          payment_method VARCHAR(50) NOT NULL,
          date DATE NOT NULL,
          notes TEXT,
          payout_file VARCHAR(255)
      );

      ALTER TABLE payouts 
      ADD COLUMN IF NOT EXISTS payout_file VARCHAR(255);

      ALTER TABLE serialized_assets 
      ADD COLUMN IF NOT EXISTS device_photo VARCHAR(255);

      CREATE INDEX IF NOT EXISTS idx_payouts_po ON payouts(po_id);

      ALTER TABLE consumable_logs ADD COLUMN IF NOT EXISTS latitude VARCHAR(50);
      ALTER TABLE consumable_logs ADD COLUMN IF NOT EXISTS longitude VARCHAR(50);

      CREATE TABLE IF NOT EXISTS branch_users (
          email VARCHAR(100) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          initials VARCHAR(10) NOT NULL,
          role VARCHAR(50) NOT NULL,
          role_label VARCHAR(100) NOT NULL,
          location_id VARCHAR(20) REFERENCES locations(id) ON DELETE CASCADE,
          location_name VARCHAR(100) NOT NULL,
          password VARCHAR(100) NOT NULL
      );

      ALTER TABLE technicians 
      ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(50),
      ADD COLUMN IF NOT EXISTS vehicle_mileage DECIMAL(6, 2) DEFAULT 40.00,
      ADD COLUMN IF NOT EXISTS current_odometer INTEGER DEFAULT 0;

      CREATE TABLE IF NOT EXISTS fuel_logs (
          id VARCHAR(20) PRIMARY KEY,
          tech_id VARCHAR(20) REFERENCES technicians(id) ON DELETE CASCADE,
          date DATE NOT NULL,
          start_odo INTEGER NOT NULL,
          end_odo INTEGER NOT NULL,
          distance INTEGER NOT NULL,
          refuel_liters DECIMAL(6, 2),
          refuel_cost DECIMAL(12, 2),
          expected_liters DECIMAL(6, 2),
          discrepancy BOOLEAN DEFAULT FALSE,
          notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_fuel_logs_tech ON fuel_logs(tech_id);

      CREATE TABLE IF NOT EXISTS tech_consumable_stock (
          id VARCHAR(20) PRIMARY KEY,
          tech_id VARCHAR(20) REFERENCES technicians(id) ON DELETE CASCADE,
          item_id VARCHAR(20) REFERENCES items(id) ON DELETE CASCADE,
          qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
          unit_cost DECIMAL(12, 2) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tech_consumables ON tech_consumable_stock(tech_id);

      -- Migration helper for multi-item procurements
      DO $$
      BEGIN
          IF EXISTS (
              SELECT 1 
              FROM information_schema.columns 
              WHERE table_name='procurements' AND column_name='item_id'
          ) THEN
              -- Create procurement_items details table
              CREATE TABLE IF NOT EXISTS procurement_items (
                  id SERIAL PRIMARY KEY,
                  po_id VARCHAR(20) REFERENCES procurements(id) ON DELETE CASCADE,
                  item_id VARCHAR(20) REFERENCES items(id) ON DELETE CASCADE,
                  qty INTEGER NOT NULL CHECK (qty > 0),
                  unit_cost DECIMAL(12, 2) NOT NULL,
                  total DECIMAL(12, 2) NOT NULL,
                  serials_uploaded BOOLEAN DEFAULT FALSE,
                  warranty_months INTEGER DEFAULT 12,
                  batch VARCHAR(100)
              );
              
              -- Migrate existing data
              INSERT INTO procurement_items (po_id, item_id, qty, unit_cost, total, serials_uploaded)
              SELECT id, item_id, qty, unit_cost, total, serials_uploaded FROM procurements;
              
              -- Clean up old single-item columns on procurements
              ALTER TABLE procurements DROP COLUMN item_id;
              ALTER TABLE procurements DROP COLUMN qty;
              ALTER TABLE procurements DROP COLUMN unit_cost;
              ALTER TABLE procurements DROP COLUMN serials_uploaded;
          END IF;
      END $$;

      -- Ensure procurement_items is created on fresh installations
      CREATE TABLE IF NOT EXISTS procurement_items (
          id SERIAL PRIMARY KEY,
          po_id VARCHAR(20) REFERENCES procurements(id) ON DELETE CASCADE,
          item_id VARCHAR(20) REFERENCES items(id) ON DELETE CASCADE,
          qty INTEGER NOT NULL CHECK (qty > 0),
          unit_cost DECIMAL(12, 2) NOT NULL,
          total DECIMAL(12, 2) NOT NULL,
          serials_uploaded BOOLEAN DEFAULT FALSE,
          warranty_months INTEGER DEFAULT 12,
          batch VARCHAR(100)
      );

      -- Ensure system_settings is created and seeded
      CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL
      );

      INSERT INTO system_settings (key, value) VALUES
      ('smtp_host', 'mail.fiberworld.net.np'),
      ('smtp_port', '465'),
      ('smtp_user', 'rijan.koirala@fiberworld.net.np'),
      ('smtp_pass', 'Rijan@123'),
      ('notification_emails', 'koiralarijan8@gmail.com')
      ON CONFLICT (key) DO NOTHING;
    `, (mErr) => {
      if (mErr) {
        console.error('❌ Schema migration failed:', mErr);
      } else {
        console.log('✅ Schema migration completed (deployed tracking and payouts tables active).');
      }
      release();
    });
  }
});

// Helper: Run Query
const query = (text, params) => pool.query(text, params);

// ══════════════════════════════════════════════════════════════════════════════════
// REST API ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════════

// 1. Quick Server Status
app.get('/api/status', (req, res) => {
  res.json({ status: 'running', timestamp: new Date() });
});



// 2. Bootstrap App Data (Optimized single-request fetch for client startup)
app.get('/api/bootstrap', async (req, res) => {
  try {
    const locationsRes = await query('SELECT * FROM locations ORDER BY id ASC');
    const itemsRes = await query('SELECT * FROM items ORDER BY id ASC');
    const techRes = await query('SELECT * FROM technicians ORDER BY id ASC');
    const serialRes = await query('SELECT * FROM serialized_assets ORDER BY sn ASC');
    const consumableRes = await query('SELECT * FROM consumable_stock ORDER BY id ASC');
    const logsRes = await query('SELECT * FROM consumable_logs ORDER BY date DESC, id DESC');
    const poRes = await query('SELECT * FROM procurements ORDER BY date DESC, id DESC');
    const poItemsRes = await query('SELECT * FROM procurement_items ORDER BY id ASC');
    const payoutsRes = await query('SELECT * FROM payouts ORDER BY date DESC, id DESC');

    const fuelLogsRes = await query('SELECT * FROM fuel_logs ORDER BY date DESC, id DESC');
    const techConsumablesRes = await query('SELECT * FROM tech_consumable_stock ORDER BY id ASC');
    const usersRes = await query('SELECT * FROM branch_users ORDER BY email ASC');

    // Fetch and structure transfers with their items
    const transfersRes = await query('SELECT * FROM transfers ORDER BY created DESC, id DESC');
    const transferItemsRes = await query('SELECT * FROM transfer_items');
    const transfers = transfersRes.rows.map(t => {
      const items = transferItemsRes.rows
        .filter(ti => ti.transfer_id === t.id)
        .map(ti => ({
          item_id: ti.item_id,
          serials: ti.serials || [],
          qty: ti.qty
        }));
      return { ...t, items };
    });

    // Fetch and structure requisitions with their items
    const reqsRes = await query('SELECT * FROM requisitions ORDER BY created DESC, id DESC');
    const reqItemsRes = await query('SELECT * FROM requisition_items');
    const requisitions = reqsRes.rows.map(r => {
      const items = reqItemsRes.rows
        .filter(ri => ri.requisition_id === r.id)
        .map(ri => ({
          item_id: ri.item_id,
          qty: ri.qty
        }));
      return { ...r, items };
    });

    res.json({
      locations: locationsRes.rows,
      custom_users: usersRes.rows,
      items: itemsRes.rows,
      technicians: techRes.rows.map(t => ({
        ...t,
        vehicle_mileage: t.vehicle_mileage ? parseFloat(t.vehicle_mileage) : 40.00,
        current_odometer: t.current_odometer ? parseInt(t.current_odometer) : 0
      })),
      serialized: serialRes.rows.map(s => ({
        ...s,
        branch_id: s.branch_id || (s.loc_type === 'Branch' ? s.loc_id : 'LOC001'),
        sale_price: s.sale_price ? parseFloat(s.sale_price) : null,
        sale_date: s.sale_date ? s.sale_date.toISOString().slice(0, 10) : null,
        deployed_date: s.deployed_date ? s.deployed_date.toISOString().slice(0, 10) : null,
        return_vendor_date: s.return_vendor_date ? s.return_vendor_date.toISOString().slice(0, 10) : null,
        infra_deployment_date: s.infra_deployment_date ? s.infra_deployment_date.toISOString().slice(0, 10) : null,
        scrap_date: s.scrap_date ? s.scrap_date.toISOString().slice(0, 10) : null
      })),
      consumable_stock: consumableRes.rows,
      consumable_logs: logsRes.rows,
      tech_consumable_stock: techConsumablesRes.rows.map(tc => ({
        ...tc,
        qty: parseInt(tc.qty),
        unit_cost: parseFloat(tc.unit_cost)
      })),
      procurements: poRes.rows.map(p => {
        const items = poItemsRes.rows
          .filter(pi => pi.po_id === p.id)
          .map(pi => ({
            item_id: pi.item_id,
            qty: parseInt(pi.qty),
            unit_cost: parseFloat(pi.unit_cost),
            total: parseFloat(pi.total),
            serials_uploaded: pi.serials_uploaded,
            warranty_months: pi.warranty_months,
            batch: pi.batch || null
          }));
        return {
          ...p,
          total: parseFloat(p.total),
          amount_paid: parseFloat(p.amount_paid || 0),
          payment_status: p.payment_status || 'Unpaid',
          date: p.date.toISOString().slice(0, 10),
          items
        };
      }),
      payouts: payoutsRes.rows.map(pay => ({
        ...pay,
        amount: parseFloat(pay.amount),
        date: pay.date.toISOString().slice(0, 10),
        payout_file: pay.payout_file || null
      })),
      transfers: transfers.map(t => ({
        ...t,
        created: t.created.toISOString().slice(0,10)
      })),
      requisitions: requisitions.map(r => ({
        ...r,
        created: r.created.toISOString().slice(0,10)
      })),
      fuel_logs: fuelLogsRes.rows.map(fl => ({
        ...fl,
        date: fl.date.toISOString().slice(0, 10),
        refuel_liters: fl.refuel_liters ? parseFloat(fl.refuel_liters) : null,
        refuel_cost: fl.refuel_cost ? parseFloat(fl.refuel_cost) : null,
        expected_liters: fl.expected_liters ? parseFloat(fl.expected_liters) : null
      }))
    });
  } catch (err) {
    console.error('Bootstrap error:', err);
    res.status(500).json({ error: 'Failed to bootstrap application data' });
  }
});

// 3. Locations CRUD
app.get('/api/locations', async (req, res) => {
  try {
    const result = await query('SELECT * FROM locations ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', async (req, res) => {
  const { id, name, type, city, manager, manager_signature, latitude, longitude } = req.body;
  try {
    const result = await query(
      'INSERT INTO locations (id, name, type, city, manager, manager_signature, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, name, type, city, manager, manager_signature || null, latitude || null, longitude || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { email, name, initials, role, role_label, location_id, location_name, password } = req.body;
  try {
    await query(
      `INSERT INTO branch_users (email, name, initials, role, role_label, location_id, location_name, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         initials = EXCLUDED.initials,
         role = EXCLUDED.role,
         role_label = EXCLUDED.role_label,
         location_id = EXCLUDED.location_id,
         location_name = EXCLUDED.location_name,
         password = EXCLUDED.password`,
      [email.toLowerCase(), name, initials, role, role_label, location_id, location_name, password]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/location/:locationId', async (req, res) => {
  const { locationId } = req.params;
  const { email, password, name, initials, location_name } = req.body;
  const role_label = `${location_name} Storekeeper`;
  try {
    const existing = await query('SELECT email FROM branch_users WHERE location_id = $1', [locationId]);
    if (existing.rows.length === 0) {
      // Create user if missing
      await query(
        `INSERT INTO branch_users (email, name, initials, role, role_label, location_id, location_name, password)
         VALUES ($1, $2, $3, 'branch_storekeeper', $4, $5, $6, $7)`,
        [email.toLowerCase(), name, initials, role_label, locationId, location_name, password || 'password']
      );
    } else {
      if (password) {
        await query(
          `UPDATE branch_users SET email = $1, password = $2, name = $3, initials = $4, location_name = $5, role_label = $6 WHERE location_id = $7`,
          [email.toLowerCase(), password, name, initials, location_name, role_label, locationId]
        );
      } else {
        await query(
          `UPDATE branch_users SET email = $1, name = $2, initials = $3, location_name = $4, role_label = $5 WHERE location_id = $6`,
          [email.toLowerCase(), name, initials, location_name, role_label, locationId]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locations/:id', async (req, res) => {
  const { id } = req.params;
  const { name, city, manager, manager_signature, latitude, longitude } = req.body;
  try {
    await query(
      'UPDATE locations SET name = $1, city = $2, manager = $3, manager_signature = $4, latitude = $5, longitude = $6 WHERE id = $7',
      [name, city, manager, manager_signature || null, latitude || null, longitude || null, id]
    );
    res.json({ message: 'Location updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3b. System Settings API
app.get('/api/settings', async (req, res) => {
  try {
    const result = await query('SELECT * FROM system_settings');
    const settings = {};
    result.rows.forEach(row => {
      if (row.key === 'smtp_pass') {
        settings[row.key] = '********';
      } else {
        settings[row.key] = row.value;
      }
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, notification_emails } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const settingsToUpdate = {
      smtp_host,
      smtp_port,
      smtp_user,
      notification_emails
    };

    if (smtp_pass && smtp_pass !== '********') {
      settingsToUpdate.smtp_pass = smtp_pass;
    }

    for (const [key, value] of Object.entries(settingsToUpdate)) {
      if (value !== undefined) {
        await client.query(
          'INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [key, String(value).trim()]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'System settings saved successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 4. Catalog Items CRUD
app.get('/api/items', async (req, res) => {
  try {
    const result = await query('SELECT * FROM items ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  const { id, name, category, uom, reorder, unit_cost, is_infrastructure } = req.body;
  try {
    const result = await query(
      'INSERT INTO items (id, name, category, uom, reorder, unit_cost, is_infrastructure) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [id, name, category, uom, reorder, unit_cost, is_infrastructure || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  const { name, reorder, unit_cost, is_infrastructure } = req.body;
  try {
    await query('UPDATE items SET name = $1, reorder = $2, unit_cost = $3, is_infrastructure = $4 WHERE id = $5', [name, reorder, unit_cost, is_infrastructure || false, id]);
    res.json({ message: 'Item updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM items WHERE id = $1', [id]);
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Technicians CRUD
app.get('/api/technicians', async (req, res) => {
  try {
    const result = await query('SELECT * FROM technicians ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/technicians', async (req, res) => {
  const { id, name, branch_id, phone, status, vehicle_plate, vehicle_mileage, current_odometer } = req.body;
  try {
    const result = await query(
      'INSERT INTO technicians (id, name, branch_id, phone, status, vehicle_plate, vehicle_mileage, current_odometer) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, name, branch_id, phone, status, vehicle_plate || '', vehicle_mileage || 40.00, current_odometer || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/technicians/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Check if technician has active assets
    const assetsCheck = await query("SELECT COUNT(*) FROM serialized_assets WHERE loc_type = 'With_Technician' AND loc_id = $1", [id]);
    if (parseInt(assetsCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: "Cannot delete technician with active assets assigned to their wallet." });
    }
    
    await query('DELETE FROM technicians WHERE id = $1', [id]);
    res.json({ message: 'Technician deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Issue Consumables to Technician
app.post('/api/technicians/issue-consumables', async (req, res) => {
  const { techId, items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get technician's branch
    const techRes = await client.query('SELECT branch_id FROM technicians WHERE id = $1', [techId]);
    if (techRes.rows.length === 0) throw new Error('Technician not found');
    const branchId = techRes.rows[0].branch_id;

    for (const item of items) {
      if (!item.qty || item.qty <= 0) continue;

      // 2. Lock and verify stock in branch warehouse
      const csRes = await client.query(
        'SELECT id, qty, unit_cost FROM consumable_stock WHERE item_id = $1 AND loc_id = $2 FOR UPDATE',
        [item.itemId, branchId]
      );
      if (csRes.rows.length === 0 || csRes.rows[0].qty < item.qty) {
        throw new Error(`Insufficient consumable stock for item ${item.itemId} at branch ${branchId}`);
      }
      const cs = csRes.rows[0];

      // 3. Decrement branch stock
      await client.query(
        'UPDATE consumable_stock SET qty = qty - $1 WHERE id = $2',
        [item.qty, cs.id]
      );

      // 4. Increment/Insert into technician wallet consumable stock
      const tcRes = await client.query(
        'SELECT id, qty FROM tech_consumable_stock WHERE tech_id = $1 AND item_id = $2 FOR UPDATE',
        [techId, item.itemId]
      );
      if (tcRes.rows.length > 0) {
        await client.query(
          'UPDATE tech_consumable_stock SET qty = qty + $1 WHERE id = $2',
          [item.qty, tcRes.rows[0].id]
        );
      } else {
        const tcId = 'TCS' + String(Date.now()).slice(-8) + Math.floor(Math.random() * 10);
        await client.query(
          'INSERT INTO tech_consumable_stock (id, tech_id, item_id, qty, unit_cost) VALUES ($1, $2, $3, $4, $5)',
          [tcId, techId, item.itemId, item.qty, cs.unit_cost]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Consumables successfully issued to technician wallet' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to issue consumables:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Log Consumable Usage from Technician Wallet
app.post('/api/technicians/log-consumable-usage', async (req, res) => {
  const { techId, itemId, qty, customerAcc, notes, latitude, longitude } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify tech has enough stock in wallet
    const tcRes = await client.query(
      'SELECT id, qty FROM tech_consumable_stock WHERE tech_id = $1 AND item_id = $2 FOR UPDATE',
      [techId, itemId]
    );
    if (tcRes.rows.length === 0 || tcRes.rows[0].qty < qty) {
      throw new Error(`Insufficient quantity of item ${itemId} in technician wallet`);
    }
    const tc = tcRes.rows[0];

    // 2. Decrement tech wallet stock
    const remaining = tc.qty - qty;
    if (remaining === 0) {
      await client.query('DELETE FROM tech_consumable_stock WHERE id = $1', [tc.id]);
    } else {
      await client.query('UPDATE tech_consumable_stock SET qty = $1 WHERE id = $2', [remaining, tc.id]);
    }

    // 3. Look up technician branch for log audit record
    const techRes = await client.query('SELECT branch_id FROM technicians WHERE id = $1', [techId]);
    const branchId = techRes.rows[0]?.branch_id || 'LOC001';

    // 4. Insert log
    const logId = 'LOG' + String(Date.now()).slice(-8) + Math.floor(Math.random() * 10);
    await client.query(
      'INSERT INTO consumable_logs (id, item_id, loc_id, qty_used, customer_acc, date, tech_id, notes, latitude, longitude) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8, $9)',
      [logId, itemId, branchId, qty, customerAcc || null, techId, notes || '', latitude || null, longitude || null]
    );

    await client.query('COMMIT');
    res.json({ message: `Successfully logged usage of ${qty} units from technician wallet` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to log tech consumable usage:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Return Consumables from Technician Wallet to Branch
app.post('/api/technicians/return-consumables', async (req, res) => {
  const { techId, itemId, qty } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify tech has stock in wallet
    const tcRes = await client.query(
      'SELECT id, qty, unit_cost FROM tech_consumable_stock WHERE tech_id = $1 AND item_id = $2 FOR UPDATE',
      [techId, itemId]
    );
    if (tcRes.rows.length === 0 || tcRes.rows[0].qty < qty) {
      throw new Error(`Insufficient quantity of item ${itemId} in technician wallet`);
    }
    const tc = tcRes.rows[0];

    // 2. Decrement tech wallet stock
    const remaining = tc.qty - qty;
    if (remaining === 0) {
      await client.query('DELETE FROM tech_consumable_stock WHERE id = $1', [tc.id]);
    } else {
      await client.query('UPDATE tech_consumable_stock SET qty = $1 WHERE id = $2', [remaining, tc.id]);
    }

    // 3. Look up technician branch
    const techRes = await client.query('SELECT branch_id FROM technicians WHERE id = $1', [techId]);
    if (techRes.rows.length === 0) throw new Error('Technician not found');
    const branchId = techRes.rows[0].branch_id;

    // 4. Increment branch warehouse stock
    const csRes = await client.query(
      'SELECT id FROM consumable_stock WHERE item_id = $1 AND loc_id = $2 FOR UPDATE',
      [itemId, branchId]
    );
    if (csRes.rows.length > 0) {
      await client.query(
        'UPDATE consumable_stock SET qty = qty + $1 WHERE id = $2',
        [qty, csRes.rows[0].id]
      );
    } else {
      const csId = 'CS' + String(Date.now()).slice(-8) + Math.floor(Math.random() * 10);
      await client.query(
        'INSERT INTO consumable_stock (id, item_id, loc_id, qty, unit_cost, batch) VALUES ($1, $2, $3, $4, $5, $6)',
        [csId, itemId, branchId, qty, tc.unit_cost, 'RETURN-TECH']
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Consumables successfully returned to branch warehouse' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to return tech consumables:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/fuel-logs', async (req, res) => {
  const { id, tech_id, date, start_odo, end_odo, distance, refuel_liters, refuel_cost, expected_liters, discrepancy, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert fuel log
    const logRes = await client.query(
      'INSERT INTO fuel_logs (id, tech_id, date, start_odo, end_odo, distance, refuel_liters, refuel_cost, expected_liters, discrepancy, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [id, tech_id, date, start_odo, end_odo, distance, refuel_liters || null, refuel_cost || null, expected_liters || 0, discrepancy || false, notes || '']
    );

    // Update technician odometer
    await client.query(
      'UPDATE technicians SET current_odometer = $1 WHERE id = $2',
      [end_odo, tech_id]
    );

    await client.query('COMMIT');
    res.status(201).json(logRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error inserting fuel log:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 6. Serialized Assets REST
app.get('/api/serialized', async (req, res) => {
  try {
    const result = await query('SELECT * FROM serialized_assets ORDER BY sn ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Consumable Stock levels REST
app.get('/api/consumable-stock', async (req, res) => {
  try {
    const result = await query('SELECT * FROM consumable_stock ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7b. FWCPL Operations Integration: Aggregated Available Stock
app.get('/api/stock/available', async (req, res) => {
  const { location_id } = req.query;
  try {
    let locFilterSerial = '';
    let locFilterConsumable = '';
    const params = [];

    if (location_id) {
      params.push(location_id);
      locFilterSerial = `AND (sa.branch_id = $1 OR (sa.loc_type = 'Branch' AND sa.loc_id = $1) OR (sa.loc_type = 'Central_Warehouse' AND $1 = 'LOC001'))`;
      locFilterConsumable = `AND cs.loc_id = $1`;
    }

    const sql = `
      WITH asset_counts AS (
        SELECT 
          sa.item_id,
          COALESCE(sa.branch_id, CASE WHEN sa.loc_type = 'Central_Warehouse' THEN 'LOC001' ELSE sa.loc_id END) AS loc_id,
          COUNT(*)::int AS available_qty
        FROM serialized_assets sa
        WHERE sa.status = 'Available'
        ${locFilterSerial}
        GROUP BY sa.item_id, loc_id
      ),
      consumable_counts AS (
        SELECT 
          cs.item_id,
          cs.loc_id,
          SUM(cs.qty)::int AS available_qty
        FROM consumable_stock cs
        WHERE 1=1
        ${locFilterConsumable}
        GROUP BY cs.item_id, cs.loc_id
      ),
      combined AS (
        SELECT item_id, loc_id, available_qty FROM asset_counts
        UNION ALL
        SELECT item_id, loc_id, available_qty FROM consumable_counts
      )
      SELECT 
        c.item_id,
        i.name AS item_name,
        i.category,
        i.uom,
        c.loc_id AS location_id,
        l.name AS location_name,
        l.type AS location_type,
        c.available_qty
      FROM combined c
      JOIN items i ON i.id = c.item_id
      JOIN locations l ON l.id = c.loc_id
      ORDER BY l.id ASC, i.id ASC
    `;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching available stock for integration:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7c. Database Backup & Email Dispatch API
app.post('/api/backup/email', async (req, res) => {
  try {
    const result = await sendDatabaseBackupEmail();
    res.json({
      success: true,
      message: `Database backup successfully sent to ${result.recipient}`,
      details: result
    });
  } catch (err) {
    console.error('Backup to email failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Log Consumable Usage
app.post('/api/consumable-logs', async (req, res) => {
  const { id, item_id, loc_id, qty_used, customer_acc, date, tech_id, notes, latitude, longitude } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify and decrement from consumable_stock
    const stockCheck = await client.query(
      'SELECT id, qty FROM consumable_stock WHERE item_id = $1 AND loc_id = $2 FOR UPDATE',
      [item_id, loc_id]
    );

    if (stockCheck.rows.length === 0 || stockCheck.rows[0].qty < qty_used) {
      throw new Error(`Insufficient consumable stock level for item ${item_id} at location ${loc_id}`);
    }

    await client.query(
      'UPDATE consumable_stock SET qty = qty - $1 WHERE id = $2',
      [qty_used, stockCheck.rows[0].id]
    );

    // 2. Insert audit log
    const logResult = await client.query(
      'INSERT INTO consumable_logs (id, item_id, loc_id, qty_used, customer_acc, date, tech_id, notes, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [id, item_id, loc_id, qty_used, customer_acc, date, tech_id || null, notes || '', latitude || null, longitude || null]
    );

    await client.query('COMMIT');
    res.status(201).json(logResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error logging consumable usage:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 9. Create Purchase Order (Procurement) — SQL Transaction (Supports Multiple Items)
app.post('/api/procurements', async (req, res) => {
  const {
    poId,
    vendor,
    date,
    invoiceNo,
    invoiceFile,
    invoiceFileName,
    items // Array of items: [{ itemId, qty, cost, isNewItem, newItemDetails, isAsset, warrantyMonths, serials, macs }]
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Calculate overall total first
    let overallTotal = 0;
    for (const item of items) {
      overallTotal += item.qty * item.cost;
    }

    // 2. Process invoice attachment upload
    let savedFileName = null;
    if (invoiceFile && invoiceFileName) {
      const matches = invoiceFile.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const fileBuffer = Buffer.from(matches[2], 'base64');
        const safeName = `${poId}_${Date.now()}_${invoiceFileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        let uploadDir = '/var/www/stockos/uploads';
        try {
          if (!fs.existsSync('/var/www/stockos')) {
            uploadDir = path.join(__dirname, 'uploads');
          }
        } catch (e) {
          uploadDir = path.join(__dirname, 'uploads');
        }
        
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(uploadDir, safeName), fileBuffer);
        savedFileName = safeName;
      }
    }

    // 3. Save purchase order header details FIRST so we don't violate foreign key constraint
    const poResult = await client.query(
      'INSERT INTO procurements (id, vendor, total, date, status, invoice_no, invoice_file) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [poId, vendor, overallTotal, date, 'Received', invoiceNo || 'N/A', savedFileName]
    );

    // 4. Save purchase order line items detail
    for (const item of items) {
      const {
        itemId,
        qty,
        cost,
        isNewItem,
        newItemDetails,
        isAsset,
        warrantyMonths,
        serials,
        macs,
        batch
      } = item;

      let finalItemId = itemId;
      const itemTotal = qty * cost;

      // A. If it's a new catalog item, insert it
      if (isNewItem && newItemDetails) {
        await client.query(
          'INSERT INTO items (id, name, category, uom, reorder, unit_cost, is_infrastructure) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [itemId, newItemDetails.name, newItemDetails.category, newItemDetails.uom, newItemDetails.reorder, newItemDetails.unit_cost, newItemDetails.is_infrastructure || false]
        );
      }

      // B. Process stock insertion based on item category
      let finalBatch = null;
      if (isAsset) {
        // Create serialized hardware items
        for (let i = 0; i < serials.length; i++) {
          const sn = serials[i];
          const mac = macs[i] || null;
          await client.query(
            'INSERT INTO serialized_assets (sn, mac, item_id, loc_type, loc_id, status, purchase_cost, warranty_months, invoice_no, po_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
            [sn, mac, finalItemId, 'Central_Warehouse', 'LOC001', 'Available', cost, warrantyMonths || 12, invoiceNo || 'N/A', poId]
          );
        }
      } else {
        // Update or insert consumable bulk level in central hub (LOC001) per batch number
        finalBatch = batch || `BATCH-${Date.now()}`;
        const existing = await client.query(
          'SELECT id, qty FROM consumable_stock WHERE item_id = $1 AND loc_id = $2 AND batch = $3 FOR UPDATE',
          [finalItemId, 'LOC001', finalBatch]
        );

        if (existing.rows.length > 0) {
          await client.query(
            'UPDATE consumable_stock SET qty = qty + $1 WHERE id = $2',
            [qty, existing.rows[0].id]
          );
        } else {
          const newStockId = 'CS' + String(Date.now()).slice(-8) + Math.floor(Math.random() * 10);
          await client.query(
            'INSERT INTO consumable_stock (id, item_id, loc_id, qty, unit_cost, batch) VALUES ($1, $2, $3, $4, $5, $6)',
            [newStockId, finalItemId, 'LOC001', qty, cost, finalBatch]
          );
        }
      }

      // C. Insert details into procurement_items
      await client.query(
        'INSERT INTO procurement_items (po_id, item_id, qty, unit_cost, total, serials_uploaded, warranty_months, batch) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [poId, finalItemId, qty, cost, itemTotal, isAsset, isAsset ? (warrantyMonths || 12) : null, isAsset ? null : finalBatch]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...poResult.rows[0], items: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Procurement Transaction Failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Payouts REST API
app.get('/api/payouts', async (req, res) => {
  try {
    const result = await query('SELECT * FROM payouts ORDER BY date DESC, id DESC');
    res.json(result.rows.map(pay => ({
      ...pay,
      amount: parseFloat(pay.amount),
      date: pay.date ? pay.date.toISOString().slice(0, 10) : null
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payouts', async (req, res) => {
  const { id, po_id, amount, payment_method, date, notes, payoutFile, payoutFileName } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch procurement details and lock the row
    const poRes = await client.query('SELECT total, amount_paid FROM procurements WHERE id = $1 FOR UPDATE', [po_id]);
    if (poRes.rows.length === 0) {
      throw new Error(`Procurement order ${po_id} not found.`);
    }

    const total = parseFloat(poRes.rows[0].total);
    const prevPaid = parseFloat(poRes.rows[0].amount_paid || 0);
    const amountVal = parseFloat(amount);

    if (isNaN(amountVal) || amountVal <= 0) {
      throw new Error('Payout amount must be greater than zero.');
    }

    const outstanding = parseFloat((total - prevPaid).toFixed(2));
    if (amountVal > outstanding) {
      throw new Error(`Overpayment blocked! Remaining balance is NPR ${outstanding}, but attempted to pay NPR ${amountVal}.`);
    }

    // Process payout digital proof file attachment upload
    let savedFileName = null;
    if (payoutFile && payoutFileName) {
      const matches = payoutFile.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const fileBuffer = Buffer.from(matches[2], 'base64');
        const safeName = `payout_${id}_${Date.now()}_${payoutFileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        let uploadDir = '/var/www/stockos/uploads';
        try {
          if (!fs.existsSync('/var/www/stockos')) {
            uploadDir = path.join(__dirname, 'uploads');
          }
        } catch (e) {
          uploadDir = path.join(__dirname, 'uploads');
        }
        
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(uploadDir, safeName), fileBuffer);
        savedFileName = safeName;
      }
    }

    // 2. Insert payout record
    const payResult = await client.query(
      'INSERT INTO payouts (id, po_id, amount, payment_method, date, notes, payout_file) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [id, po_id, amountVal, payment_method, date, notes || '', savedFileName]
    );

    // 3. Update procurement table
    const newPaid = parseFloat((prevPaid + amountVal).toFixed(2));
    let newStatus = 'Unpaid';
    if (newPaid >= total) {
      newStatus = 'Fully_Paid';
    } else if (newPaid > 0) {
      newStatus = 'Partially_Paid';
    }

    await client.query(
      'UPDATE procurements SET amount_paid = $1, payment_status = $2 WHERE id = $3',
      [newPaid, newStatus, po_id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      ...payResult.rows[0],
      amount: parseFloat(payResult.rows[0].amount),
      date: payResult.rows[0].date.toISOString().slice(0, 10),
      payout_file: payResult.rows[0].payout_file
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error recording payout transaction:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

const nodemailer = require('nodemailer');

async function sendRequisitionEmail(requisitionId, fromLocId, createdBy, notes, items) {
  try {
    const settingsRes = await pool.query('SELECT * FROM system_settings');
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

    const smtpHost = settings.smtp_host || process.env.SMTP_HOST;
    const smtpPort = settings.smtp_port || process.env.SMTP_PORT;
    const smtpUser = settings.smtp_user || process.env.SMTP_USER;
    const smtpPass = settings.smtp_pass || process.env.SMTP_PASS;
    const rawRecipients = settings.notification_emails || process.env.NOTIFICATION_EMAILS || 'koiralarijan8@gmail.com';
    const recipients = rawRecipients.split(/[\s,;\n\r]+/).map(e => e.trim()).filter(e => e.length > 0).join(', ');

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('ℹ️ SMTP credentials not configured in database or environment. Skipping email notification.');
      return;
    }

    // Fetch location details
    const locRes = await pool.query('SELECT name, manager FROM locations WHERE id = $1', [fromLocId]);
    const branchName = locRes.rows[0]?.name || fromLocId;
    const branchManager = locRes.rows[0]?.manager || 'N/A';

    // Fetch items details
    const enrichedItems = [];
    for (const item of items) {
      const itemRes = await pool.query('SELECT name, uom FROM items WHERE id = $1', [item.item_id]);
      enrichedItems.push({
        name: itemRes.rows[0]?.name || item.item_id,
        uom: itemRes.rows[0]?.uom || 'Pcs',
        qty: item.qty
      });
    }

    // Configure SMTP transport
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || '587'),
      secure: smtpPort === '465',
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const itemsTableRows = enrichedItems.map(item => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${item.name}</td>
        <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px; font-family: monospace; font-weight: bold; text-align: center;">${item.qty} ${item.uom}</td>
      </tr>
    `).join('');

    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #f8fafc;">
        <div style="background-color: #6366f1; color: #ffffff; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">🔔 New Stock Request Alert</h2>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">FWCPL StockOS Notification System</p>
        </div>
        
        <div style="padding: 20px 10px; line-height: 1.6; color: #334155;">
          <p style="font-size: 15px; margin-top: 0;">Hello,</p>
          <p style="font-size: 15px;">A new stock requisition has been submitted from <strong>${branchName}</strong>. Here are the details:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Detail</th>
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Value</th>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Requisition ID</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 14px; color: #6366f1; font-weight: bold;">${requisitionId}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Origin Branch</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${branchName} (${fromLocId})</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Submitted By</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${branchManager}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Date Submitted</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${new Date().toISOString().slice(0, 10)}</td>
            </tr>
          </table>

          <h3 style="font-size: 16px; margin: 20px 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📦 Requested Items</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f1f5f9; text-align: left;">
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Item Name</th>
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569; text-align: center; width: 120px;">Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${itemsTableRows}
            </tbody>
          </table>

          ${notes ? `
          <h3 style="font-size: 16px; margin: 20px 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📝 Storekeeper Notes</h3>
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; font-style: italic; font-size: 14px; color: #78350f; margin: 10px 0;">
            "${notes}"
          </div>
          ` : ''}
        </div>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
          This is an automated alert generated by FWCPL StockOS system. Please do not reply directly to this email.
        </div>
      </div>
    `;

    // Send the email
    await transporter.sendMail({
      from: `"FWCPL StockOS Alerts" <${smtpUser}>`,
      to: recipients,
      subject: `🚨 [StockOS] New Requisition Alert from ${branchName} (${requisitionId})`,
      html: htmlBody
    });

    console.log(`✅ Requisition email alert sent successfully for ${requisitionId} to ${recipients}`);
  } catch (error) {
    console.error(`❌ Failed to send requisition email notification for ${requisitionId}:`, error);
  }
}

async function sendRequisitionDispatchEmail(requisitionId) {
  try {
    // 1. Fetch requisition details and its items
    const reqRes = await pool.query('SELECT * FROM requisitions WHERE id = $1', [requisitionId]);
    if (reqRes.rows.length === 0) return;
    const requisition = reqRes.rows[0];

    const itemsRes = await pool.query('SELECT * FROM requisition_items WHERE requisition_id = $1', [requisitionId]);
    const items = itemsRes.rows;

    // 2. Fetch SMTP configurations
    const settingsRes = await pool.query('SELECT * FROM system_settings');
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

    const smtpHost = settings.smtp_host || process.env.SMTP_HOST;
    const smtpPort = settings.smtp_port || process.env.SMTP_PORT;
    const smtpUser = settings.smtp_user || process.env.SMTP_USER;
    const smtpPass = settings.smtp_pass || process.env.SMTP_PASS;
    const rawRecipients = settings.notification_emails || process.env.NOTIFICATION_EMAILS || 'koiralarijan8@gmail.com';
    const recipients = rawRecipients.split(/[\s,;\n\r]+/).map(e => e.trim()).filter(e => e.length > 0).join(', ');

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('ℹ️ SMTP credentials not configured. Skipping dispatch email notification.');
      return;
    }

    // 3. Fetch location details
    const locRes = await pool.query('SELECT name, manager FROM locations WHERE id = $1', [requisition.from_loc]);
    const branchName = locRes.rows[0]?.name || requisition.from_loc;
    const branchManager = locRes.rows[0]?.manager || 'N/A';

    // 4. Fetch item details
    const enrichedItems = [];
    for (const item of items) {
      const itemRes = await pool.query('SELECT name, uom FROM items WHERE id = $1', [item.item_id]);
      enrichedItems.push({
        name: itemRes.rows[0]?.name || item.item_id,
        uom: itemRes.rows[0]?.uom || 'Pcs',
        qty: item.qty
      });
    }

    // 5. Configure SMTP transport
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || '587'),
      secure: smtpPort === '465',
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const itemsTableRows = enrichedItems.map(item => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${item.name}</td>
        <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px; font-family: monospace; font-weight: bold; text-align: center; color: #10b981;">${item.qty} ${item.uom}</td>
      </tr>
    `).join('');

    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #f8fafc;">
        <div style="background-color: #10b981; color: #ffffff; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">🚚 Requisition Dispatched Alert</h2>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Stock has been sent to branch</p>
        </div>
        
        <div style="padding: 20px 10px; line-height: 1.6; color: #334155;">
          <p style="font-size: 15px; margin-top: 0;">Hello,</p>
          <p style="font-size: 15px;">Stock requisition <strong>${requisitionId}</strong> has been <strong>Approved & Dispatched</strong> by the Central Warehouse. The requested items have been sent to <strong>${branchName}</strong>.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Detail</th>
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Value</th>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Requisition ID</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 14px; color: #10b981; font-weight: bold;">${requisitionId}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Destination Branch</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${branchName} (${requisition.from_loc})</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Branch Manager</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${branchManager}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Dispatch Date</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${new Date().toISOString().slice(0, 10)}</td>
            </tr>
          </table>

          <h3 style="font-size: 16px; margin: 20px 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📦 Dispatched Items</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f1f5f9; text-align: left;">
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Item Name</th>
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569; text-align: center; width: 120px;">Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${itemsTableRows}
            </tbody>
          </table>
          
          <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 0 6px 6px 0; font-size: 13px; color: #065f46; margin: 20px 0;">
            <strong>Next Step:</strong> Please acknowledge the physical receipt of these items once they arrive at your branch by marking the request as fulfilled.
          </div>
        </div>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
          This is an automated alert generated by FWCPL StockOS system. Please do not reply directly to this email.
        </div>
      </div>
    `;

    // Send the email
    await transporter.sendMail({
      from: `"FWCPL StockOS Alerts" <${smtpUser}>`,
      to: recipients,
      subject: `🚚 [StockOS] Requisition Dispatched to ${branchName} (${requisitionId})`,
      html: htmlBody
    });

    console.log(`✅ Requisition dispatch email alert sent successfully for ${requisitionId} to ${recipients}`);
  } catch (error) {
    console.error(`❌ Failed to send requisition dispatch email notification for ${requisitionId}:`, error);
  }
}

async function sendRequisitionFulfillEmail(requisitionId) {
  try {
    // 1. Fetch requisition details and its items
    const reqRes = await pool.query('SELECT * FROM requisitions WHERE id = $1', [requisitionId]);
    if (reqRes.rows.length === 0) return;
    const requisition = reqRes.rows[0];

    const itemsRes = await pool.query('SELECT * FROM requisition_items WHERE requisition_id = $1', [requisitionId]);
    const items = itemsRes.rows;

    // 2. Fetch SMTP configurations
    const settingsRes = await pool.query('SELECT * FROM system_settings');
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

    const smtpHost = settings.smtp_host || process.env.SMTP_HOST;
    const smtpPort = settings.smtp_port || process.env.SMTP_PORT;
    const smtpUser = settings.smtp_user || process.env.SMTP_USER;
    const smtpPass = settings.smtp_pass || process.env.SMTP_PASS;
    const rawRecipients = settings.notification_emails || process.env.NOTIFICATION_EMAILS || 'koiralarijan8@gmail.com';
    const recipients = rawRecipients.split(/[\s,;\n\r]+/).map(e => e.trim()).filter(e => e.length > 0).join(', ');

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('ℹ️ SMTP credentials not configured. Skipping fulfill email notification.');
      return;
    }

    // 3. Fetch location details
    const locRes = await pool.query('SELECT name, manager FROM locations WHERE id = $1', [requisition.from_loc]);
    const branchName = locRes.rows[0]?.name || requisition.from_loc;
    const branchManager = locRes.rows[0]?.manager || 'N/A';

    // 4. Fetch item details
    const enrichedItems = [];
    for (const item of items) {
      const itemRes = await pool.query('SELECT name, uom FROM items WHERE id = $1', [item.item_id]);
      enrichedItems.push({
        name: itemRes.rows[0]?.name || item.item_id,
        uom: itemRes.rows[0]?.uom || 'Pcs',
        qty: item.qty
      });
    }

    // 5. Configure SMTP transport
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || '587'),
      secure: smtpPort === '465',
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const itemsTableRows = enrichedItems.map(item => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${item.name}</td>
        <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px; font-family: monospace; font-weight: bold; text-align: center; color: #10b981;">${item.qty} ${item.uom}</td>
      </tr>
    `).join('');

    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #f8fafc;">
        <div style="background-color: #10b981; color: #ffffff; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">✅ Requisition Completed Alert</h2>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Stock successfully received at branch</p>
        </div>
        
        <div style="padding: 20px 10px; line-height: 1.6; color: #334155;">
          <p style="font-size: 15px; margin-top: 0;">Hello,</p>
          <p style="font-size: 15px;">Stock requisition <strong>${requisitionId}</strong> has been marked as <strong>Fulfilled</strong>. The branch has confirmed the physical receipt of all requested items.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Detail</th>
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Value</th>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Requisition ID</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 14px; color: #10b981; font-weight: bold;">${requisitionId}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Receiving Branch</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${branchName} (${requisition.from_loc})</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Acknowledged By (Manager)</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${branchManager}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Completion Date</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${new Date().toISOString().slice(0, 10)}</td>
            </tr>
          </table>

          <h3 style="font-size: 16px; margin: 20px 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📦 Received Items</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f1f5f9; text-align: left;">
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Item Name</th>
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569; text-align: center; width: 120px;">Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${itemsTableRows}
            </tbody>
          </table>
        </div>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
          This is an automated alert generated by FWCPL StockOS system. Please do not reply directly to this email.
        </div>
      </div>
    `;

    // Send the email
    await transporter.sendMail({
      from: `"FWCPL StockOS Alerts" <${smtpUser}>`,
      to: recipients,
      subject: `✅ [StockOS] Requisition Completed at ${branchName} (${requisitionId})`,
      html: htmlBody
    });

    console.log(`✅ Requisition fulfill email alert sent successfully for ${requisitionId} to ${recipients}`);
  } catch (error) {
    console.error(`❌ Failed to send requisition fulfill email notification for ${requisitionId}:`, error);
  }
}

async function sendTransferTransitEmail(transferId) {
  try {
    const trfRes = await pool.query('SELECT * FROM transfers WHERE id = $1', [transferId]);
    if (trfRes.rows.length === 0) return;
    const transfer = trfRes.rows[0];

    const itemsRes = await pool.query('SELECT * FROM transfer_items WHERE transfer_id = $1', [transferId]);
    const items = itemsRes.rows;

    const settingsRes = await pool.query('SELECT * FROM system_settings');
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

    const smtpHost = settings.smtp_host || process.env.SMTP_HOST;
    const smtpPort = settings.smtp_port || process.env.SMTP_PORT;
    const smtpUser = settings.smtp_user || process.env.SMTP_USER;
    const smtpPass = settings.smtp_pass || process.env.SMTP_PASS;
    const rawRecipients = settings.notification_emails || process.env.NOTIFICATION_EMAILS || 'koiralarijan8@gmail.com';
    const recipients = rawRecipients.split(/[\s,;\n\r]+/).map(e => e.trim()).filter(e => e.length > 0).join(', ');

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('ℹ️ SMTP credentials not configured. Skipping transfer transit email notification.');
      return;
    }

    const fromLocRes = await pool.query('SELECT name FROM locations WHERE id = $1', [transfer.from_loc]);
    const fromName = fromLocRes.rows[0]?.name || transfer.from_loc;

    const toLocRes = await pool.query('SELECT name FROM locations WHERE id = $1', [transfer.to_loc]);
    const toName = toLocRes.rows[0]?.name || transfer.to_loc;

    const enrichedItems = [];
    for (const item of items) {
      const itemRes = await pool.query('SELECT name, category, uom FROM items WHERE id = $1', [item.item_id]);
      enrichedItems.push({
        name: itemRes.rows[0]?.name || item.item_id,
        category: itemRes.rows[0]?.category || 'Consumable',
        uom: itemRes.rows[0]?.uom || 'Pcs',
        qty: item.serials && item.serials.length > 0 ? item.serials.length : item.qty,
        serials: item.serials || []
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || '587'),
      secure: smtpPort === '465',
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const itemsTableRows = enrichedItems.map(item => {
      const serialText = item.serials.length > 0 
        ? `<div style="font-size: 11px; color: #64748b; margin-top: 4px; font-family: monospace;">Serials: ${item.serials.join(', ')}</div>` 
        : '';
      return `
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">
            <div style="font-weight: bold;">${item.name}</div>
            ${serialText}
          </td>
          <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px; font-family: monospace; font-weight: bold; text-align: center; color: #3b82f6;">${item.qty} ${item.uom}</td>
        </tr>
      `;
    }).join('');

    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #f8fafc;">
        <div style="background-color: #3b82f6; color: #ffffff; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">🚚 Direct Stock Transfer Dispatched</h2>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Stock has been manually dispatched</p>
        </div>
        
        <div style="padding: 20px 10px; line-height: 1.6; color: #334155;">
          <p style="font-size: 15px; margin-top: 0;">Hello,</p>
          <p style="font-size: 15px;">A direct manual stock transfer has been initiated. Here are the routing details:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Route Detail</th>
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Value</th>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Transfer ID</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 14px; color: #3b82f6; font-weight: bold;">${transferId}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">From Location</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px; font-weight: bold;">${fromName}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">To Location</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px; font-weight: bold; color: #10b981;">${toName}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Dispatched By</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${transfer.dispatched_by || 'Admin'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Date Sent</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${new Date(transfer.created).toISOString().slice(0, 10)}</td>
            </tr>
          </table>

          <h3 style="font-size: 16px; margin: 20px 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📦 Items Dispatched</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f1f5f9; text-align: left;">
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Item Name</th>
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569; text-align: center; width: 120px;">Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${itemsTableRows}
            </tbody>
          </table>

          ${transfer.notes ? `
          <h3 style="font-size: 16px; margin: 20px 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📝 Transfer Notes</h3>
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; font-style: italic; font-size: 14px; color: #78350f; margin: 10px 0;">
            "${transfer.notes}"
          </div>
          ` : ''}

          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 0 6px 6px 0; font-size: 13px; color: #1e3a8a; margin: 20px 0;">
            <strong>Next Step:</strong> Please acknowledge the physical receipt of these items once they arrive at your branch in the Transfer Hub.
          </div>
        </div>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
          This is an automated alert generated by FWCPL StockOS system. Please do not reply directly to this email.
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"FWCPL StockOS Alerts" <${smtpUser}>`,
      to: recipients,
      subject: `🚚 [StockOS] Direct Transfer Dispatched: ${fromName} ➔ ${toName} (${transferId})`,
      html: htmlBody
    });

    console.log(`✅ Direct transfer transit email alert sent successfully for ${transferId} to ${recipients}`);
  } catch (error) {
    console.error(`❌ Failed to send transfer transit email notification for ${transferId}:`, error);
  }
}

async function sendTransferCompleteEmail(transferId) {
  try {
    const trfRes = await pool.query('SELECT * FROM transfers WHERE id = $1', [transferId]);
    if (trfRes.rows.length === 0) return;
    const transfer = trfRes.rows[0];

    const itemsRes = await pool.query('SELECT * FROM transfer_items WHERE transfer_id = $1', [transferId]);
    const items = itemsRes.rows;

    const settingsRes = await pool.query('SELECT * FROM system_settings');
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

    const smtpHost = settings.smtp_host || process.env.SMTP_HOST;
    const smtpPort = settings.smtp_port || process.env.SMTP_PORT;
    const smtpUser = settings.smtp_user || process.env.SMTP_USER;
    const smtpPass = settings.smtp_pass || process.env.SMTP_PASS;
    const rawRecipients = settings.notification_emails || process.env.NOTIFICATION_EMAILS || 'koiralarijan8@gmail.com';
    const recipients = rawRecipients.split(/[\s,;\n\r]+/).map(e => e.trim()).filter(e => e.length > 0).join(', ');

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('ℹ️ SMTP credentials not configured. Skipping transfer complete email notification.');
      return;
    }

    const fromLocRes = await pool.query('SELECT name FROM locations WHERE id = $1', [transfer.from_loc]);
    const fromName = fromLocRes.rows[0]?.name || transfer.from_loc;

    const toLocRes = await pool.query('SELECT name FROM locations WHERE id = $1', [transfer.to_loc]);
    const toName = toLocRes.rows[0]?.name || transfer.to_loc;

    const enrichedItems = [];
    for (const item of items) {
      const itemRes = await pool.query('SELECT name, category, uom FROM items WHERE id = $1', [item.item_id]);
      enrichedItems.push({
        name: itemRes.rows[0]?.name || item.item_id,
        category: itemRes.rows[0]?.category || 'Consumable',
        uom: itemRes.rows[0]?.uom || 'Pcs',
        qty: item.serials && item.serials.length > 0 ? item.serials.length : item.qty,
        serials: item.serials || []
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || '587'),
      secure: smtpPort === '465',
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const itemsTableRows = enrichedItems.map(item => {
      const serialText = item.serials.length > 0 
        ? `<div style="font-size: 11px; color: #64748b; margin-top: 4px; font-family: monospace;">Serials: ${item.serials.join(', ')}</div>` 
        : '';
      return `
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">
            <div style="font-weight: bold;">${item.name}</div>
            ${serialText}
          </td>
          <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px; font-family: monospace; font-weight: bold; text-align: center; color: #10b981;">${item.qty} ${item.uom}</td>
        </tr>
      `;
    }).join('');

    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #f8fafc;">
        <div style="background-color: #10b981; color: #ffffff; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">✅ Direct Stock Transfer Completed</h2>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Stock received and acknowledged</p>
        </div>
        
        <div style="padding: 20px 10px; line-height: 1.6; color: #334155;">
          <p style="font-size: 15px; margin-top: 0;">Hello,</p>
          <p style="font-size: 15px;">A direct stock transfer has been successfully completed and received. Details:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Route Detail</th>
              <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Value</th>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Transfer ID</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 14px; color: #10b981; font-weight: bold;">${transferId}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">From Location</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${fromName}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">To Location (Received At)</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px; font-weight: bold; color: #10b981;">${toName}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Acknowledged By</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px; font-weight: bold;">${transfer.acknowledged_by || 'Unknown'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 14px;">Date Completed</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-size: 14px;">${new Date().toISOString().slice(0, 10)}</td>
            </tr>
          </table>

          <h3 style="font-size: 16px; margin: 20px 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📦 Received Items</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f1f5f9; text-align: left;">
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569;">Item Name</th>
                <th style="padding: 10px; border: 1px solid #ddd; font-size: 13px; text-transform: uppercase; color: #475569; text-align: center; width: 120px;">Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${itemsTableRows}
            </tbody>
          </table>

          ${transfer.notes ? `
          <h3 style="font-size: 16px; margin: 20px 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📝 Notes</h3>
          <div style="background-color: #f8fafc; border-left: 4px solid #64748b; padding: 12px 16px; border-radius: 0 6px 6px 0; font-size: 13px; color: #475569; margin: 10px 0;">
            "${transfer.notes}"
          </div>
          ` : ''}
        </div>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
          This is an automated alert generated by FWCPL StockOS system. Please do not reply directly to this email.
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"FWCPL StockOS Alerts" <${smtpUser}>`,
      to: recipients,
      subject: `✅ [StockOS] Direct Transfer Completed at ${toName} (${transferId})`,
      html: htmlBody
    });

    console.log(`✅ Direct transfer complete email alert sent successfully for ${transferId} to ${recipients}`);
  } catch (error) {
    console.error(`❌ Failed to send transfer complete email notification for ${transferId}:`, error);
  }
}

// 10. Requisitions API (Integrated with FWCPL Operations)
app.get('/api/requisitions', async (req, res) => {
  const { from_loc, location_id, status } = req.query;
  const targetLoc = from_loc || location_id;
  try {
    let sql = 'SELECT r.*, l.name AS from_loc_name FROM requisitions r LEFT JOIN locations l ON l.id = r.from_loc WHERE 1=1';
    const params = [];
    if (targetLoc) {
      params.push(targetLoc);
      sql += ` AND r.from_loc = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND r.status = $${params.length}`;
    }
    sql += ' ORDER BY r.created DESC, r.id DESC';

    const reqsRes = await query(sql, params);
    const itemsRes = await query(`
      SELECT ri.*, i.name AS item_name, i.category, i.uom 
      FROM requisition_items ri
      JOIN items i ON i.id = ri.item_id
    `);

    const requisitions = reqsRes.rows.map(r => ({
      ...r,
      created: r.created ? r.created.toISOString().slice(0, 10) : null,
      items: itemsRes.rows.filter(ri => ri.requisition_id === r.id)
    }));

    res.json(requisitions);
  } catch (err) {
    console.error('Error fetching requisitions:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/requisitions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const reqRes = await query(`
      SELECT r.*, l.name AS from_loc_name 
      FROM requisitions r 
      LEFT JOIN locations l ON l.id = r.from_loc 
      WHERE r.id = $1
    `, [id]);

    if (reqRes.rows.length === 0) {
      return res.status(404).json({ error: `Requisition ${id} not found.` });
    }

    const itemsRes = await query(`
      SELECT ri.*, i.name AS item_name, i.category, i.uom 
      FROM requisition_items ri
      JOIN items i ON i.id = ri.item_id
      WHERE ri.requisition_id = $1
    `, [id]);

    const requisition = {
      ...reqRes.rows[0],
      created: reqRes.rows[0].created ? reqRes.rows[0].created.toISOString().slice(0, 10) : null,
      items: itemsRes.rows
    };

    res.json(requisition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/requisitions', async (req, res) => {
  const { id, from_loc, notes, created_by, items } = req.body;
  const finalId = id || ('REQ' + String(Date.now()).slice(-7) + Math.floor(Math.random() * 10));
  const finalCreatedBy = created_by || 'FWCPL OPS System';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create requisition header
    await client.query(
      'INSERT INTO requisitions (id, from_loc, status, created, notes, created_by) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)',
      [finalId, from_loc, 'Pending', notes || '', finalCreatedBy]
    );

    // Create requisition items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await client.query(
          'INSERT INTO requisition_items (requisition_id, item_id, qty) VALUES ($1, $2, $3)',
          [finalId, item.item_id, item.qty]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ 
      success: true, 
      message: 'Requisition submitted successfully', 
      id: finalId,
      status: 'Pending'
    });

    // Trigger asynchronous email send
    sendRequisitionEmail(finalId, from_loc, finalCreatedBy, notes, items || []).catch(err => {
      console.error('Async email alert execution error:', err);
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Requisition submission failure:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put('/api/requisitions/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await query('UPDATE requisitions SET status = $1 WHERE id = $2', [status, id]);
    res.json({ message: `Requisition ${id} status updated to ${status}` });

    // Send dispatch alert email if status is changed to Approved (dispatched)
    if (status === 'Approved') {
      sendRequisitionDispatchEmail(id).catch(err => {
        console.error('Async dispatch email alert error:', err);
      });
    } else if (status === 'Fulfilled') {
      sendRequisitionFulfillEmail(id).catch(err => {
        console.error('Async fulfill email alert error:', err);
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Transfers API (Inter-Location Dispatch & Acknowledge)
app.post('/api/transfers', async (req, res) => {
  const { id, from_loc, to_loc, status, notes, created_by, items, dispatched_by } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create transfer header
    await client.query(
      'INSERT INTO transfers (id, from_loc, to_loc, status, created, notes, created_by, dispatched_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, from_loc, to_loc, status, new Date(), notes || '', created_by, dispatched_by || null]
    );

    // Create transfer items and adjust serial locations if transit instantly
    for (const item of items) {
      await client.query(
        'INSERT INTO transfer_items (transfer_id, item_id, serials, qty) VALUES ($1, $2, $3, $4)',
        [id, item.item_id, item.serials || [], item.qty || 0]
      );

      if (status === 'In_Transit' && item.serials && item.serials.length > 0) {
        for (const sn of item.serials) {
          const checkRes = await client.query("SELECT status FROM serialized_assets WHERE sn = $1", [sn]);
          const isFaulty = checkRes.rows.length > 0 && checkRes.rows[0].status === 'Faulty';
          const targetStatus = isFaulty ? 'Faulty' : 'In_Transit';
          await client.query(
            "UPDATE serialized_assets SET status = $1, loc_type = 'In_Transit', loc_id = $2 WHERE sn = $3",
            [targetStatus, id, sn]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Transfer created successfully', id });

    // Trigger transit email alert asynchronously if it is a direct transfer
    const isRequisition = notes && (notes.match(/(req\d+)/i) || notes.match(/(requisition)/i));
    if (status === 'In_Transit' && !isRequisition) {
      sendTransferTransitEmail(id).catch(err => {
        console.error('Async direct transfer transit email alert error:', err);
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transfer creation failure:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Dispatch Transfer
app.put('/api/transfers/:id/dispatch', async (req, res) => {
  const { id } = req.params;
  const { dispatched_by } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update status to In_Transit & store dispatched_by
    await client.query("UPDATE transfers SET status = 'In_Transit', dispatched_by = $1 WHERE id = $2", [dispatched_by || null, id]);

    // Fetch items to mark serials as In_Transit
    const itemsRes = await client.query('SELECT * FROM transfer_items WHERE transfer_id = $1', [id]);
    for (const item of itemsRes.rows) {
      if (item.serials && item.serials.length > 0) {
        for (const sn of item.serials) {
          const checkRes = await client.query("SELECT status FROM serialized_assets WHERE sn = $1", [sn]);
          const isFaulty = checkRes.rows.length > 0 && checkRes.rows[0].status === 'Faulty';
          const targetStatus = isFaulty ? 'Faulty' : 'In_Transit';
          await client.query(
            "UPDATE serialized_assets SET status = $1, loc_type = 'In_Transit', loc_id = $2 WHERE sn = $3",
            [targetStatus, id, sn]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ message: `Transfer ${id} dispatched successfully` });

    // Trigger email alert asynchronously if it is a direct transfer
    const trfRes = await query('SELECT notes FROM transfers WHERE id = $1', [id]);
    const trfNotes = trfRes.rows[0]?.notes || '';
    const isRequisition = trfNotes && (trfNotes.match(/(req\d+)/i) || trfNotes.match(/(requisition)/i));
    if (!isRequisition) {
      sendTransferTransitEmail(id).catch(err => {
        console.error('Async direct transfer dispatch email alert error:', err);
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Acknowledge Receipt of Transfer (Deliver stock to destination)
app.put('/api/transfers/:id/acknowledge', async (req, res) => {
  const { id } = req.params;
  const { acknowledged_by, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get transfer headers & items
    const transferRes = await client.query('SELECT * FROM transfers WHERE id = $1 FOR UPDATE', [id]);
    if (transferRes.rows.length === 0) throw new Error('Transfer not found');

    const transfer = transferRes.rows[0];
    if (transfer.status === 'Completed') throw new Error('Transfer already completed');

    const itemsRes = await client.query('SELECT * FROM transfer_items WHERE transfer_id = $1', [id]);

    // 2. Process each item
    for (const item of itemsRes.rows) {
      // A. If it's a serialized asset, update serial positions
      if (item.serials && item.serials.length > 0) {
        for (const sn of item.serials) {
          const checkRes = await client.query("SELECT status FROM serialized_assets WHERE sn = $1", [sn]);
          const isFaulty = checkRes.rows.length > 0 && checkRes.rows[0].status === 'Faulty';
          const targetStatus = isFaulty ? 'Faulty' : 'Available';
          const destType = transfer.to_loc === 'LOC001' ? 'Central_Warehouse' : 'Branch';
          await client.query(
            "UPDATE serialized_assets SET status = $1, loc_type = $2, loc_id = $3, branch_id = $3 WHERE sn = $4",
            [targetStatus, destType, transfer.to_loc, sn]
          );
        }
      }

      // B. If it's a consumable, decrement from source and add to destination!
      const catCheck = await client.query('SELECT category, unit_cost FROM items WHERE id = $1', [item.item_id]);
      const isConsumable = catCheck.rows.length > 0 && catCheck.rows[0].category === 'Consumable';

      if (isConsumable && item.qty > 0) {
        const unitCost = catCheck.rows[0].unit_cost;

        // Decrement source consumable levels (e.g. from Central LOC001)
        const sourceStock = await client.query(
          'SELECT id, qty FROM consumable_stock WHERE item_id = $1 AND loc_id = $2 FOR UPDATE',
          [item.item_id, transfer.from_loc]
        );

        if (sourceStock.rows.length > 0 && sourceStock.rows[0].qty >= item.qty) {
          await client.query(
            'UPDATE consumable_stock SET qty = qty - $1 WHERE id = $2',
            [item.qty, sourceStock.rows[0].id]
          );
        }

        // Increment destination consumable levels
        const destStock = await client.query(
          'SELECT id, qty FROM consumable_stock WHERE item_id = $1 AND loc_id = $2 FOR UPDATE',
          [item.item_id, transfer.to_loc]
        );

        if (destStock.rows.length > 0) {
          await client.query(
            'UPDATE consumable_stock SET qty = qty + $1 WHERE id = $2',
            [item.qty, destStock.rows[0].id]
          );
        } else {
          const newStockId = 'CS' + String(Date.now()).slice(-8); // Generate ID
          await client.query(
            'INSERT INTO consumable_stock (id, item_id, loc_id, qty, unit_cost, batch) VALUES ($1, $2, $3, $4, $5, $6)',
            [newStockId, item.item_id, transfer.to_loc, item.qty, unitCost, `TRF-${id}`]
          );
        }
      }
    }

    // 3. Mark transfer completed & store acknowledged_by
    let newNotes = transfer.notes || '';
    if (notes) {
      newNotes = newNotes ? `${newNotes}\n[Ack Notes: ${notes}]` : `[Ack Notes: ${notes}]`;
    }
    await client.query(
      "UPDATE transfers SET status = 'Completed', acknowledged_by = $1, notes = $2 WHERE id = $3",
      [acknowledged_by || null, newNotes, id]
    );

    // Automatically fulfill corresponding requisition if linked in the notes
    const transferNotes = transfer.notes || '';
    const reqMatch = transferNotes.match(/(REQ\d+)/i);
    if (reqMatch) {
      const requisitionId = reqMatch[1].toUpperCase();
      await client.query("UPDATE requisitions SET status = 'Fulfilled' WHERE id = $1", [requisitionId]);
      
      // Trigger requisition fulfillment email notification
      sendRequisitionFulfillEmail(requisitionId).catch(err => {
        console.error('Async fulfill email alert error from transfer ack:', err);
      });
    } else {
      // Trigger direct transfer complete email notification asynchronously
      sendTransferCompleteEmail(id).catch(err => {
        console.error('Async direct transfer complete email alert error:', err);
      });
    }

    await client.query('COMMIT');
    res.json({ message: `Transfer ${id} successfully acknowledged!` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transfer acknowledgment failure:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 12. Direct Assets Allocation endpoints
// Issue Stock to Technician
app.post('/api/serialized/issue', async (req, res) => {
  const { sns, techId } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sn of sns) {
      await client.query(
        "UPDATE serialized_assets SET status = 'Assigned', loc_type = 'With_Technician', loc_id = $1 WHERE sn = $2",
        [techId, sn]
      );
    }
    await client.query('COMMIT');
    res.json({ message: `${sns.length} items issued to technician ${techId}` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Deploy Stock to Customer
app.post('/api/serialized/deploy', async (req, res) => {
  const { sn, customerAcc, techId } = req.body;
  try {
    await query(
      `UPDATE serialized_assets 
       SET status = 'Deployed', loc_type = 'Installed_At_Customer', loc_id = $1,
           deployed_tech_id = $2, deployed_date = CURRENT_DATE
       WHERE sn = $3`,
      [customerAcc, techId || null, sn]
    );
    res.json({ message: `Serial ${sn} deployed to customer ${customerAcc}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Return Stock from Technician to their Branch
app.post('/api/serialized/return', async (req, res) => {
  const { sn, branchId } = req.body;
  try {
    await query(
      "UPDATE serialized_assets SET status = 'Available', loc_type = 'Branch', loc_id = $1 WHERE sn = $2",
      [branchId, sn]
    );
    res.json({ message: `Serial ${sn} returned to branch ${branchId}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deploy Core Infrastructure Asset to Branch/POP
app.post('/api/serialized/deploy-infra', async (req, res) => {
  const { sn, loc_id, infra_ip, infra_rack, infra_role } = req.body;
  try {
    // Verify target location exists
    const locRes = await query('SELECT type FROM locations WHERE id = $1', [loc_id]);
    if (locRes.rows.length === 0) {
      return res.status(404).json({ error: `Location ${loc_id} not found.` });
    }
    const locType = locRes.rows[0].type;
    
    await query(
      `UPDATE serialized_assets 
       SET status = 'Deployed_Infrastructure', 
           loc_type = 'Infrastructure', 
           loc_id = $1, 
           branch_id = $2, 
           infra_ip = $3, 
           infra_rack = $4, 
           infra_role = $5,
           infra_deployment_date = CURRENT_DATE,
           deployed_tech_id = NULL,
           deployed_date = NULL
       WHERE sn = $6`,
      [loc_id, locType === 'Branch' ? loc_id : null, infra_ip || null, infra_rack || null, infra_role || null, sn]
    );
    res.json({ message: `Serial ${sn} successfully deployed to infrastructure POP/Branch ${loc_id}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retire Core Infrastructure Asset back to Warehouse stock or Faulty
app.post('/api/serialized/retire-infra', async (req, res) => {
  const { sn, target_status, branch_id } = req.body;
  try {
    if (!['Available', 'Faulty'].includes(target_status)) {
      return res.status(400).json({ error: "Target status must be Available or Faulty." });
    }
    // Update serial position
    await query(
      `UPDATE serialized_assets 
       SET status = $1, 
           loc_type = $2, 
           loc_id = $3, 
           branch_id = $3,
           infra_ip = NULL, 
           infra_rack = NULL, 
           infra_role = NULL, 
           infra_deployment_date = NULL
       WHERE sn = $4`,
      [target_status, target_status === 'Available' ? 'Branch' : 'Faulty', branch_id, sn]
    );
    res.json({ message: `Serial ${sn} retired from infrastructure to ${target_status} at branch ${branch_id}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct Intake / Registration of Core Infrastructure Device (without PO)
app.post('/api/serialized/direct-infra-intake', async (req, res) => {
  const { 
    sn, mac, item_id, loc_id, infra_role, infra_ip, infra_rack, 
    purchase_cost, warranty_months, is_new_item, new_item_details, notes,
    devicePhoto, devicePhotoName
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if serial already exists
    const checkRes = await client.query('SELECT sn FROM serialized_assets WHERE sn = $1 FOR UPDATE', [sn]);
    if (checkRes.rows.length > 0) {
      throw new Error(`Serial number ${sn} already exists in database.`);
    }

    // Process device photo file upload
    let savedPhotoName = null;
    if (devicePhoto && devicePhotoName) {
      const matches = devicePhoto.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const fileBuffer = Buffer.from(matches[2], 'base64');
        const safeName = `device_${sn.replace(/[^a-zA-Z0-9.-]/g, '_')}_${Date.now()}_${devicePhotoName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        let uploadDir = '/var/www/stockos/uploads';
        try {
          if (!fs.existsSync('/var/www/stockos')) {
            uploadDir = path.join(__dirname, 'uploads');
          }
        } catch (e) {
          uploadDir = path.join(__dirname, 'uploads');
        }
        
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(uploadDir, safeName), fileBuffer);
        savedPhotoName = safeName;
      }
    }

    // 2. If new item definition, insert it into catalog
    let finalItemId = item_id;
    if (is_new_item && new_item_details) {
      const { name, category, uom, reorder, unit_cost } = new_item_details;
      await client.query(
        'INSERT INTO items (id, name, category, uom, reorder, unit_cost, is_infrastructure) VALUES ($1, $2, $3, $4, $5, $6, TRUE)',
        [item_id, name, category, uom, reorder, unit_cost]
      );
    }

    // 3. Verify target location exists
    const locRes = await client.query('SELECT type FROM locations WHERE id = $1', [loc_id]);
    if (locRes.rows.length === 0) {
      throw new Error(`Destination POP/Branch node location ${loc_id} not found.`);
    }
    const locType = locRes.rows[0].type;

    // 4. Insert serialized asset directly as deployed infrastructure
    await client.query(
      `INSERT INTO serialized_assets (
         sn, mac, item_id, loc_type, loc_id, status, purchase_cost, warranty_months, 
         branch_id, infra_ip, infra_rack, infra_role, infra_deployment_date, invoice_no, notes, device_photo
       ) VALUES ($1, $2, $3, 'Infrastructure', $4, 'Deployed_Infrastructure', $5, $6, $7, $8, $9, $10, CURRENT_DATE, 'DIRECT-INTAKE', $11, $12)`,
      [
        sn,
        mac || null,
        finalItemId,
        loc_id,
        parseFloat(purchase_cost || 0),
        parseInt(warranty_months || 12),
        locType === 'Branch' ? loc_id : null,
        infra_ip || null,
        infra_rack || null,
        infra_role || null,
        notes || null,
        savedPhotoName
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: `Device ${sn} successfully registered directly at ${loc_id}` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Direct infrastructure intake failed:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Bulk Import/Intake of Serialized Assets or Consumable Stock
app.post('/api/serialized/bulk-import', async (req, res) => {
  const { 
    item_id, loc_id, serials, purchase_cost, warranty_months, is_new_item, new_item_details, qty, batch, import_mode 
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. If new item definition, insert it into catalog
    let finalItemId = item_id;
    if (is_new_item && new_item_details) {
      const { name, category, uom, reorder, unit_cost } = new_item_details;
      await client.query(
        'INSERT INTO items (id, name, category, uom, reorder, unit_cost, is_infrastructure) VALUES ($1, $2, $3, $4, $5, $6, FALSE)',
        [item_id, name, category, uom, reorder, unit_cost]
      );
    }

    // 2. Verify target location exists
    const locRes = await client.query('SELECT type FROM locations WHERE id = $1', [loc_id]);
    if (locRes.rows.length === 0) {
      throw new Error(`Location ${loc_id} not found.`);
    }
    const locType = locRes.rows[0].type;
    const resolvedLocType = locType === 'Central' ? 'Central_Warehouse' : 'Branch';

    // 3. Determine if the item is an Asset or Consumable
    const itemCheck = await client.query('SELECT category, unit_cost FROM items WHERE id = $1', [finalItemId]);
    if (itemCheck.rows.length === 0) {
      throw new Error(`Item ${finalItemId} not found in catalog.`);
    }
    const isConsumable = itemCheck.rows[0].category === 'Consumable';

    if (isConsumable) {
      // 4a. Process Consumable Import
      const importQty = parseInt(qty || 0);
      const finalBatch = batch ? String(batch).trim() : `BULK-${Date.now()}`;
      if (importQty <= 0) {
        throw new Error('Import quantity for consumables must be greater than zero.');
      }

      const existing = await client.query(
        'SELECT id, qty FROM consumable_stock WHERE item_id = $1 AND loc_id = $2 AND batch = $3 FOR UPDATE',
        [finalItemId, loc_id, finalBatch]
      );

      const finalCost = purchase_cost != null ? parseFloat(purchase_cost) : parseFloat(itemCheck.rows[0].unit_cost || 0);

      if (existing.rows.length > 0) {
        await client.query(
          'UPDATE consumable_stock SET qty = qty + $1 WHERE id = $2',
          [importQty, existing.rows[0].id]
        );
      } else {
        const newStockId = 'CS' + String(Date.now()).slice(-8) + Math.floor(Math.random() * 10);
        await client.query(
          'INSERT INTO consumable_stock (id, item_id, loc_id, qty, unit_cost, batch) VALUES ($1, $2, $3, $4, $5, $6)',
          [newStockId, finalItemId, loc_id, importQty, finalCost, finalBatch]
        );
      }

      await client.query('COMMIT');
      return res.status(201).json({
        success: true,
        message: `Successfully imported ${importQty} units of consumable item "${finalItemId}" into location "${loc_id}".`
      });

    } else {
      // 4b. Process Asset Import (Serials)
      if (!serials || !Array.isArray(serials) || serials.length === 0) {
        throw new Error('Please provide an array of serial numbers for Asset import.');
      }

      const skippedSerials = [];
      const insertedSerials = [];
      for (const entry of serials) {
        let trimmedSn = '';
        let customerAcc = null;

        if (typeof entry === 'object' && entry !== null) {
          trimmedSn = String(entry.sn).trim();
          customerAcc = entry.customer_acc ? String(entry.customer_acc).trim() : null;
        } else {
          trimmedSn = String(entry).trim();
        }

        if (!trimmedSn) continue;

        // Check duplicate
        const checkRes = await client.query('SELECT sn FROM serialized_assets WHERE sn = $1', [trimmedSn]);
        if (checkRes.rows.length > 0) {
          skippedSerials.push(trimmedSn);
          continue;
        }

        const isDeployed = import_mode === 'Deployed' && customerAcc;
        const locType = isDeployed ? 'Installed_At_Customer' : resolvedLocType;
        const finalLocId = isDeployed ? customerAcc : loc_id;
        const status = isDeployed ? 'Deployed' : 'Available';

        await client.query(
          `INSERT INTO serialized_assets (
             sn, mac, item_id, loc_type, loc_id, status, purchase_cost, warranty_months, 
             branch_id, invoice_no, po_id, deployed_date
           ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, 'BULK-IMPORT', NULL, $9)`,
          [
            trimmedSn,
            finalItemId,
            locType,
            finalLocId,
            status,
            purchase_cost != null ? parseFloat(purchase_cost) : null,
            parseInt(warranty_months || 12),
            loc_id,
            isDeployed ? new Date() : null
          ]
        );
        insertedSerials.push(trimmedSn);
      }

      await client.query('COMMIT');
      return res.status(201).json({ 
        success: true, 
        message: `Successfully imported ${insertedSerials.length} serials. Skipped ${skippedSerials.length} duplicates.`,
        inserted_count: insertedSerials.length,
        skipped_count: skippedSerials.length,
        skipped_serials: skippedSerials
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk import failed:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Swap Damaged Asset at Customer (Case 1: Router Damage → Replace & Return Faulty to Central)
app.post('/api/serialized/swap-damaged', async (req, res) => {
  const { faultySn, replacementSn, customerAcc, techId, branchId } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify faulty asset exists and is currently deployed
    const faultyRes = await client.query('SELECT * FROM serialized_assets WHERE sn = $1', [faultySn]);
    if (faultyRes.rows.length === 0) throw new Error('Faulty asset not found');

    // 2. Verify replacement asset exists and is available
    const replRes = await client.query('SELECT * FROM serialized_assets WHERE sn = $1', [replacementSn]);
    if (replRes.rows.length === 0) throw new Error('Replacement asset not found');
    if (replRes.rows[0].status !== 'Available') throw new Error('Replacement asset is not available');

    // 3. Mark faulty asset → Faulty + In Transit (will go to Central after acknowledgment)
    const transferId = 'TRF' + String(Date.now()).slice(-7);
    await client.query(
      `UPDATE serialized_assets 
       SET status = 'Faulty', loc_type = 'In_Transit', loc_id = $1,
           deployed_tech_id = NULL, deployed_date = NULL
       WHERE sn = $2`,
      [transferId, faultySn]
    );

    // 4. Deploy replacement to same customer
    await client.query(
      `UPDATE serialized_assets 
       SET status = 'Deployed', loc_type = 'Installed_At_Customer', loc_id = $1,
           deployed_tech_id = $2, deployed_date = CURRENT_DATE
       WHERE sn = $3`,
      [customerAcc, techId || null, replacementSn]
    );

    // 5. Create transfer record as In_Transit (needs acknowledgment at Central)
    await client.query(
      `INSERT INTO transfers (id, from_loc, to_loc, status, created, notes, created_by) 
       VALUES ($1, $2, 'LOC001', 'In_Transit', CURRENT_DATE, $3, $4)`,
      [transferId, branchId || 'LOC001', 
       `Faulty asset return: ${faultySn} (swapped with ${replacementSn}) for customer ${customerAcc}`,
       'System — Asset Swap']
    );
    await client.query(
      `INSERT INTO transfer_items (transfer_id, item_id, serials, qty) VALUES ($1, $2, $3, 1)`,
      [transferId, faultyRes.rows[0].item_id, [faultySn]]
    );

    await client.query('COMMIT');
    res.json({ message: `Swap done! ${replacementSn} deployed to ${customerAcc}. Faulty ${faultySn} sent to Transfer Hub (${transferId}) — awaiting acknowledgment at Central.`, transferId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Asset swap failed:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Recover Asset from Customer (Case 2: Non-Renewal → Return to Branch Stock)
app.post('/api/serialized/recover-from-customer', async (req, res) => {
  const { sn, branchId } = req.body;
  try {
    // Verify asset exists and is deployed
    const assetRes = await query('SELECT * FROM serialized_assets WHERE sn = $1', [sn]);
    if (assetRes.rows.length === 0) throw new Error('Asset not found');

    const locType = branchId === 'LOC001' ? 'Central_Warehouse' : 'Branch';
    await query(
      `UPDATE serialized_assets 
       SET status = 'Available', loc_type = $1, loc_id = $2,
           deployed_tech_id = NULL, deployed_date = NULL
       WHERE sn = $3`,
      [locType, branchId, sn]
    );
    res.json({ message: `Asset ${sn} recovered from customer and returned to branch ${branchId} as available stock` });
  } catch (err) {
    console.error('Customer asset recovery failed:', err);
    res.status(400).json({ error: err.message });
  }
});

// Mark Serial Asset as Faulty
app.post('/api/serialized/:sn/faulty', async (req, res) => {
  const { sn } = req.params;
  try {
    // Fetch current asset details to find its branch_id
    const assetRes = await query('SELECT branch_id FROM serialized_assets WHERE sn = $1', [sn]);
    if (assetRes.rows.length === 0) throw new Error('Asset not found');
    
    const branchId = assetRes.rows[0].branch_id || 'LOC001';
    const locType = branchId === 'LOC001' ? 'Central_Warehouse' : 'Branch';
    
    await query(
      `UPDATE serialized_assets 
       SET status = 'Faulty', 
           loc_type = $1, 
           loc_id = $2 
       WHERE sn = $3`,
      [locType, branchId, sn]
    );
    res.json({ message: `Serial ${sn} marked as faulty` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Return Faulty Asset to Vendor (Warranty Claim)
app.post('/api/serialized/return-to-vendor', async (req, res) => {
  const { sn, poId, invoiceNo, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify asset exists and is faulty
    const assetRes = await client.query('SELECT * FROM serialized_assets WHERE sn = $1', [sn]);
    if (assetRes.rows.length === 0) throw new Error('Asset not found');
    if (assetRes.rows[0].status !== 'Faulty') throw new Error('Only faulty assets can be returned to the vendor');

    const asset = assetRes.rows[0];
    const finalPoId = poId || asset.po_id || null;

    // 2. Find vendor name and invoice number from the procurement order
    let vendorName = 'Vendor';
    let finalInvoiceNo = invoiceNo || asset.invoice_no || 'N/A';

    if (finalPoId) {
      const poRes = await client.query('SELECT vendor, invoice_no FROM procurements WHERE id = $1 LIMIT 1', [finalPoId]);
      if (poRes.rows.length > 0) {
        vendorName = poRes.rows[0].vendor;
        finalInvoiceNo = poRes.rows[0].invoice_no || finalInvoiceNo;
      }
    } else if (invoiceNo && invoiceNo !== 'N/A') {
      const poRes = await client.query('SELECT vendor FROM procurements WHERE invoice_no = $1 LIMIT 1', [invoiceNo]);
      if (poRes.rows.length > 0) {
        vendorName = poRes.rows[0].vendor;
      }
    }

    // 3. Update asset status to 'Returned_To_Vendor'
    await client.query(
      `UPDATE serialized_assets 
       SET status = 'Returned_To_Vendor', 
           loc_type = 'Returned_To_Vendor', 
           loc_id = $1, 
           invoice_no = $2,
           po_id = $3,
           return_vendor_date = CURRENT_DATE, 
           return_vendor_notes = $4,
           deployed_tech_id = NULL,
           deployed_date = NULL
       WHERE sn = $5`,
      [vendorName, finalInvoiceNo, finalPoId, notes || '', sn]
    );

    await client.query('COMMIT');
    res.json({ message: `Asset ${sn} successfully returned to vendor ${vendorName}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error returning asset to vendor:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Scrap / Write off Faulty Asset
app.post('/api/serialized/scrap', async (req, res) => {
  const { sn, reason, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify asset exists and is faulty
    const assetRes = await client.query('SELECT * FROM serialized_assets WHERE sn = $1', [sn]);
    if (assetRes.rows.length === 0) throw new Error('Asset not found');
    if (assetRes.rows[0].status !== 'Faulty') throw new Error('Only faulty assets can be scrapped');

    // 2. Update asset status to 'Scrapped'
    await client.query(
      `UPDATE serialized_assets 
       SET status = 'Scrapped', 
           loc_type = 'Scrapped', 
           loc_id = 'Scrapped', 
           scrap_date = CURRENT_DATE, 
           scrap_reason = $1,
           notes = $2,
           deployed_tech_id = NULL,
           deployed_date = NULL
       WHERE sn = $3`,
      [reason || 'Expired / Damaged', notes || '', sn]
    );

    await client.query('COMMIT');
    res.json({ message: `Asset ${sn} successfully scrapped.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error scrapping asset:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Direct Outward Sales routes
app.post('/api/serialized/sell', async (req, res) => {
  const { sns, buyer, price, ref, date, notes, source } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sn of sns) {
      await client.query(
        `UPDATE serialized_assets 
         SET status = 'Sold', loc_type = 'External_Sale', loc_id = $1, 
             sale_price = $2, sale_date = $3, invoice_no = $4, sale_notes = $5, branch_id = $6 
         WHERE sn = $7`,
        [buyer, price, date, ref, notes, source, sn]
      );
    }
    await client.query('COMMIT');
    res.json({ message: `${sns.length} items successfully sold & dispatched to ${buyer}` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/serialized/:sn/cancel-sale', async (req, res) => {
  const { sn } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const assetRes = await client.query('SELECT branch_id FROM serialized_assets WHERE sn = $1', [sn]);
    if (assetRes.rows.length === 0) throw new Error('Asset not found');
    
    const branchId = assetRes.rows[0].branch_id || 'LOC001';
    await client.query(
      `UPDATE serialized_assets 
       SET status = 'Available', loc_type = 'Branch', loc_id = $1, 
           sale_price = NULL, sale_date = NULL, invoice_no = NULL, sale_notes = NULL 
       WHERE sn = $2`,
      [branchId, sn]
    );
    await client.query('COMMIT');
    res.json({ message: `Direct sale cancelled for serial ${sn}` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Bulk Direct Sales Cancellation REST API
app.post('/api/serialized/cancel-bulk-sale', async (req, res) => {
  const { sns } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sn of sns) {
      const assetRes = await client.query('SELECT branch_id FROM serialized_assets WHERE sn = $1', [sn]);
      if (assetRes.rows.length > 0) {
        const branchId = assetRes.rows[0].branch_id || 'LOC001';
        await client.query(
          `UPDATE serialized_assets 
           SET status = 'Available', loc_type = 'Branch', loc_id = $1, 
               sale_price = NULL, sale_date = NULL, invoice_no = NULL, sale_notes = NULL 
           WHERE sn = $2`,
          [branchId, sn]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ message: `${sns.length} serials returned to available inventory successfully.` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/users/change-password', async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Get user details from database or hardcoded config
    let userRecord = null;
    
    // Check database first
    const dbRes = await client.query('SELECT * FROM branch_users WHERE email = $1', [email]);
    if (dbRes.rows.length > 0) {
      userRecord = dbRes.rows[0];
    }
    
    // If not in database, fallback to hardcoded config check
    if (!userRecord) {
      const defaultUsers = {
        'admin@fwcpl.com': { name:'Super Admin', initials:'SA', role:'super_admin', role_label:'Super Admin', location_id:null, location_name:'All Locations', password:'password' },
        'central@fwcpl.com': { name:'Central Manager', initials:'CM', role:'central_manager', role_label:'Central Warehouse', location_id:'LOC001', location_name:'Kathmandu Central Hub', password:'password' },
        'pokhara@fwcpl.com': { name:'Branch Storekeeper', initials:'BS', role:'branch_storekeeper', role_label:'Pokhara Branch Storekeeper', location_id:'LOC002', location_name:'Pokhara Branch', password:'password' },
      };
      userRecord = defaultUsers[email];
    }
    
    if (!userRecord) {
      throw new Error('User account not found.');
    }
    
    if (userRecord.password !== currentPassword) {
      throw new Error('Incorrect current password.');
    }
    
    // 2. Write/Update password in database
    await client.query(
      `INSERT INTO branch_users (email, name, initials, role, role_label, location_id, location_name, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password`,
      [
        email,
        userRecord.name,
        userRecord.initials,
        userRecord.role,
        userRecord.role_label,
        userRecord.location_id,
        userRecord.location_name || 'Branch Office',
        newPassword
      ]
    );
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to change password:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════════════════════════════════════════════════════
// SYSTEM RE-SEED & RESET (For user trial & clearing all transaction logs)
// ══════════════════════════════════════════════════════════════════════════════════
app.post('/api/reset', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Truncate dynamic ledger data
    await client.query('TRUNCATE payouts CASCADE');
    await client.query('TRUNCATE branch_users CASCADE');
    await client.query('TRUNCATE consumable_logs CASCADE');
    await client.query('TRUNCATE tech_consumable_stock CASCADE');
    await client.query('TRUNCATE transfer_items CASCADE');
    await client.query('TRUNCATE transfers CASCADE');
    await client.query('TRUNCATE requisition_items CASCADE');
    await client.query('TRUNCATE requisitions CASCADE');
    await client.query('TRUNCATE procurement_items CASCADE');
    await client.query('TRUNCATE procurements CASCADE');
    await client.query('TRUNCATE consumable_stock CASCADE');
    await client.query('TRUNCATE serialized_assets CASCADE');
    await client.query('TRUNCATE technicians CASCADE');
    await client.query('TRUNCATE items CASCADE');
    await client.query('TRUNCATE locations CASCADE');

    // 2. Seed Locations
    await client.query(`
      INSERT INTO locations (id, name, type, city, manager) VALUES
      ('LOC001', 'Kathmandu Central Hub', 'Central', 'Kathmandu', 'Rajesh Sharma'),
      ('LOC002', 'Pokhara Branch', 'Branch', 'Pokhara', 'Sita Rai'),
      ('LOC003', 'Biratnagar Branch', 'Branch', 'Biratnagar', 'Hari Thapa'),
      ('LOC004', 'Butwal Branch', 'Branch', 'Butwal', 'Meena Gurung'),
      ('LOC005', 'Dharan Branch', 'Branch', 'Dharan', 'Bikram Limbu')
    `);

    // 3. Seed Catalog
    await client.query(`
      INSERT INTO items (id, name, category, uom, reorder, unit_cost) VALUES
      ('ITM001', 'Dual Band ONU Nokia G-2425G-A', 'Asset', 'Pcs', 20, 4500.00),
      ('ITM002', 'Huawei EchoLife HG8245H5 ONT', 'Asset', 'Pcs', 15, 5200.00),
      ('ITM003', 'ZTE F680 Router (WiFi 6)', 'Asset', 'Pcs', 10, 6800.00),
      ('ITM004', 'MikroTik hAP ax² Router', 'Asset', 'Pcs', 8, 12500.00),
      ('ITM005', 'TP-Link 8-Port PoE Switch', 'Asset', 'Pcs', 5, 8900.00),
      ('ITM006', '4-Core Single Mode Optical Fiber Cable', 'Consumable', 'Meters', 500, 18.00),
      ('ITM007', '8-Core Armoured Optical Fiber Cable', 'Consumable', 'Meters', 300, 32.00),
      ('ITM008', 'RJ45 Cat6 Patch Cable (1m)', 'Consumable', 'Pcs', 50, 120.00),
      ('ITM009', 'SC/APC Fiber Connector', 'Consumable', 'Pcs', 100, 45.00),
      ('ITM010', 'Fiber Optic Splice Sleeve', 'Consumable', 'Pcs', 200, 15.00),
      ('ITM011', 'Outdoor IP67 Enclosure Box', 'Asset', 'Pcs', 5, 3200.00),
      ('ITM012', 'TP-Link CPE510 Outdoor CPE', 'Asset', 'Pcs', 6, 7800.00)
    `);

    // 4. Seed Technicians
    await client.query(`
      INSERT INTO technicians (id, name, branch_id, phone, status) VALUES
      ('TECH001', 'Anil Tamang', 'LOC002', '9841000001', 'Active'),
      ('TECH002', 'Priya Shrestha', 'LOC002', '9841000002', 'Active'),
      ('TECH003', 'Deepak Magar', 'LOC003', '9841000003', 'Active'),
      ('TECH004', 'Sunita KC', 'LOC004', '9841000004', 'Active'),
      ('TECH005', 'Raju Yadav', 'LOC005', '9841000005', 'Inactive')
    `);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Database reset and seeded to clean baseline state successfully!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reset database failure:', err);
    res.status(500).json({ error: 'Failed to reset system database' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════════════════════════════════════════════════════
// SERVER BOOTSTRAP
// ══════════════════════════════════════════════════════════════════════════════════
app.listen(port, () => {
  console.log(`🚀 StockOS Backend API Server is running on port ${port}`);
});

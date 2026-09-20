-- ══════════════════════════════════════════════════════════════════════════════════
-- FWCPL StockOS — Enterprise PostgreSQL Schema
-- ══════════════════════════════════════════════════════════════════════════════════
-- This schema establishes full relational integrity with proper constraints and indexes
-- to guarantee fast queries and database security in production.

-- Clear existing schemas if any
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS payouts CASCADE;
DROP TABLE IF EXISTS branch_users CASCADE;
DROP TABLE IF EXISTS fuel_logs CASCADE;
DROP TABLE IF EXISTS consumable_logs CASCADE;
DROP TABLE IF EXISTS tech_consumable_stock CASCADE;
DROP TABLE IF EXISTS requisition_items CASCADE;
DROP TABLE IF EXISTS requisitions CASCADE;
DROP TABLE IF EXISTS transfer_items CASCADE;
DROP TABLE IF EXISTS transfers CASCADE;
DROP TABLE IF EXISTS procurement_items CASCADE;
DROP TABLE IF EXISTS procurements CASCADE;
DROP TABLE IF EXISTS consumable_stock CASCADE;
DROP TABLE IF EXISTS serialized_assets CASCADE;
DROP TABLE IF EXISTS technicians CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS locations CASCADE;

-- 1. Locations Table
CREATE TABLE locations (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Central', 'Branch', 'POP')),
    city VARCHAR(50) NOT NULL,
    manager VARCHAR(100), -- Nullable for POPs
    manager_signature TEXT
);

-- 1b. Branch Storekeeper Users (Cross-Browser Persistence)
CREATE TABLE branch_users (
    email VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    initials VARCHAR(10) NOT NULL,
    role VARCHAR(50) NOT NULL,
    role_label VARCHAR(100) NOT NULL,
    location_id VARCHAR(20) REFERENCES locations(id) ON DELETE CASCADE,
    location_name VARCHAR(100) NOT NULL,
    password VARCHAR(100) NOT NULL
);

-- 2. Items Master Catalog
CREATE TABLE items (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('Asset', 'Consumable')),
    uom VARCHAR(50) NOT NULL,
    reorder INTEGER NOT NULL DEFAULT 10,
    unit_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00
);

-- 3. Technicians Registry
CREATE TABLE technicians (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    branch_id VARCHAR(20) REFERENCES locations(id),
    phone VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Active', 'Inactive')),
    vehicle_plate VARCHAR(50),
    vehicle_mileage DECIMAL(6, 2) DEFAULT 40.00,
    current_odometer INTEGER DEFAULT 0
);

-- 4. Serialized Assets (Hardware Inventory)
CREATE TABLE serialized_assets (
    sn VARCHAR(100) PRIMARY KEY,
    mac VARCHAR(50),
    item_id VARCHAR(20) REFERENCES items(id) ON DELETE CASCADE,
    loc_type VARCHAR(50) NOT NULL CHECK (loc_type IN ('Central_Warehouse', 'Branch', 'With_Technician', 'Installed_At_Customer', 'Faulty', 'In_Transit', 'External_Sale', 'Returned_To_Vendor', 'Infrastructure', 'Scrapped')),
    loc_id VARCHAR(100) NOT NULL, -- Holds location_id, technician_id, customer account, etc.
    status VARCHAR(50) NOT NULL CHECK (status IN ('Available', 'In_Transit', 'Assigned', 'Deployed', 'Faulty', 'Sold', 'Returned_To_Vendor', 'Deployed_Infrastructure', 'Scrapped')),
    purchase_cost DECIMAL(12, 2) NOT NULL,
    warranty_months INTEGER NOT NULL DEFAULT 12,
    sale_price DECIMAL(12, 2),
    sale_date DATE,
    invoice_no VARCHAR(100),
    po_id VARCHAR(20),
    sale_notes TEXT,
    notes TEXT,
    branch_id VARCHAR(20) REFERENCES locations(id) ON DELETE SET NULL,
    deployed_tech_id VARCHAR(20) REFERENCES technicians(id) ON DELETE SET NULL,
    deployed_date DATE,
    return_vendor_date DATE,
    return_vendor_notes TEXT,
    infra_ip VARCHAR(50),
    infra_rack VARCHAR(100),
    infra_role VARCHAR(100),
    infra_deployment_date DATE,
    scrap_date DATE,
    scrap_reason TEXT,
    device_photo VARCHAR(255)
);

-- 5. Bulk Consumable Stock Levels
CREATE TABLE consumable_stock (
    id VARCHAR(20) PRIMARY KEY,
    item_id VARCHAR(20) REFERENCES items(id) ON DELETE CASCADE,
    loc_id VARCHAR(20) REFERENCES locations(id) ON DELETE CASCADE,
    qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
    unit_cost DECIMAL(12, 2) NOT NULL,
    batch VARCHAR(100) NOT NULL
);

-- 5b. Technician Wallet Consumable Stock
CREATE TABLE tech_consumable_stock (
    id VARCHAR(20) PRIMARY KEY,
    tech_id VARCHAR(20) REFERENCES technicians(id) ON DELETE CASCADE,
    item_id VARCHAR(20) REFERENCES items(id) ON DELETE CASCADE,
    qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
    unit_cost DECIMAL(12, 2) NOT NULL
);

-- 6. Purchase Orders (Procurements)
CREATE TABLE procurements (
    id VARCHAR(20) PRIMARY KEY,
    vendor VARCHAR(200) NOT NULL,
    total DECIMAL(12, 2) NOT NULL,
    date DATE NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Received', 'Pending')),
    invoice_no VARCHAR(100),
    invoice_file VARCHAR(255),
    amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'Unpaid' CHECK (payment_status IN ('Unpaid', 'Partially_Paid', 'Fully_Paid'))
);

-- 6b. Procurement Line Items
CREATE TABLE procurement_items (
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

-- 7. Inter-Location Transfers
CREATE TABLE transfers (
    id VARCHAR(20) PRIMARY KEY,
    from_loc VARCHAR(20) REFERENCES locations(id) ON DELETE RESTRICT,
    to_loc VARCHAR(20) REFERENCES locations(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'In_Transit', 'Completed')),
    created DATE NOT NULL,
    notes TEXT,
    created_by VARCHAR(100) NOT NULL,
    dispatched_by VARCHAR(100),
    acknowledged_by VARCHAR(100)
);

-- 8. Items Included in Transfers
CREATE TABLE transfer_items (
    id SERIAL PRIMARY KEY,
    transfer_id VARCHAR(20) REFERENCES transfers(id) ON DELETE CASCADE,
    item_id VARCHAR(20) REFERENCES items(id),
    serials TEXT[], -- Arrays are highly optimized in PostgreSQL
    qty INTEGER NOT NULL
);

-- 9. Stock Requisitions
CREATE TABLE requisitions (
    id VARCHAR(20) PRIMARY KEY,
    from_loc VARCHAR(20) REFERENCES locations(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'Approved', 'Fulfilled', 'Rejected')),
    created DATE NOT NULL,
    notes TEXT,
    created_by VARCHAR(100) NOT NULL
);

-- 10. Items in Requisitions
CREATE TABLE requisition_items (
    id SERIAL PRIMARY KEY,
    requisition_id VARCHAR(20) REFERENCES requisitions(id) ON DELETE CASCADE,
    item_id VARCHAR(20) REFERENCES items(id),
    qty INTEGER NOT NULL CHECK (qty > 0)
);

-- 11. Consumable Usage Audit Logs
CREATE TABLE consumable_logs (
    id VARCHAR(20) PRIMARY KEY,
    item_id VARCHAR(20) REFERENCES items(id),
    loc_id VARCHAR(20) REFERENCES locations(id),
    qty_used INTEGER NOT NULL CHECK (qty_used > 0),
    customer_acc VARCHAR(100),
    date DATE NOT NULL,
    tech_id VARCHAR(20) REFERENCES technicians(id),
    notes TEXT,
    latitude VARCHAR(50),
    longitude VARCHAR(50)
);

-- 12. Payouts & Accounts Payable Ledger
CREATE TABLE payouts (
    id VARCHAR(20) PRIMARY KEY,
    po_id VARCHAR(20) REFERENCES procurements(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('Cash', 'Bank_Transfer', 'Cheque', 'Other')),
    date DATE NOT NULL,
    notes TEXT,
    payout_file VARCHAR(255)
);

-- ══════════════════════════════════════════════════════════════════════════════════
-- 🔍 SPEED OPTIMIZATION INDEXES
-- ══════════════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_assets_item ON serialized_assets(item_id);
CREATE INDEX idx_assets_location ON serialized_assets(loc_type, loc_id);
CREATE INDEX idx_assets_status ON serialized_assets(status);
CREATE INDEX idx_consumables_lookup ON consumable_stock(item_id, loc_id);
CREATE INDEX idx_procurements_date ON procurements(date);
CREATE INDEX idx_transfers_status ON transfers(status);
CREATE INDEX idx_requisitions_status ON requisitions(status);
CREATE INDEX idx_logs_tech ON consumable_logs(tech_id);
CREATE INDEX idx_logs_customer ON consumable_logs(customer_acc);
CREATE INDEX idx_payouts_po ON payouts(po_id);
CREATE INDEX idx_tech_consumables ON tech_consumable_stock(tech_id);

-- ══════════════════════════════════════════════════════════════════════════════════
-- 🌱 SEED DATABASE INITIAL BASELINE DATA
-- ══════════════════════════════════════════════════════════════════════════════════

-- Seed Locations
INSERT INTO locations (id, name, type, city, manager) VALUES
('LOC001', 'Kathmandu Central Hub', 'Central', 'Kathmandu', 'Rajesh Sharma'),
('LOC002', 'Pokhara Branch', 'Branch', 'Pokhara', 'Sita Rai'),
('LOC003', 'Biratnagar Branch', 'Branch', 'Biratnagar', 'Hari Thapa'),
('LOC004', 'Butwal Branch', 'Branch', 'Butwal', 'Meena Gurung'),
('LOC005', 'Dharan Branch', 'Branch', 'Dharan', 'Bikram Limbu');

-- Seed Catalog Items
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
('ITM012', 'TP-Link CPE510 Outdoor CPE', 'Asset', 'Pcs', 6, 7800.00);

-- Seed Technicians
INSERT INTO technicians (id, name, branch_id, phone, status, vehicle_plate, vehicle_mileage, current_odometer) VALUES
('TECH001', 'Anil Tamang', 'LOC002', '9841000001', 'Active', 'BA 3 PA 8812', 42.50, 14200),
('TECH002', 'Priya Shrestha', 'LOC002', '9841000002', 'Active', 'BA 2 PA 1198', 38.00, 8950),
('TECH003', 'Deepak Magar', 'LOC003', '9841000003', 'Active', 'KO 1 PA 4421', 40.00, 23400),
('TECH004', 'Sunita KC', 'LOC004', '9841000004', 'Active', 'LU 2 PA 6752', 45.00, 11200),
('TECH005', 'Raju Yadav', 'LOC005', '9841000005', 'Inactive', 'ME 1 PA 9928', 35.00, 3100);

-- 13. Technician Fuel & Trip Logs
CREATE TABLE fuel_logs (
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

-- Seed Fuel Logs
INSERT INTO fuel_logs (id, tech_id, date, start_odo, end_odo, distance, refuel_liters, refuel_cost, expected_liters, discrepancy, notes) VALUES
('FL001', 'TECH001', '2026-06-01', 14000, 14120, 120, 3.00, 480.00, 2.82, FALSE, 'Pragatinagar installation trips'),
('FL002', 'TECH001', '2026-06-02', 14120, 14200, 80, 5.00, 800.00, 1.88, TRUE, 'Short trip but refueled high amount of fuel');

CREATE INDEX idx_fuel_logs_tech ON fuel_logs(tech_id);

-- Foreign key constraints added at end to prevent creation order issues
ALTER TABLE serialized_assets ADD CONSTRAINT fk_serialized_assets_po FOREIGN KEY (po_id) REFERENCES procurements(id) ON DELETE SET NULL;

-- 14. System Settings Table
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO system_settings (key, value) VALUES
('smtp_host', 'mail.fiberworld.net.np'),
('smtp_port', '465'),
('smtp_user', 'rijan.koirala@fiberworld.net.np'),
('smtp_pass', 'Rijan@123'),
('notification_emails', 'koiralarijan8@gmail.com');



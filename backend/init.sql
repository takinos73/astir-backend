/* =====================================================
   LINES
===================================================== */

CREATE TABLE IF NOT EXISTS lines (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,   -- L1, L2, L3...
    description TEXT
);

/* =====================================================
   ASSETS  (REAL MACHINES WITH SERIAL NUMBER)
===================================================== */

CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    line_id INTEGER NOT NULL REFERENCES lines(id) ON DELETE RESTRICT,
    model TEXT NOT NULL,           -- PMC250, PTC027
    serial_number TEXT NOT NULL,   -- 437062
    description TEXT,
    active BOOLEAN DEFAULT true,
    UNIQUE (serial_number)
);

/* =====================================================
   MAINTENANCE TASKS
===================================================== */

CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id SERIAL PRIMARY KEY,

    -- 🔑 NEW: real machine (asset)
    asset_id INTEGER REFERENCES assets(id) ON DELETE RESTRICT,

    -- ⛔ TEMP legacy fields (DO NOT REMOVE YET)
    machine_id INTEGER,
    section TEXT,
    unit TEXT,
    task TEXT NOT NULL,
    type TEXT,
    qty NUMERIC,
    duration_min INTEGER,
    frequency_hours INTEGER,
    due_date TIMESTAMPTZ,

    status TEXT DEFAULT 'Planned',
    is_planned BOOLEAN DEFAULT true,
    notes TEXT,

    completed_by TEXT,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

/* =====================================================
   SAFETY INDEXES
===================================================== */

CREATE INDEX IF NOT EXISTS idx_tasks_asset_id
ON maintenance_tasks(asset_id);

CREATE INDEX IF NOT EXISTS idx_assets_line
ON assets(line_id);

/* =====================================================
   BASE LINE DATA (SAFE INSERT)
===================================================== */

INSERT INTO lines (code) VALUES
('L1'), ('L2'), ('L3'), ('L4'), ('L5'), ('L6'), ('L7')
ON CONFLICT (code) DO NOTHING;


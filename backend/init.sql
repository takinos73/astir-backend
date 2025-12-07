-- Create machines table
CREATE TABLE IF NOT EXISTS machines (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    sn TEXT
);

-- Safety: ensure SN exists
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS sn TEXT;
ALTER TABLE machines
ADD CONSTRAINT unique_machine_name UNIQUE(name);

-- Insert initial machine records (safe insert)
INSERT INTO machines (name) VALUES
('PMC250'),
('PMC300'),
('PMC500'),
('PTC027')
ON CONFLICT (name) DO NOTHING;

--------------------------------------------------

-- Create maintenance tasks table
CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
    section TEXT,
    unit TEXT,
    task TEXT NOT NULL,
    type TEXT,
    qty INTEGER,
    duration_min INTEGER,
    frequency_hours INTEGER,
    due_date TIMESTAMPTZ,
    status TEXT DEFAULT 'Planned',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE maintenance_tasks
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();



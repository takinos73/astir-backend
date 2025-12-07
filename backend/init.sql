-- Create machines table first
CREATE TABLE IF NOT EXISTS machines (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    sn TEXT
);

-- Add SN column if missing (safety)
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS sn TEXT;

-- Create maintenance_tasks table (linked to machines)
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


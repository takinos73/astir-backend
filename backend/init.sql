CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id SERIAL PRIMARY KEY,
    machine TEXT NOT NULL,
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


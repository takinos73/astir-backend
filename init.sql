CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    description TEXT NOT NULL,
    frequency VARCHAR(50),
    last_done DATE,
    next_due DATE,
    status VARCHAR(20) DEFAULT 'Pending'
);

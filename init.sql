-- BG-Wealth — Database Initialization Script
-- This script runs automatically on first PostgreSQL container startup.
-- Sequelize handles table creation and migration via sync({ alter: true }).

-- Create the database (if not already created by POSTGRES_DB env var)
SELECT 'CREATE DATABASE "bg-wealth"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'bg-wealth')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE "bg-wealth" TO postgres;

-- Connect to the bg-wealth database
\c "bg-wealth"

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Log success
DO $$
BEGIN
    RAISE NOTICE '✅ BG-Wealth database initialized successfully!';
END $$;

import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

// load environment variables
dotenv.config();

// Database connection configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Query function
export const query = (text: string, params: any[]) => pool.query(text, params);

// Transaction support
export const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// Initialize database tables
export async function initDb() {
  try {
    // Create platform address table
    await query(`
      CREATE TABLE IF NOT EXISTS platform_address(
        id SERIAL PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        index INTEGER,
        is_used BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `, []);

    // Create did table
    await query(`
      CREATE TABLE IF NOT EXISTS did(
        id SERIAL PRIMARY KEY,
        platform_address_index INTEGER,
        did TEXT UNIQUE,
        metadata TEXT,
        secret TEXT,
        status INTEGER DEFAULT 0,
        sender TEXT,
        signature TEXT,
        tx_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `, []);

    // Ensure platform address index uniqueness
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_address_index
       ON platform_address(index)`,
      []
    );
    
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database tables:', error);
    throw error;
  }
}
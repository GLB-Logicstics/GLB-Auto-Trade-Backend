import pg from 'pg'
import { config } from './config.js'

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: config.serverless ? 3 : 10 })

export async function query(text, params = []) {
  const result = await pool.query(text, params)
  return result.rows
}

export async function queryOne(text, params = []) {
  const rows = await query(text, params)
  return rows[0] || null
}

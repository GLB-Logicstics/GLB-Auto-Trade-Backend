import { hashPassword } from './auth.js'
import { pool } from './db.js'

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const password = process.env.ADMIN_PASSWORD || ''

if (!email || !password) {
    console.error('.env faylında ADMIN_EMAIL və ADMIN_PASSWORD yazılmalıdır')
    process.exit(1)
}

try {
    const result = await pool.query(
        `insert into admins (name, email, password_hash, role, is_active) values ($1, $2, $3, 'developer', true)
     on conflict (email) do update set password_hash = excluded.password_hash, role = 'developer', is_active = true
     returning id, email`,
        [process.env.ADMIN_NAME || 'Admin', email, hashPassword(password)],
    )
    console.log(`Admin hazırdır: ${result.rows[0].email}`)
} catch (error) {
    console.error(error.message)
    process.exitCode = 1
} finally {
    await pool.end()
}
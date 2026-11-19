import { readFile } from 'node:fs/promises'
import { hashPassword } from './auth.js'
import { collections, slugify } from './collections.js'
import { pool } from './db.js'

const reset = process.argv.includes('--reset')
const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')
const seed = JSON.parse(await readFile(new URL('../db/seed.json', import.meta.url), 'utf8'))
const tables = [...Object.keys(collections), 'settings', 'shipping_prices', 'requests', 'admins']

const client = await pool.connect()

try {
  await client.query('begin')

  if (reset) await client.query(`drop table if exists ${tables.join(', ')}`)
  await client.query(schema)

  for (const [name, collection] of Object.entries(collections)) {
    const items = seed.collections[name] || []

    for (const [index, item] of items.entries()) {
      const id = item.id || index + 1
      const slug = item.slug ? slugify(item.slug) : null
      await client.query(
        `insert into ${name} (id, slug, title, sort_order, data) values ($1, $2, $3, $4, $5)
         on conflict (id) do nothing`,
        [id, slug, collection.title(item) || '', index, JSON.stringify(item)],
      )
    }

    await client.query(`select setval(pg_get_serial_sequence('${name}', 'id'), greatest((select max(id) from ${name}), 1))`)
  }

  for (const [key, value] of Object.entries(seed.settings)) {
    await client.query('insert into settings (key, value) values ($1, $2) on conflict (key) do nothing', [key, JSON.stringify(value)])
  }

  for (const row of seed.shipping) {
    await client.query(
      'insert into shipping_prices (auction, location, price) values ($1, $2, $3) on conflict (auction, location) do nothing',
      [row.auction, row.location, row.price],
    )
  }

  const email = (process.env.ADMIN_EMAIL || 'admin@glb.az').toLowerCase()
  await client.query(
    'insert into admins (name, email, password_hash) values ($1, $2, $3) on conflict (email) do nothing',
    [process.env.ADMIN_NAME || 'Admin', email, hashPassword(process.env.ADMIN_PASSWORD || 'admin123')],
  )

  await client.query('commit')
  console.log(reset ? 'Baza sıfırlandı və dolduruldu' : 'Baza hazırdır')
} catch (error) {
  await client.query('rollback')
  console.error(error)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

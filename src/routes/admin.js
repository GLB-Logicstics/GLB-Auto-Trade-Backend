import { writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { checkPassword, createToken, requireAdmin } from '../auth.js'
import { collections, findCollection, settingKeys, slugify, toAdminItem } from '../collections.js'
import { config } from '../config.js'
import { query, queryOne } from '../db.js'

export const adminRoutes = Router()

const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']
const REQUEST_STATUSES = ['new', 'in_progress', 'done', 'cancelled']

adminRoutes.post('/login', async (req, res) => {
  const { email = '', password = '' } = req.body || {}
  const admin = await queryOne('select * from admins where email = $1', [email.trim().toLowerCase()])

  if (!admin || !checkPassword(password, admin.password_hash)) {
    return res.status(401).json({ message: 'E-poçt və ya şifrə yanlışdır' })
  }

  res.json({ token: createToken(admin), admin: { id: admin.id, name: admin.name, email: admin.email } })
})

adminRoutes.use(requireAdmin)

adminRoutes.get('/me', async (req, res) => {
  res.json(await queryOne('select id, name, email from admins where id = $1', [req.admin.id]))
})

adminRoutes.get('/stats', async (req, res) => {
  const counts = []
  for (const [name, collection] of Object.entries(collections)) {
    const row = await queryOne(`select count(*)::int as total, count(*) filter (where is_active)::int as active from ${name}`)
    counts.push({ name, label: collection.label, ...row })
  }

  const requests = await queryOne(
    `select count(*)::int as total, count(*) filter (where status = 'new')::int as new from requests`,
  )
  const shipping = await queryOne('select count(*)::int as total from shipping_prices')
  const latestRequests = await query('select * from requests order by created_at desc limit 5')

  res.json({ counts, requests, shipping, latestRequests })
})

function getCollection(req, res) {
  const collection = findCollection(req.params.name)
  if (!collection) res.status(404).json({ message: 'Bölmə tapılmadı' })
  return collection
}

function itemValues(collection, body) {
  const data = body.data || {}
  const title = collection.title(data) || ''
  const slug = data.slug !== undefined ? slugify(data.slug || title) || null : null
  return { data, title, slug, isActive: body.isActive !== false, sortOrder: Number(body.sortOrder) || 0 }
}

adminRoutes.get('/collections', (req, res) => {
  res.json(Object.entries(collections).map(([name, collection]) => ({ name, label: collection.label })))
})

adminRoutes.get('/collections/:name', async (req, res) => {
  if (!getCollection(req, res)) return

  const search = `%${String(req.query.search || '').trim()}%`
  const rows = await query(`select * from ${req.params.name} where title ilike $1 order by sort_order, id`, [search])
  res.json(rows.map(toAdminItem))
})

adminRoutes.get('/collections/:name/:id', async (req, res) => {
  if (!getCollection(req, res)) return

  const row = await queryOne(`select * from ${req.params.name} where id = $1`, [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })
  res.json(toAdminItem(row))
})

adminRoutes.post('/collections/:name', async (req, res) => {
  const collection = getCollection(req, res)
  if (!collection) return

  const item = itemValues(collection, req.body || {})
  if (item.slug) item.data.slug = item.slug

  const row = await queryOne(
    `insert into ${req.params.name} (slug, title, is_active, sort_order, data)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [item.slug, item.title, item.isActive, item.sortOrder, JSON.stringify(item.data)],
  )
  res.status(201).json(toAdminItem(row))
})

adminRoutes.put('/collections/:name/:id', async (req, res) => {
  const collection = getCollection(req, res)
  if (!collection) return

  const item = itemValues(collection, req.body || {})
  if (item.slug) item.data.slug = item.slug

  const row = await queryOne(
    `update ${req.params.name}
     set slug = $1, title = $2, is_active = $3, sort_order = $4, data = $5, updated_at = now()
     where id = $6
     returning *`,
    [item.slug, item.title, item.isActive, item.sortOrder, JSON.stringify(item.data), req.params.id],
  )
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })
  res.json(toAdminItem(row))
})

adminRoutes.delete('/collections/:name/:id', async (req, res) => {
  if (!getCollection(req, res)) return

  const row = await queryOne(`delete from ${req.params.name} where id = $1 returning id`, [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })
  res.json(row)
})

adminRoutes.get('/settings', async (req, res) => {
  const rows = await query('select key, value, updated_at from settings order by key')
  res.json(rows)
})

adminRoutes.put('/settings/:key', async (req, res) => {
  if (!settingKeys.includes(req.params.key)) return res.status(404).json({ message: 'Ayar tapılmadı' })

  const row = await queryOne(
    `insert into settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()
     returning key, value, updated_at`,
    [req.params.key, JSON.stringify(req.body.value)],
  )
  res.json(row)
})

adminRoutes.get('/shipping', async (req, res) => {
  const search = `%${String(req.query.search || '').trim()}%`
  const auction = String(req.query.auction || '')
  const rows = await query(
    `select id, auction, location, price::float as price, updated_at
     from shipping_prices
     where ($1 = '' or auction = $1) and location ilike $2
     order by auction, location`,
    [auction, search],
  )
  res.json(rows)
})

adminRoutes.post('/shipping', async (req, res) => {
  const { auction = '', location = '', price = 0 } = req.body || {}
  if (!auction.trim() || !location.trim()) return res.status(400).json({ message: 'Auksion və meydança mütləqdir' })

  const row = await queryOne(
    `insert into shipping_prices (auction, location, price) values ($1, $2, $3)
     on conflict (auction, location) do update set price = excluded.price, updated_at = now()
     returning id, auction, location, price::float as price, updated_at`,
    [auction.trim(), location.trim().toUpperCase(), Number(price) || 0],
  )
  res.status(201).json(row)
})

adminRoutes.put('/shipping/:id', async (req, res) => {
  const row = await queryOne(
    `update shipping_prices set price = $1, updated_at = now()
     where id = $2
     returning id, auction, location, price::float as price, updated_at`,
    [Number(req.body.price) || 0, req.params.id],
  )
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })
  res.json(row)
})

adminRoutes.delete('/shipping/:id', async (req, res) => {
  const row = await queryOne('delete from shipping_prices where id = $1 returning id', [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })
  res.json(row)
})

adminRoutes.get('/requests', async (req, res) => {
  const status = String(req.query.status || '')
  const rows = await query(`select * from requests where ($1 = '' or status = $1) order by created_at desc`, [status])
  res.json(rows)
})

adminRoutes.put('/requests/:id', async (req, res) => {
  const { status = 'new', note = '' } = req.body || {}
  if (!REQUEST_STATUSES.includes(status)) return res.status(400).json({ message: 'Status yanlışdır' })

  const row = await queryOne('update requests set status = $1, note = $2 where id = $3 returning *', [
    status,
    note,
    req.params.id,
  ])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })
  res.json(row)
})

adminRoutes.delete('/requests/:id', async (req, res) => {
  const row = await queryOne('delete from requests where id = $1 returning id', [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })
  res.json(row)
})

adminRoutes.post('/upload', async (req, res) => {
  const { name = '', data = '' } = req.body || {}
  const type = extname(name).toLowerCase()
  if (!IMAGE_TYPES.includes(type) || !data) return res.status(400).json({ message: 'Yalnız şəkil faylı yükləmək olar' })

  const fileName = `${randomUUID()}${type}`
  const base64 = String(data).replace(/^data:[^;]+;base64,/, '')
  await writeFile(join(config.uploadsDir, fileName), Buffer.from(base64, 'base64'))

  res.status(201).json({ url: `${config.publicUrl}/uploads/${fileName}` })
})

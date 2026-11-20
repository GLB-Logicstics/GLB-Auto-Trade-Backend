import { Router } from 'express'
import { checkPassword, createToken, hashPassword, readToken } from '../auth.js'
import { slugify, toAdminItem } from '../collections.js'
import { query, queryOne } from '../db.js'
import { saveUpload } from '../upload.js'

export const userRoutes = Router()

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USER_FIELDS = 'id, name, email, phone, role, company, dealer_status as "dealerStatus", created_at as "createdAt"'

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    company: row.company,
    dealerStatus: row.dealer_status ?? row.dealerStatus,
  }
}

userRoutes.post('/register', async (req, res) => {
  const site = await queryOne("select value from settings where key = 'site'")
  if (!site || !site.value.registrationOpen) {
    return res.status(403).json({ message: 'Qeydiyyat bağlıdır. Hesab almaq üçün bizimlə əlaqə saxlayın' })
  }

  const { name = '', email = '', phone = '', password = '' } = req.body || {}
  const cleanEmail = String(email).trim().toLowerCase()

  if (!String(name).trim()) return res.status(400).json({ message: 'Adınızı yazın' })
  if (!EMAIL.test(cleanEmail)) return res.status(400).json({ message: 'E-poçt düzgün deyil' })
  if (String(password).length < 6) return res.status(400).json({ message: 'Şifrə ən azı 6 simvol olmalıdır' })

  const exists = await queryOne('select id from users where email = $1', [cleanEmail])
  if (exists) return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib' })

  const row = await queryOne(
    `insert into users (name, email, phone, password_hash) values ($1, $2, $3, $4) returning *`,
    [String(name).trim().slice(0, 100), cleanEmail, String(phone).trim().slice(0, 30), hashPassword(password)],
  )

  res.status(201).json({ token: createToken('user', row), user: publicUser(row) })
})

userRoutes.post('/login', async (req, res) => {
  const { email = '', password = '' } = req.body || {}
  const row = await queryOne('select * from users where email = $1', [String(email).trim().toLowerCase()])

  if (!row || !checkPassword(password, row.password_hash)) {
    return res.status(401).json({ message: 'E-poçt və ya şifrə yanlışdır' })
  }
  if (row.is_blocked) return res.status(403).json({ message: 'Hesabınız bloklanıb' })

  res.json({ token: createToken('user', row), user: publicUser(row) })
})

userRoutes.use(async (req, res, next) => {
  const token = readToken(req, 'user')
  const user = token ? await queryOne('select * from users where id = $1', [token.id]) : null
  if (!user || user.is_blocked) return res.status(401).json({ message: 'Giriş tələb olunur' })

  req.user = user
  next()
})

userRoutes.get('/me', (req, res) => {
  res.json(publicUser(req.user))
})

userRoutes.put('/me', async (req, res) => {
  const { name = '', phone = '', company = '' } = req.body || {}
  if (!String(name).trim()) return res.status(400).json({ message: 'Adınızı yazın' })

  const row = await queryOne(
    `update users set name = $1, phone = $2, company = $3 where id = $4 returning ${USER_FIELDS}`,
    [String(name).trim(), String(phone).trim(), String(company).trim(), req.user.id],
  )
  res.json(row)
})

userRoutes.put('/password', async (req, res) => {
  const { current = '', next: newPassword = '' } = req.body || {}
  if (!checkPassword(current, req.user.password_hash)) return res.status(400).json({ message: 'Hazırkı şifrə yanlışdır' })
  if (String(newPassword).length < 6) return res.status(400).json({ message: 'Şifrə ən azı 6 simvol olmalıdır' })

  await query('update users set password_hash = $1 where id = $2 returning id', [hashPassword(newPassword), req.user.id])
  res.json({ ok: true })
})

userRoutes.get('/requests', async (req, res) => {
  res.json(await query('select id, subject, message, status, created_at from requests where user_id = $1 order by created_at desc', [req.user.id]))
})

function requireDealer(req, res, next) {
  if (req.user.role !== 'dealer' || req.user.dealer_status !== 'approved') {
    return res.status(403).json({ message: 'Diler hesabınız hələ təsdiqlənməyib' })
  }
  next()
}

userRoutes.post('/upload', requireDealer, saveUpload)

userRoutes.get('/cars', requireDealer, async (req, res) => {
  const rows = await query(
    `select c.*,
       (select count(*)::int from car_clicks k where k.car_id = c.id) as clicks,
       (select count(*)::int from car_clicks k where k.car_id = c.id and k.created_at > now() - interval '30 days') as clicks_month
     from cars c where owner_id = $1 order by c.created_at desc`,
    [req.user.id],
  )
  res.json(rows.map((row) => ({ ...toAdminItem(row), clicks: row.clicks, clicksMonth: row.clicks_month })))
})

function dealerCar(req) {
  const data = { ...(req.body?.data || {}) }
  data.dealer = { name: req.user.company || req.user.name, phone: req.user.phone, phoneDisplay: req.user.phone }
  data.title = String(data.title || `${data.make || ''} ${data.model || ''}`).trim()
  if (!data.image && Array.isArray(data.images)) data.image = data.images[0] || ''
  return data
}

userRoutes.post('/cars', requireDealer, async (req, res) => {
  const data = dealerCar(req)
  if (!data.title) return res.status(400).json({ message: 'Avtomobilin adını yazın' })

  const slug = `${slugify(data.title)}-${Date.now().toString(36)}`
  data.slug = slug
  const row = await queryOne(
    `insert into cars (slug, title, is_active, data, owner_id) values ($1, $2, false, $3, $4) returning *`,
    [slug, data.title, JSON.stringify(data), req.user.id],
  )
  res.status(201).json(toAdminItem(row))
})

userRoutes.put('/cars/:id', requireDealer, async (req, res) => {
  const current = await queryOne('select * from cars where id = $1 and owner_id = $2', [req.params.id, req.user.id])
  if (!current) return res.status(404).json({ message: 'Tapılmadı' })

  const data = { ...dealerCar(req), slug: current.slug }
  const row = await queryOne('update cars set title = $1, data = $2, updated_at = now() where id = $3 returning *', [
    data.title,
    JSON.stringify(data),
    current.id,
  ])
  res.json(toAdminItem(row))
})

userRoutes.delete('/cars/:id', requireDealer, async (req, res) => {
  const row = await queryOne('delete from cars where id = $1 and owner_id = $2 returning id', [req.params.id, req.user.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })
  res.json(row)
})

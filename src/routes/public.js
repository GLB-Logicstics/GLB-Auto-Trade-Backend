import { Router } from 'express'
import { readToken } from '../auth.js'
import { publicCollections, toItem } from '../collections.js'
import { query, queryOne } from '../db.js'

export const publicRoutes = Router()

async function activeItems(name) {
  const rows = await query(`select * from ${name} where is_active order by sort_order, id`)
  return rows.map(toItem)
}

async function shippingMap() {
  const rows = await query('select auction, location, price::float as price from shipping_prices order by auction, location')
  const map = {}
  for (const row of rows) {
    map[row.auction] = map[row.auction] || {}
    map[row.auction][row.location] = row.price
  }
  return map
}

async function settingsMap() {
  const rows = await query('select key, value from settings')
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

async function translationsMap() {
  const rows = await query(
    `select t.lang, t.key, t.value
     from translations t join languages l on l.code = t.lang
     where l.is_active and t.value <> ''`,
  )
  const map = {}
  for (const row of rows) {
    map[row.lang] = map[row.lang] || {}
    map[row.lang][row.key] = row.value
  }
  return map
}

publicRoutes.get('/bootstrap', async (req, res) => {
  const result = {}
  for (const name of publicCollections) {
    result[name] = await activeItems(name)
  }

  result.settings = await settingsMap()
  delete result.settings.market_sync
  result.shipping = await shippingMap()
  result.languages = await query(
    'select code, name, is_default as "isDefault" from languages where is_active order by sort_order, code',
  )
  result.translations = await translationsMap()
  result.marketPrices = await query(
    'select country, make, model, year, price::float as price from market_prices order by make, model, year',
  )
  res.json(result)
})

publicRoutes.get('/collections/:name', async (req, res) => {
  if (!publicCollections.includes(req.params.name)) return res.status(404).json({ message: 'Bölmə tapılmadı' })
  res.json(await activeItems(req.params.name))
})

publicRoutes.get('/tracking', async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase()
  if (code.length < 5) return res.status(400).json({ message: 'VIN və ya lot nömrəsini yazın' })

  const row = await queryOne(
    `select data from shipments
     where is_active and (upper(data->>'code') = $1 or upper(data->>'lot') = $1)
     limit 1`,
    [code],
  )
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  const { code: vin, lot, title, steps } = row.data
  res.json({ code: vin, lot, title, steps: steps || [] })
})

publicRoutes.post('/requests', async (req, res) => {
  const { subject = '', name = '', phone = '', email = '', message = '' } = req.body || {}
  if (!String(name).trim() || !String(phone).trim()) return res.status(400).json({ message: 'Ad və telefon mütləqdir' })

  const user = readToken(req, 'user')
  const row = await queryOne(
    `insert into requests (subject, name, phone, email, message, user_id)
     values ($1, $2, $3, $4, $5, $6)
     returning id, created_at`,
    [
      String(subject).slice(0, 200),
      String(name).trim().slice(0, 100),
      String(phone).trim().slice(0, 30),
      String(email).trim().slice(0, 100),
      String(message).trim().slice(0, 2000),
      user ? user.id : null,
    ],
  )
  res.status(201).json(row)
})

publicRoutes.post('/clicks', async (req, res) => {
  const carId = Number(req.body?.carId)
  const type = req.body?.type === 'phone' ? 'phone' : 'whatsapp'
  const car = await queryOne('select id from cars where id = $1', [carId])
  if (!car) return res.status(404).json({ message: 'Tapılmadı' })

  await query('insert into car_clicks (car_id, type) values ($1, $2) returning id', [carId, type])
  res.status(201).json({ ok: true })
})

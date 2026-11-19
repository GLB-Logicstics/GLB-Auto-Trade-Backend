import { Router } from 'express'
import { collections, findCollection, toItem } from '../collections.js'
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

publicRoutes.get('/bootstrap', async (req, res) => {
  const result = {}
  for (const name of Object.keys(collections)) {
    result[name] = await activeItems(name)
  }

  result.settings = await settingsMap()
  result.shipping = await shippingMap()
  res.json(result)
})

publicRoutes.get('/collections/:name', async (req, res) => {
  if (!findCollection(req.params.name)) return res.status(404).json({ message: 'Bölmə tapılmadı' })
  res.json(await activeItems(req.params.name))
})

publicRoutes.post('/requests', async (req, res) => {
  const { subject = '', name = '', phone = '', email = '', message = '' } = req.body || {}
  if (!name.trim() || !phone.trim()) return res.status(400).json({ message: 'Ad və telefon mütləqdir' })

  const row = await queryOne(
    `insert into requests (subject, name, phone, email, message)
     values ($1, $2, $3, $4, $5)
     returning id, created_at`,
    [subject, name.trim(), phone.trim(), email.trim(), message.trim()],
  )
  res.status(201).json(row)
})

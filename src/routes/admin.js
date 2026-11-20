import { Router } from 'express'
import { audit } from '../audit.js'
import { checkPassword, createToken, hashPassword, PERMISSIONS, readToken } from '../auth.js'
import { collections, findCollection, settingKeys, slugify, toAdminItem } from '../collections.js'
import { query, queryOne } from '../db.js'
import { config } from '../config.js'
import { marketStatus, setMarketSync, startMarketSync } from '../market.js'
import { saveUpload } from '../upload.js'

export const adminRoutes = Router()

const REQUEST_STATUSES = ['new', 'in_progress', 'done', 'cancelled']
const ROLES = Object.keys(PERMISSIONS)
const DEALER_STATUSES = ['', 'pending', 'approved', 'rejected']

function adminInfo(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, permissions: PERMISSIONS[row.role] || [] }
}

function can(area) {
  return (req, res, next) => {
    if (!req.admin.permissions.includes(area)) return res.status(403).json({ message: 'Bu bölməyə icazəniz yoxdur' })
    next()
  }
}

adminRoutes.post('/login', async (req, res) => {
  const { email = '', password = '' } = req.body || {}
  const admin = await queryOne('select * from admins where email = $1', [String(email).trim().toLowerCase()])

  if (!admin || !admin.is_active || !checkPassword(password, admin.password_hash)) {
    return res.status(401).json({ message: 'E-poçt və ya şifrə yanlışdır' })
  }

  res.json({ token: createToken('admin', admin), admin: adminInfo(admin) })
})

adminRoutes.use(async (req, res, next) => {
  const token = readToken(req, 'admin')
  const admin = token ? await queryOne('select * from admins where id = $1', [token.id]) : null
  if (!admin || !admin.is_active) return res.status(401).json({ message: 'Giriş tələb olunur' })

  req.admin = adminInfo(admin)
  next()
})

adminRoutes.get('/me', (req, res) => res.json(req.admin))

adminRoutes.post('/upload', saveUpload)

adminRoutes.get('/rebuild', (req, res) => {
  res.json({ enabled: Boolean(config.githubRepo && config.githubToken) })
})

adminRoutes.post('/rebuild', can('content'), async (req, res) => {
  if (!config.githubRepo || !config.githubToken) {
    return res.status(400).json({ message: 'GITHUB_REPO və GITHUB_TOKEN .env faylında yazılmayıb' })
  }

  const response = await fetch(`https://api.github.com/repos/${config.githubRepo}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.githubToken}`,
      'User-Agent': 'glb-admin',
    },
    body: JSON.stringify({ event_type: 'rebuild' }),
  })
  if (!response.ok) return res.status(502).json({ message: `GitHub cavabı: ${response.status}` })

  await audit(req, 'update', 'site', '', 'Sayt yenidən yığılır')
  res.json({ ok: true })
})

adminRoutes.get('/stats', can('dashboard'), async (req, res) => {
  const counts = []
  for (const [name, collection] of Object.entries(collections)) {
    const row = await queryOne(`select count(*)::int as total, count(*) filter (where is_active)::int as active from ${name}`)
    counts.push({ name, label: collection.label, ...row })
  }

  const requests = await queryOne(
    `select count(*)::int as total, count(*) filter (where status = 'new')::int as new from requests`,
  )
  const users = await queryOne(
    `select count(*)::int as total,
       count(*) filter (where role = 'dealer')::int as dealers,
       count(*) filter (where dealer_status = 'pending')::int as pending
     from users`,
  )
  const shipping = await queryOne('select count(*)::int as total from shipping_prices')
  const latestRequests = await query('select * from requests order by created_at desc limit 5')

  res.json({ counts, requests, users, shipping, latestRequests })
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
  if (slug) data.slug = slug
  return { data, title, slug, isActive: body.isActive !== false, sortOrder: Number(body.sortOrder) || 0 }
}

adminRoutes.get('/collections/:name', can('content'), async (req, res) => {
  if (!getCollection(req, res)) return

  const search = `%${String(req.query.search || '').trim()}%`
  const owner = req.params.name === 'cars' ? ', (select u.email from users u where u.id = c.owner_id) as owner_email' : ''
  const rows = await query(`select c.*${owner} from ${req.params.name} c where c.title ilike $1 order by c.sort_order, c.id`, [
    search,
  ])
  res.json(rows.map((row) => ({ ...toAdminItem(row), ownerEmail: row.owner_email || '' })))
})

adminRoutes.get('/collections/:name/:id', can('content'), async (req, res) => {
  if (!getCollection(req, res)) return

  const row = await queryOne(`select * from ${req.params.name} where id = $1`, [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })
  res.json(toAdminItem(row))
})

adminRoutes.post('/collections/:name', can('content'), async (req, res) => {
  const collection = getCollection(req, res)
  if (!collection) return

  const item = itemValues(collection, req.body || {})
  const row = await queryOne(
    `insert into ${req.params.name} (slug, title, is_active, sort_order, data)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [item.slug, item.title, item.isActive, item.sortOrder, JSON.stringify(item.data)],
  )
  await audit(req, 'create', req.params.name, row.id, row.title)
  res.status(201).json(toAdminItem(row))
})

adminRoutes.put('/collections/:name/:id', can('content'), async (req, res) => {
  const collection = getCollection(req, res)
  if (!collection) return

  const item = itemValues(collection, req.body || {})
  const row = await queryOne(
    `update ${req.params.name}
     set slug = $1, title = $2, is_active = $3, sort_order = $4, data = $5, updated_at = now()
     where id = $6
     returning *`,
    [item.slug, item.title, item.isActive, item.sortOrder, JSON.stringify(item.data), req.params.id],
  )
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'update', req.params.name, row.id, `${row.title}${row.is_active ? '' : ' (gizli)'}`)
  res.json(toAdminItem(row))
})

adminRoutes.delete('/collections/:name/:id', can('content'), async (req, res) => {
  if (!getCollection(req, res)) return

  const row = await queryOne(`delete from ${req.params.name} where id = $1 returning id, title`, [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'delete', req.params.name, row.id, row.title)
  res.json(row)
})

const SETTING_AREAS = { tariffs: 'pricing', menus: 'menus' }

adminRoutes.get('/settings', async (req, res) => {
  res.json(await query('select key, value, updated_at from settings order by key'))
})

adminRoutes.put('/settings/:key', async (req, res) => {
  if (!settingKeys.includes(req.params.key)) return res.status(404).json({ message: 'Ayar tapılmadı' })
  if (!req.admin.permissions.includes(SETTING_AREAS[req.params.key] || 'settings')) {
    return res.status(403).json({ message: 'Bu bölməyə icazəniz yoxdur' })
  }

  const row = await queryOne(
    `insert into settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()
     returning key, value, updated_at`,
    [req.params.key, JSON.stringify(req.body.value)],
  )
  await audit(req, 'update', 'settings', req.params.key)
  res.json(row)
})

adminRoutes.get('/shipping', can('pricing'), async (req, res) => {
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

adminRoutes.post('/shipping', can('pricing'), async (req, res) => {
  const { auction = '', location = '', price = 0 } = req.body || {}
  if (!String(auction).trim() || !String(location).trim()) {
    return res.status(400).json({ message: 'Auksion və meydança mütləqdir' })
  }

  const row = await queryOne(
    `insert into shipping_prices (auction, location, price) values ($1, $2, $3)
     on conflict (auction, location) do update set price = excluded.price, updated_at = now()
     returning id, auction, location, price::float as price, updated_at`,
    [String(auction).trim(), String(location).trim().toUpperCase(), Number(price) || 0],
  )
  await audit(req, 'create', 'shipping', row.id, `${row.auction} ${row.location}: $${row.price}`)
  res.status(201).json(row)
})

adminRoutes.post('/shipping/import', can('pricing'), async (req, res) => {
  const { auction = '', rows = [] } = req.body || {}
  if (!String(auction).trim() || !Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ message: 'Auksion və sətirlər mütləqdir' })
  }

  let saved = 0
  for (const item of rows) {
    const location = String(item.location || '').trim().toUpperCase()
    const price = Number(item.price)
    if (!location || !Number.isFinite(price) || price < 0) continue

    await query(
      `insert into shipping_prices (auction, location, price) values ($1, $2, $3)
       on conflict (auction, location) do update set price = excluded.price, updated_at = now()
       returning id`,
      [String(auction).trim(), location, price],
    )
    saved++
  }

  await audit(req, 'import', 'shipping', auction, `${saved} sətir`)
  res.json({ saved, skipped: rows.length - saved })
})

adminRoutes.put('/shipping/:id', can('pricing'), async (req, res) => {
  const row = await queryOne(
    `update shipping_prices set price = $1, updated_at = now()
     where id = $2
     returning id, auction, location, price::float as price, updated_at`,
    [Number(req.body.price) || 0, req.params.id],
  )
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'update', 'shipping', row.id, `${row.auction} ${row.location}: $${row.price}`)
  res.json(row)
})

adminRoutes.delete('/shipping/:id', can('pricing'), async (req, res) => {
  const row = await queryOne('delete from shipping_prices where id = $1 returning id, auction, location', [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'delete', 'shipping', row.id, `${row.auction} ${row.location}`)
  res.json(row)
})

adminRoutes.get('/market-prices', can('pricing'), async (req, res) => {
  const search = `%${String(req.query.search || '').trim()}%`
  const country = String(req.query.country || '')
  const rows = await query(
    `select id, country, make, model, year, price::float as price, source, updated_at
     from market_prices
     where ($1 = '' or country = $1) and (make || ' ' || model) ilike $2
     order by make, model, year desc`,
    [country, search],
  )
  res.json(rows)
})

adminRoutes.get('/market-sync', can('pricing'), async (req, res) => {
  res.json(await marketStatus())
})

adminRoutes.post('/market-sync', can('pricing'), async (req, res) => {
  const started = startMarketSync()
  if (!started) return res.status(409).json({ message: 'Yeniləmə artıq gedir' })

  await audit(req, 'update', 'market_prices', '', 'Bazar qiymətləri yenilənir')
  res.json({ ok: true })
})

adminRoutes.put('/market-sync', can('pricing'), async (req, res) => {
  await setMarketSync(req.body?.enabled)
  res.json(await marketStatus())
})

adminRoutes.delete('/market-prices/:id', can('pricing'), async (req, res) => {
  const row = await queryOne('delete from market_prices where id = $1 returning id, make, model, year', [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'delete', 'market_prices', row.id, `${row.make} ${row.model} ${row.year}`)
  res.json(row)
})

adminRoutes.get('/requests', can('requests'), async (req, res) => {
  const status = String(req.query.status || '')
  const mine = req.query.mine === '1' ? req.admin.id : 0
  const rows = await query(
    `select r.*, a.name as assigned_name, u.email as user_email
     from requests r
     left join admins a on a.id = r.assigned_to
     left join users u on u.id = r.user_id
     where ($1 = '' or r.status = $1) and ($2 = 0 or r.assigned_to = $2)
     order by r.created_at desc`,
    [status, mine],
  )
  res.json(rows)
})

adminRoutes.put('/requests/:id', can('requests'), async (req, res) => {
  const { status = 'new', note = '', assignedTo = null } = req.body || {}
  if (!REQUEST_STATUSES.includes(status)) return res.status(400).json({ message: 'Status yanlışdır' })

  const row = await queryOne(
    'update requests set status = $1, note = $2, assigned_to = $3 where id = $4 returning *',
    [status, String(note).slice(0, 500), assignedTo ? Number(assignedTo) : null, req.params.id],
  )
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'update', 'requests', row.id, `${row.name}: ${row.status}`)
  res.json(row)
})

adminRoutes.delete('/requests/:id', can('requests'), async (req, res) => {
  const row = await queryOne('delete from requests where id = $1 returning id, name', [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'delete', 'requests', row.id, row.name)
  res.json(row)
})

adminRoutes.get('/staff', can('requests'), async (req, res) => {
  res.json(await query('select id, name from admins where is_active order by name'))
})

adminRoutes.get('/users', can('users'), async (req, res) => {
  const search = `%${String(req.query.search || '').trim()}%`
  const role = String(req.query.role || '')
  const rows = await query(
    `select u.id, u.name, u.email, u.phone, u.role, u.company, u.dealer_status, u.is_blocked, u.created_at,
       (select count(*)::int from requests r where r.user_id = u.id) as requests,
       (select count(*)::int from cars c where c.owner_id = u.id) as cars
     from users u
     where (u.name || ' ' || u.email || ' ' || u.phone || ' ' || u.company) ilike $1
       and ($2 = '' or u.role = $2 or ($2 = 'pending' and u.dealer_status = 'pending'))
     order by u.created_at desc`,
    [search, role],
  )
  res.json(rows)
})

adminRoutes.post('/users', can('users'), async (req, res) => {
  const { name = '', email = '', phone = '', password = '', role = 'user', company = '' } = req.body || {}
  if (!String(name).trim() || !String(email).includes('@') || String(password).length < 6 || !['user', 'dealer'].includes(role)) {
    return res.status(400).json({ message: 'Ad, e-poçt və ən azı 6 simvollu şifrə mütləqdir' })
  }

  const row = await queryOne(
    `insert into users (name, email, phone, password_hash, role, company, dealer_status)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, name, email, phone, role, company, dealer_status, is_blocked, created_at`,
    [
      String(name).trim(),
      String(email).trim().toLowerCase(),
      String(phone).trim(),
      hashPassword(password),
      role,
      String(company).trim(),
      role === 'dealer' ? 'approved' : '',
    ],
  )
  await audit(req, 'create', 'users', row.id, `${row.email} (${row.role})`)
  res.status(201).json({ ...row, requests: 0, cars: 0 })
})

adminRoutes.put('/users/:id/password', can('users'), async (req, res) => {
  const password = String(req.body?.password || '')
  if (password.length < 6) return res.status(400).json({ message: 'Şifrə ən azı 6 simvol olmalıdır' })

  const row = await queryOne('update users set password_hash = $1 where id = $2 returning id, email', [hashPassword(password), req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'update', 'users', row.id, `${row.email}: şifrə dəyişdi`)
  res.json({ ok: true })
})

adminRoutes.get('/users/:id/requests', can('users'), async (req, res) => {
  res.json(await query('select * from requests where user_id = $1 order by created_at desc', [req.params.id]))
})

adminRoutes.put('/users/:id', can('users'), async (req, res) => {
  const { role = 'user', dealerStatus = '', isBlocked = false } = req.body || {}
  if (!['user', 'dealer'].includes(role) || !DEALER_STATUSES.includes(dealerStatus)) {
    return res.status(400).json({ message: 'Məlumat yanlışdır' })
  }

  const row = await queryOne(
    `update users set role = $1, dealer_status = $2, is_blocked = $3 where id = $4
     returning id, name, email, phone, role, company, dealer_status, is_blocked, created_at`,
    [role, role === 'dealer' ? dealerStatus || 'pending' : '', Boolean(isBlocked), req.params.id],
  )
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'update', 'users', row.id, `${row.email}: ${row.role} ${row.dealer_status}${row.is_blocked ? ' blok' : ''}`)
  res.json(row)
})

adminRoutes.delete('/users/:id', can('users'), async (req, res) => {
  const row = await queryOne('delete from users where id = $1 returning id, email', [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'delete', 'users', row.id, row.email)
  res.json(row)
})

adminRoutes.get('/languages', async (req, res) => {
  res.json(await query('select * from languages order by sort_order, code'))
})

adminRoutes.post('/languages', can('languages'), async (req, res) => {
  const code = String(req.body?.code || '').trim().toLowerCase()
  const name = String(req.body?.name || '').trim()
  if (!/^[a-z]{2,5}$/.test(code) || !name) return res.status(400).json({ message: 'Kod (məs. tr) və ad mütləqdir' })

  const row = await queryOne(
    `insert into languages (code, name, sort_order)
     values ($1, $2, (select coalesce(max(sort_order), 0) + 1 from languages))
     returning *`,
    [code, name],
  )
  await audit(req, 'create', 'languages', code, name)
  res.status(201).json(row)
})

adminRoutes.put('/languages/:code', can('languages'), async (req, res) => {
  const { name = '', isActive = true, sortOrder = 0 } = req.body || {}
  const row = await queryOne(
    `update languages set name = $1, is_active = $2 or is_default, sort_order = $3 where code = $4 returning *`,
    [String(name).trim(), Boolean(isActive), Number(sortOrder) || 0, req.params.code],
  )
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'update', 'languages', row.code, row.name)
  res.json(row)
})

adminRoutes.delete('/languages/:code', can('languages'), async (req, res) => {
  const row = await queryOne('delete from languages where code = $1 and not is_default returning code', [req.params.code])
  if (!row) return res.status(400).json({ message: 'Əsas dili silmək olmaz' })

  await audit(req, 'delete', 'languages', row.code)
  res.json(row)
})

adminRoutes.get('/translations', can('translations'), async (req, res) => {
  const rows = await query('select key, lang, value from translations order by key')
  const map = {}
  for (const row of rows) {
    map[row.key] = map[row.key] || {}
    map[row.key][row.lang] = row.value
  }
  res.json(Object.entries(map).map(([key, values]) => ({ key, values })))
})

adminRoutes.put('/translations', can('translations'), async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  for (const item of items) {
    const key = String(item.key || '').trim()
    if (!key) continue

    await query(
      `insert into translations (key, lang, value) values ($1, $2, $3)
       on conflict (key, lang) do update set value = excluded.value
       returning key`,
      [key, String(item.lang), String(item.value ?? '')],
    )
  }

  await audit(req, 'update', 'translations', '', `${items.length} dəyişiklik`)
  res.json({ saved: items.length })
})

adminRoutes.delete('/translations', can('translations'), async (req, res) => {
  const key = String(req.query.key || '')
  const rows = await query('delete from translations where key = $1 returning key', [key])
  if (!rows.length) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'delete', 'translations', '', key)
  res.json({ key })
})

function isDeveloper(req) {
  return req.admin.role === 'developer'
}

function allowedRoles(req) {
  return isDeveloper(req) ? ROLES : ROLES.filter((role) => role !== 'developer')
}

async function protectDeveloper(req, res, id) {
  const target = await queryOne('select role from admins where id = $1', [id])
  if (target && target.role === 'developer' && !isDeveloper(req)) {
    res.status(403).json({ message: 'Developer hesabını yalnız developer dəyişə bilər' })
    return true
  }
  return false
}

adminRoutes.get('/admins', can('admins'), async (req, res) => {
  const rows = await query('select id, name, email, role, is_active, created_at from admins order by id')
  res.json(isDeveloper(req) ? rows : rows.filter((row) => row.role !== 'developer'))
})

adminRoutes.post('/admins', can('admins'), async (req, res) => {
  const { name = '', email = '', password = '', role = 'editor' } = req.body || {}
  if (!String(name).trim() || !String(email).includes('@') || String(password).length < 6 || !allowedRoles(req).includes(role)) {
    return res.status(400).json({ message: 'Ad, e-poçt, rol və ən azı 6 simvollu şifrə mütləqdir' })
  }

  const row = await queryOne(
    `insert into admins (name, email, password_hash, role) values ($1, $2, $3, $4)
     returning id, name, email, role, is_active, created_at`,
    [String(name).trim(), String(email).trim().toLowerCase(), hashPassword(password), role],
  )
  await audit(req, 'create', 'admins', row.id, `${row.email} (${row.role})`)
  res.status(201).json(row)
})

adminRoutes.put('/admins/:id', can('admins'), async (req, res) => {
  const { name = '', role = 'editor', isActive = true, password = '' } = req.body || {}
  if (!allowedRoles(req).includes(role)) return res.status(400).json({ message: 'Rol yanlışdır' })
  if (await protectDeveloper(req, res, req.params.id)) return
  if (Number(req.params.id) === req.admin.id && (role !== req.admin.role || !isActive)) {
    return res.status(400).json({ message: 'Öz rolunuzu dəyişə və ya özünüzü deaktiv edə bilməzsiniz' })
  }

  const row = await queryOne(
    `update admins set name = $1, role = $2, is_active = $3 where id = $4
     returning id, name, email, role, is_active, created_at`,
    [String(name).trim(), role, Boolean(isActive), req.params.id],
  )
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  if (String(password).length >= 6) {
    await query('update admins set password_hash = $1 where id = $2 returning id', [hashPassword(password), row.id])
  }

  await audit(req, 'update', 'admins', row.id, `${row.email} (${row.role})`)
  res.json(row)
})

adminRoutes.delete('/admins/:id', can('admins'), async (req, res) => {
  if (Number(req.params.id) === req.admin.id) return res.status(400).json({ message: 'Özünüzü silə bilməzsiniz' })
  if (await protectDeveloper(req, res, req.params.id)) return

  const row = await queryOne('delete from admins where id = $1 returning id, email', [req.params.id])
  if (!row) return res.status(404).json({ message: 'Tapılmadı' })

  await audit(req, 'delete', 'admins', row.id, row.email)
  res.json(row)
})

adminRoutes.get('/audit', can('audit'), async (req, res) => {
  const entity = String(req.query.entity || '')
  const rows = await query(
    `select * from audit_logs where ($1 = '' or entity = $1) order by created_at desc limit 300`,
    [entity],
  )
  res.json(rows)
})

adminRoutes.get('/clicks', can('users'), async (req, res) => {
  const rows = await query(
    `select c.id, c.title, u.email as owner_email,
       count(k.id)::int as clicks,
       count(k.id) filter (where k.created_at > now() - interval '30 days')::int as clicks_month
     from cars c
     left join car_clicks k on k.car_id = c.id
     left join users u on u.id = c.owner_id
     group by c.id, u.email
     order by clicks desc`,
  )
  res.json(rows)
})

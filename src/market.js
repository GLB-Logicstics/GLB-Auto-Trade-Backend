import { query, queryOne } from './db.js'

const DAY = 24 * 60 * 60 * 1000
const STALE = 6 * 60 * 1000
const PARALLEL = Number(process.env.MARKET_PARALLEL) || 3
const SEARCH_UNTIL = 150 * 1000
const STOP_AT = 270 * 1000
const COUNTRIES = { aze: 'Azerbaijan', geo: 'Georgia' }
const SITES = { aze: 'turbo.az', geo: 'myauto.ge' }

let running = false

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const gemini = {
  url: process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
  search: true,

  enabled() {
    return Boolean(process.env.GEMINI_API_KEY)
  },

  prompt(target, countries, search) {
    const car = `${target.year} ${target.make} ${target.model}`
    const lines = countries.map((country) => `"${country}": {"price": number, "listings": number}`).join(', ')
    return [
      search
        ? `Find current used car listings for a ${car} in ${countries.map((country) => `${COUNTRIES[country]} (${SITES[country]})`).join(' and ')}.`
        : `Estimate the current used car market price of a ${car} in ${countries.map((country) => COUNTRIES[country]).join(' and ')}.`,
      'For each country give the typical (median) asking price in US dollars. Convert AZN or GEL to USD at the current rate.',
      search
        ? 'Prefer listings of exactly this model and year. If there are too few, use the closest years or trims and your knowledge of that market.'
        : 'Use your knowledge of that local market, import costs and similar cars.',
      'You must always give a realistic number for every country, never null or zero.',
      '"listings" is how many real listings the price is based on (0 if it is your estimate).',
      'Answer with JSON only, no other text:',
      `{${lines}}`,
    ].join('\n')
  },

  async ask(target, countries, search, timeout) {
    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash'
    const response = await fetch(`${this.url}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: this.prompt(target, countries, search) }] }],
        ...(search ? { tools: [{ google_search: {} }] } : {}),
      }),
      signal: AbortSignal.timeout(timeout),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(`Gemini cavabı: ${response.status} ${result.error?.message || ''}`.trim())
      error.status = response.status
      const retry = (result.error?.details || []).find((item) => item.retryDelay)?.retryDelay
      error.retryAfter = retry ? Math.ceil(parseFloat(retry) * 1000) : 0
      throw error
    }
    const text = (result.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('')
    return parseJson(text)
  },
}

function toNumber(value) {
  if (typeof value === 'number') return value
  const text = String(value ?? '').replace(/[\s,]/g, '')
  const match = text.match(/\d+(\.\d+)?/)
  if (!match) return NaN
  return Number(match[0]) * (/k$/i.test(text) ? 1000 : 1)
}

function parseJson(text) {
  const clean = text.replace(/```(json)?/gi, '')
  const start = clean.indexOf('{')
  for (let end = clean.lastIndexOf('}'); start !== -1 && end > start; end = clean.lastIndexOf('}', end - 1)) {
    try {
      return JSON.parse(clean.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'))
    } catch {
      continue
    }
  }
  throw new Error('Gemini cavabı oxunmadı')
}

function readPrice(value) {
  const price = Math.round(toNumber(value?.price))
  if (!(price >= 500 && price <= 1000000)) return null
  return { price, listings: Math.max(0, Math.round(toNumber(value?.listings) || 0)) }
}

async function estimate(target, deadline, stopAt) {
  const found = {}
  let lastError = ''

  if (gemini.search && Date.now() < deadline) {
    try {
      const answer = await gemini.ask(target, Object.keys(COUNTRIES), true, 60000)
      for (const country of Object.keys(COUNTRIES)) {
        const value = readPrice(answer[country])
        if (value) found[country] = { ...value, source: value.listings ? `AI · Google axtarışı · ${value.listings} elan` : 'AI · Google axtarışı · təxmini' }
      }
    } catch (error) {
      lastError = error.message
      if ([400, 403].includes(error.status)) gemini.search = false
    }
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const missing = Object.keys(COUNTRIES).filter((country) => !found[country])
    if (!missing.length || Date.now() > stopAt) break
    try {
      const answer = await gemini.ask(target, missing, false, Math.min(40000, Math.max(5000, stopAt - Date.now())))
      for (const country of missing) {
        const value = readPrice(answer[country])
        if (value) found[country] = { ...value, listings: 0, source: 'AI təxmini' }
      }
    } catch (error) {
      lastError = error.message
      const pause = Math.min(30000, error.retryAfter || 2000 * 2 ** attempt)
      if (Date.now() + pause > stopAt) break
      await wait(pause)
    }
  }

  return { found, error: lastError }
}

async function targets() {
  const rows = await query(
    `with list as (
       select upper(trim(data->>'make')) as make, upper(trim(data->>'model')) as model, (data->>'year')::int as year from catalog where is_active
       union
       select upper(trim(data->>'make')), upper(trim(data->>'model')), (data->>'year')::int from cars where is_active
     )
     select list.make, list.model, list.year, count(m.id) as known, min(m.updated_at) as updated
     from list left join market_prices m on m.make = list.make and m.model = list.model and m.year = list.year
     group by list.make, list.model, list.year
     order by count(m.id), min(m.updated_at) nulls first`,
  )
  return rows.filter((row) => row.make && row.model && row.year).map(({ make, model, year }) => ({ make, model, year }))
}

async function saveStatus(value) {
  await query(
    `insert into settings (key, value) values ('market_sync', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now() returning key`,
    [JSON.stringify(value)],
  )
}

async function storedStatus() {
  const row = await queryOne("select value from settings where key = 'market_sync'")
  return { enabled: true, lastRun: '', results: [], startedAt: '', ...(row ? row.value : {}) }
}

function isRunning(status) {
  return running || Boolean(status.startedAt && Date.now() - new Date(status.startedAt).getTime() < STALE)
}

export async function marketStatus() {
  const status = await storedStatus()
  return { ...status, running: isRunning(status) }
}

export async function setMarketSync(enabled) {
  const { running: _, ...status } = await marketStatus()
  await saveStatus({ ...status, enabled: Boolean(enabled) })
}

export async function syncMarketPrices() {
  const before = await storedStatus()
  if (isRunning(before)) return false
  running = true
  await saveStatus({ ...before, startedAt: new Date().toISOString() })

  const results = []
  const deadline = Date.now() + SEARCH_UNTIL
  const stopAt = Date.now() + STOP_AT

  try {
    if (!gemini.enabled()) throw new Error('GEMINI_API_KEY verilməyib')
    gemini.search = true

    const queue = await targets()
    const worker = async () => {
      while (queue.length) {
        const target = queue.shift()
        const { found, error } = await estimate(target, deadline, stopAt)
        for (const country of Object.keys(COUNTRIES)) {
          const value = found[country]
          const result = { source: 'AI', country, make: target.make, model: target.model, year: target.year, count: 0, price: 0, error: '' }
          if (value) {
            result.price = value.price
            result.count = value.listings
            await query(
              `insert into market_prices (country, make, model, year, price, source) values ($1, $2, $3, $4, $5, $6)
               on conflict (country, make, model, year)
               do update set price = excluded.price, source = excluded.source, updated_at = now() returning id`,
              [country, target.make, target.model, target.year, value.price, value.source],
            )
          } else {
            result.error = `${country === 'aze' ? 'Azərbaycan' : 'Gürcüstan'}: ${error || 'AI qiymət vermədi'}`
          }
          results.push(result)
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))
  } catch (error) {
    results.push({ source: 'AI', make: '', model: '', year: 0, count: 0, price: 0, error: error.message })
  } finally {
    const failed = results.filter((item) => item.error)
    console.log(`Bazar qiymətləri: ${results.length - failed.length} tapıldı, ${failed.length} tapılmadı`)
    for (const item of failed) console.log(`Bazar qiyməti tapılmadı: ${item.make} ${item.model} ${item.year} — ${item.error}`)
    running = false
    const previous = await storedStatus()
    await saveStatus({ enabled: previous.enabled !== false, lastRun: new Date().toISOString(), startedAt: '', results })
  }
  return true
}

export function startMarketSync() {
  if (running) return false
  syncMarketPrices().catch((error) => console.error('Bazar qiymətləri:', error.message))
  return true
}

export function scheduleMarketSync() {
  const check = async () => {
    try {
      const status = await marketStatus()
      if (status.enabled === false) return
      if (!status.lastRun || Date.now() - new Date(status.lastRun).getTime() > DAY) await syncMarketPrices()
    } catch (error) {
      console.error('Bazar qiymətləri:', error.message)
    }
  }
  setTimeout(check, 60 * 1000)
  setInterval(check, 60 * 60 * 1000)
}

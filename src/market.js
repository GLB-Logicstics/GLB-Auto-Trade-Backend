import { query, queryOne } from './db.js'

const DAY = 24 * 60 * 60 * 1000
const DELAY = Number(process.env.MARKET_DELAY) || 400
const STALE = 6 * 60 * 1000
const MIN_LISTINGS = 3
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'az,en;q=0.8',
}

let running = false

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clean = (text) => String(text || '').trim().toUpperCase()

async function getText(url) {
  await wait(DELAY)
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`${new URL(url).host} cavabı: ${response.status}`)
  return response.text()
}

async function getJson(url) {
  return JSON.parse(await getText(url))
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function withoutOutliers(values) {
  if (values.length < 5) return values
  const center = median(values)
  return values.filter((value) => value > center * 0.5 && value < center * 1.8)
}

function selectOptions(html, id) {
  const match = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`))
  if (!match) return []
  return [...match[1].matchAll(/<option([^>]*)value="(\d+)"[^>]*>([^<]+)<\/option>/g)].map((item) => ({
    attrs: item[1],
    value: item[2],
    label: clean(item[3]),
  }))
}

const turbo = {
  name: 'turbo.az',
  country: 'aze',
  makes: null,
  models: null,

  async load() {
    if (this.makes) return
    const html = await getText('https://turbo.az/autos')
    this.makes = selectOptions(html, 'q_make')
    this.models = selectOptions(html, 'q_model')
    if (!this.makes.length) throw new Error('turbo.az: marka siyahısı oxunmadı (sayt quruluşu dəyişib)')
  },

  async prices(target, rates) {
    await this.load()
    const make = this.makes.find((item) => item.label === target.make)
    if (!make) throw new Error('turbo.az-da marka tapılmadı')

    const model = this.models.find(
      (item) => item.label === target.model && new RegExp(`(class|data-make[^=]*)="${make.value}"`).test(item.attrs),
    )
    if (!model) throw new Error('turbo.az-da model tapılmadı')

    const params = new URLSearchParams({
      'q[make][]': make.value,
      'q[model][]': model.value,
      'q[year_from]': String(target.year),
      'q[year_to]': String(target.year),
    })
    const html = await getText(`https://turbo.az/autos?${params}`)
    const values = []
    for (const item of html.matchAll(/class="product-price[^"]*"[^>]*>\s*([\d\s]+)\s*<span>\s*(AZN|USD|EUR|\$|€)/g)) {
      const amount = Number(item[1].replace(/\s/g, ''))
      const currency = item[2]
      if (currency === 'AZN') values.push(Math.round(amount / rates.azn))
      else if (currency === 'USD' || currency === '$') values.push(amount)
    }
    return values
  },
}

const myauto = {
  name: 'myauto.ge',
  country: 'geo',
  makes: null,
  models: {},

  async load() {
    if (this.makes) return
    const list = await getJson('https://static.my.ge/myauto/js/mans.json')
    this.makes = list.map((item) => ({ id: String(item.man_id), label: clean(item.man_name) }))
  },

  async prices(target) {
    await this.load()
    const make = this.makes.find((item) => item.label === target.make)
    if (!make) throw new Error('myauto.ge-də marka tapılmadı')

    if (!this.models[make.id]) {
      const result = await getJson(`https://api2.myauto.ge/ka/getManModels?man_id=${make.id}`)
      this.models[make.id] = (result.data || []).map((item) => ({ id: String(item.model_id), label: clean(item.model_name) }))
    }
    const model = this.models[make.id].find((item) => item.label === target.model)
    if (!model) throw new Error('myauto.ge-də model tapılmadı')

    const params = new URLSearchParams({
      TypeID: '0',
      ForRent: '0',
      Mans: `${make.id}.${model.id}`,
      ProdYearFrom: String(target.year),
      ProdYearTo: String(target.year),
      CurrencyID: '1',
      Page: '1',
    })
    const result = await getJson(`https://api2.myauto.ge/ka/products?${params}`)
    const items = (result.data && result.data.items) || []
    return items.map((item) => Number(item.price_usd)).filter((value) => value > 0)
  },
}

const sources = [turbo, myauto]

async function targets() {
  const rows = await query(
    `select upper(data->>'make') as make, upper(data->>'model') as model, (data->>'year')::int as year from catalog where is_active
     union
     select upper(data->>'make'), upper(data->>'model'), (data->>'year')::int from cars where is_active`,
  )
  return rows.filter((row) => row.make && row.model && row.year)
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

  const tariffs = await queryOne("select value from settings where key = 'tariffs'")
  const rates = { azn: Number(tariffs?.value?.aznRate) || 1.7 }
  const results = []

  try {
    for (const source of sources) {
      source.makes = null
      for (const target of await targets()) {
        const result = { source: source.name, make: target.make, model: target.model, year: target.year, count: 0, price: 0, error: '' }
        try {
          const values = withoutOutliers(await source.prices(target, rates))
          result.count = values.length
          if (values.length < MIN_LISTINGS) throw new Error(`az elan var (${values.length})`)

          result.price = median(values)
          await query(
            `insert into market_prices (country, make, model, year, price, source) values ($1, $2, $3, $4, $5, $6)
             on conflict (country, make, model, year)
             do update set price = excluded.price, source = excluded.source, updated_at = now() returning id`,
            [source.country, target.make, target.model, target.year, result.price, `${source.name} · ${values.length} elan`],
          )
        } catch (error) {
          result.error = error.message
        }
        results.push(result)
      }
    }
  } finally {
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

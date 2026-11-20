import app from './app.js'
import { config } from './config.js'
import { scheduleMarketSync } from './market.js'

app.listen(config.port, () => {
  console.log(`GLB API: http://localhost:${config.port}`)
  if (config.marketSync) scheduleMarketSync()
})

import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { adminRoutes } from './routes/admin.js'
import { publicRoutes } from './routes/public.js'

const app = express()

app.use(cors({ origin: config.corsOrigins }))
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(config.uploadsDir))

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/public', publicRoutes)
app.use('/api/admin', adminRoutes)

app.use((req, res) => res.status(404).json({ message: 'Ünvan tapılmadı' }))

app.use((error, req, res, next) => {
  if (error.code === '23505') return res.status(409).json({ message: 'Bu slug artıq istifadə olunur' })
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Fayl çox böyükdür' })

  console.error(error)
  res.status(500).json({ message: 'Server xətası' })
})

app.listen(config.port, () => {
  console.log(`GLB API: http://localhost:${config.port}`)
})

import { writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from './config.js'

const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

export async function saveUpload(req, res) {
  const { name = '', data = '' } = req.body || {}
  const type = extname(name).toLowerCase()
  if (!IMAGE_TYPES.includes(type) || !data) return res.status(400).json({ message: 'Yalnız şəkil faylı yükləmək olar' })

  const fileName = `${randomUUID()}${type}`
  const base64 = String(data).replace(/^data:[^;]+;base64,/, '')
  await writeFile(join(config.uploadsDir, fileName), Buffer.from(base64, 'base64'))

  res.status(201).json({ url: `${config.publicUrl}/uploads/${fileName}` })
}

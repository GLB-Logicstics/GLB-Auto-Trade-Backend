import { writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { config } from './config.js'

const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

async function uploadToCloudinary(data) {
  const { username: apiKey, password: apiSecret, hostname: cloud } = new URL(config.cloudinaryUrl)
  const timestamp = Math.floor(Date.now() / 1000)
  const folder = 'glb'
  const signature = createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest('hex')

  const form = new FormData()
  form.append('file', data)
  form.append('api_key', apiKey)
  form.append('timestamp', String(timestamp))
  form.append('folder', folder)
  form.append('signature', signature)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message || 'Cloudinary xətası')
  return result.secure_url
}

export async function saveUpload(req, res) {
  const { name = '', data = '' } = req.body || {}
  const type = extname(name).toLowerCase()
  if (!IMAGE_TYPES.includes(type) || !data) return res.status(400).json({ message: 'Yalnız şəkil faylı yükləmək olar' })

  if (config.blobToken) {
    const { put } = await import('@vercel/blob')
    const base64 = String(data).replace(/^data:[^;]+;base64,/, '')
    const blob = await put(`glb/${randomUUID()}${type}`, Buffer.from(base64, 'base64'), {
      access: 'public',
      token: config.blobToken,
    })
    return res.status(201).json({ url: blob.url })
  }

  if (config.cloudinaryUrl) {
    return res.status(201).json({ url: await uploadToCloudinary(String(data)) })
  }

  const fileName = `${randomUUID()}${type}`
  const base64 = String(data).replace(/^data:[^;]+;base64,/, '')
  await writeFile(join(config.uploadsDir, fileName), Buffer.from(base64, 'base64'))

  res.status(201).json({ url: `${config.publicUrl}/uploads/${fileName}` })
}

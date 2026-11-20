import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgres://glb:glb@localhost:5432/glb'

export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl,
  tokenSecret: process.env.TOKEN_SECRET || createHash('sha256').update(`glb-token:${databaseUrl}`).digest('hex'),
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : true,
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  marketSync: process.env.MARKET_SYNC !== 'off',
  cronSecret: process.env.CRON_SECRET || '',
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || '',
  serverless: Boolean(process.env.VERCEL),
  githubRepo: process.env.GITHUB_REPO || '',
  githubToken: process.env.GITHUB_TOKEN || '',
  uploadsDir: fileURLToPath(new URL('../uploads', import.meta.url)),
}

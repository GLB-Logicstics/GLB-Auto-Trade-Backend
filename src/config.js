import { fileURLToPath } from 'node:url'

export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://glb:glb@localhost:5432/glb',
  tokenSecret: process.env.TOKEN_SECRET || 'dev-secret',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : true,
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  uploadsDir: fileURLToPath(new URL('../uploads', import.meta.url)),
}

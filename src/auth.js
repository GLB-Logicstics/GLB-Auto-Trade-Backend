import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { config } from './config.js'

const TOKEN_DAYS = 7

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  const given = scryptSync(password, salt, 64)
  return timingSafeEqual(given, Buffer.from(hash, 'hex'))
}

function sign(text) {
  return createHmac('sha256', config.tokenSecret).update(text).digest('base64url')
}

export function createToken(admin) {
  const payload = { id: admin.id, email: admin.email, exp: Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000 }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readToken(token) {
  const [body, signature] = String(token).split('.')
  if (!body || !signature || sign(body) !== signature) return null

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  if (payload.exp < Date.now()) return null
  return payload
}

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || ''
  const admin = readToken(header.replace('Bearer ', ''))
  if (!admin) return res.status(401).json({ message: 'Giriş tələb olunur' })

  req.admin = admin
  next()
}

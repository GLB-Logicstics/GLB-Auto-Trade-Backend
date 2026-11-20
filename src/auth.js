import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { config } from './config.js'

const TOKEN_DAYS = 7

const ADMIN_AREAS = ['dashboard', 'requests', 'users', 'content', 'pricing', 'settings', 'translations', 'admins', 'audit']

export const PERMISSIONS = {
  developer: [...ADMIN_AREAS, 'menus', 'languages', 'developer'],
  admin: ADMIN_AREAS,
  manager: ['dashboard', 'requests', 'users', 'content', 'pricing'],
  editor: ['dashboard', 'content', 'settings', 'translations'],
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  const given = scryptSync(String(password), salt, 64)
  return timingSafeEqual(given, Buffer.from(hash, 'hex'))
}

function sign(text) {
  return createHmac('sha256', config.tokenSecret).update(text).digest('base64url')
}

export function createToken(type, account) {
  const payload = { type, id: account.id, exp: Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000 }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readToken(req, type) {
  const token = String(req.headers.authorization || '').replace('Bearer ', '')
  const [body, signature] = token.split('.')
  if (!body || !signature || sign(body) !== signature) return null

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  if (payload.type !== type || payload.exp < Date.now()) return null
  return payload
}

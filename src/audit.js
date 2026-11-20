import { query } from './db.js'

export async function audit(req, action, entity, entityId = '', summary = '') {
  await query(
    'insert into audit_logs (admin_id, admin_name, action, entity, entity_id, summary) values ($1, $2, $3, $4, $5, $6) returning id',
    [req.admin.id, req.admin.name, action, entity, String(entityId), String(summary).slice(0, 300)],
  )
}

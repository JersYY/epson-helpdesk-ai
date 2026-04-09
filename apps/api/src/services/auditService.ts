import { query } from '../db.js'

export async function logAudit(
  employeeId: string | null,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  await query(
    `
      INSERT INTO audit_logs (employee_id, action, metadata)
      VALUES ($1, $2, $3::jsonb)
    `,
    [employeeId, action, JSON.stringify(metadata)],
  )
}

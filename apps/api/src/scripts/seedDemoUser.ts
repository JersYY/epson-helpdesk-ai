import bcrypt from 'bcryptjs'

import { closePool, query } from '../db.js'
import { env } from '../env.js'

async function main() {
  const passwordHash = await bcrypt.hash(env.DEMO_USER_PASSWORD, 10)

  await query(
    `
      INSERT INTO employees (
        employee_id,
        full_name,
        email,
        password_hash,
        department,
        supervisor_email,
        role
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'employee')
      ON CONFLICT (email)
      DO UPDATE SET
        employee_id = EXCLUDED.employee_id,
        full_name = EXCLUDED.full_name,
        password_hash = EXCLUDED.password_hash,
        department = EXCLUDED.department,
        supervisor_email = EXCLUDED.supervisor_email
    `,
    [
      env.DEMO_USER_EMPLOYEE_ID,
      env.DEMO_USER_NAME,
      env.DEMO_USER_EMAIL,
      passwordHash,
      env.DEMO_USER_DEPARTMENT,
      env.DEMO_SUPERVISOR_EMAIL,
    ],
  )

  console.log(`Demo user ready: ${env.DEMO_USER_EMAIL}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool()
  })

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { z } from 'zod'

const envFilePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.env',
)

dotenv.config({
  path: envFilePath,
})

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  FRONTEND_URL: z.string().url(),
  UPLOAD_DIR: z.string().default('./uploads'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('helpdesk-ai@epson.local'),
  KNOWLEDGE_SPREADSHEET_PATH: z.string().default(''),
  DEMO_USER_EMPLOYEE_ID: z.string().default('EMP-001'),
  DEMO_USER_NAME: z.string().default('Operator Assembly Demo'),
  DEMO_USER_EMAIL: z.string().email().default('operator.assembly@epson.local'),
  DEMO_USER_PASSWORD: z.string().default('Password123!'),
  DEMO_USER_DEPARTMENT: z.string().default('Manufacturing QA'),
  DEMO_SUPERVISOR_EMAIL: z.string().email().default('supervisor.manufacturing@epson.local'),
})

const rawEnv = envSchema.parse(process.env)

export const env = {
  ...rawEnv,
  UPLOAD_DIR: path.resolve(path.dirname(envFilePath), rawEnv.UPLOAD_DIR),
}

export function hasGeminiApiKey() {
  return Boolean(env.GEMINI_API_KEY && !env.GEMINI_API_KEY.includes('replace-with'))
}

export function hasSmtpConfig() {
  return Boolean(env.SMTP_HOST)
}

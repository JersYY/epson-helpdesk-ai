import nodemailer from 'nodemailer'

import { env, hasSmtpConfig } from '../env.js'

export interface EmailDeliveryResult {
  delivered: boolean
  preview: string
}

export async function sendSummaryEmail(input: {
  recipientEmail: string
  subject: string
  html: string
}) {
  if (!hasSmtpConfig()) {
    const preview = `SMTP belum dikonfigurasi. Email simulasi ke ${input.recipientEmail} dengan subject "${input.subject}".`

    return {
      delivered: false,
      preview,
    } satisfies EmailDeliveryResult
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && env.SMTP_PASS
      ? {
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          },
        }
      : {}),
  })

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.recipientEmail,
    subject: input.subject,
    html: input.html,
  })

  return {
    delivered: true,
    preview: `Email terkirim ke ${input.recipientEmail}.`,
  } satisfies EmailDeliveryResult
}

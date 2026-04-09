import fs from 'node:fs/promises'
import path from 'node:path'

import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { z } from 'zod'

import { requireAuth, signToken, type AuthedRequest } from './auth.js'
import { pool, query } from './db.js'
import { env } from './env.js'
import { logAudit } from './services/auditService.js'
import { sendSummaryEmail } from './services/emailService.js'
import {
  answerHelpdeskQuestion,
  generateConversationSummary,
} from './services/helpdeskAiService.js'
import { getSuggestedQuestions, searchKnowledge } from './services/knowledgeService.js'
import type { AuthUser, ConversationTurn } from './types.js'

const app = express()

await fs.mkdir(env.UPLOAD_DIR, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, env.UPLOAD_DIR)
    },
    filename: (_req, file, callback) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      callback(null, `${Date.now()}-${safeName}`)
    },
  }),
})

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
)
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', async (_req, res) => {
  await query('SELECT 1')
  res.json({ status: 'ok' })
})

app.post('/api/auth/login', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  })

  const parsed = schema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ message: 'Format login tidak valid.' })
    return
  }

  const result = await query<{
    id: string
    employee_id: string
    full_name: string
    email: string
    password_hash: string
    department: string
    supervisor_email: string | null
    role: string
  }>(
    `
      SELECT
        id,
        employee_id,
        full_name,
        email,
        password_hash,
        department,
        supervisor_email,
        role
      FROM employees
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [parsed.data.email],
  )

  const userRow = result.rows[0]

  if (!userRow) {
    res.status(401).json({ message: 'Email atau password salah.' })
    return
  }

  const isValid = await bcrypt.compare(parsed.data.password, userRow.password_hash)

  if (!isValid) {
    res.status(401).json({ message: 'Email atau password salah.' })
    return
  }

  const user: AuthUser = {
    id: userRow.id,
    employeeId: userRow.employee_id,
    fullName: userRow.full_name,
    email: userRow.email,
    department: userRow.department,
    supervisorEmail: userRow.supervisor_email,
    role: userRow.role,
  }

  const token = signToken(user)
  await logAudit(user.id, 'auth.login', { email: user.email })
  res.json({ token, user })
})

app.get('/api/bootstrap', requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest
  const suggestedQuestions = await getSuggestedQuestions()

  res.json({
    user: authReq.user,
    suggestedQuestions,
  })
})

app.get('/api/conversations/:conversationId/messages', requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest
  const { conversationId } = req.params

  const result = await query<{
    id: string
    role: 'user' | 'assistant'
    content: string
    source_ids: string[]
    metadata: Record<string, unknown>
    attachment_name: string | null
    created_at: string
  }>(
    `
      SELECT
        m.id,
        m.role,
        m.content,
        m.source_ids,
        m.metadata,
        m.attachment_name,
        m.created_at
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = $1
        AND c.employee_id = $2
      ORDER BY m.created_at ASC
    `,
    [conversationId, authReq.user.id],
  )

  res.json({ messages: result.rows })
})

app.post(
  '/api/chat',
  requireAuth,
  upload.single('image'),
  async (req, res) => {
    const authReq = req as AuthedRequest
    const schema = z.object({
      question: z.string().min(1, 'Pertanyaan wajib diisi.'),
      conversationId: z.string().uuid().optional().or(z.literal('')),
    })

    const parsed = schema.safeParse({
      question: req.body.question,
      conversationId: req.body.conversationId,
    })

    if (!parsed.success) {
      res.status(400).json({ message: 'Pertanyaan tidak valid.' })
      return
    }

    let conversationId = parsed.data.conversationId || ''

    if (!conversationId) {
      const conversation = await query<{ id: string }>(
        `
          INSERT INTO conversations (employee_id, title)
          VALUES ($1, $2)
          RETURNING id
        `,
        [authReq.user.id, parsed.data.question.slice(0, 80)],
      )
      conversationId = conversation.rows[0].id
    } else {
      const ownershipCheck = await query<{ id: string }>(
        `
          SELECT id
          FROM conversations
          WHERE id = $1
            AND employee_id = $2
          LIMIT 1
        `,
        [conversationId, authReq.user.id],
      )

      if (ownershipCheck.rows.length === 0) {
        res.status(404).json({ message: 'Percakapan tidak ditemukan.' })
        return
      }
    }

    const userContent = req.file
      ? `${parsed.data.question}\n[Attachment: ${req.file.originalname}]`
      : parsed.data.question

    await query(
      `
        INSERT INTO messages (
          conversation_id,
          role,
          content,
          attachment_name,
          attachment_mime,
          attachment_path
        )
        VALUES ($1, 'user', $2, $3, $4, $5)
      `,
      [
        conversationId,
        userContent,
        req.file?.originalname ?? null,
        req.file?.mimetype ?? null,
        req.file?.path ?? null,
      ],
    )

    const historyResult = await query<{
      role: 'user' | 'assistant'
      content: string
    }>(
      `
        SELECT role, content
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT 8
      `,
      [conversationId],
    )

    const history: ConversationTurn[] = historyResult.rows.reverse()
    const sources = await searchKnowledge(parsed.data.question, 4)
    const uniqueDocumentSources = Array.from(
      new Map(sources.map((source) => [source.documentId, source])).values(),
    )
    const aiAnswer = await answerHelpdeskQuestion({
      employee: authReq.user,
      question: parsed.data.question,
      history,
      sources: uniqueDocumentSources,
      imagePath: req.file?.path,
      imageMimeType: req.file?.mimetype,
    })

    const insertedAssistant = await query<{
      id: string
      created_at: string
    }>(
      `
        INSERT INTO messages (
          conversation_id,
          role,
          content,
          source_ids,
          metadata
        )
        VALUES ($1, 'assistant', $2, $3::uuid[], $4::jsonb)
        RETURNING id, created_at
      `,
      [
        conversationId,
        aiAnswer.answer,
        uniqueDocumentSources.map((source) => source.documentId),
        JSON.stringify({
          confidence: aiAnswer.confidence,
          needsEscalation: aiAnswer.needsEscalation,
          followUpQuestions: aiAnswer.followUpQuestions,
        }),
      ],
    )

    await query(
      `
        UPDATE conversations
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [conversationId],
    )

    await logAudit(authReq.user.id, 'chat.question', {
      conversationId,
      question: parsed.data.question,
      hasImage: Boolean(req.file),
      sourceCount: uniqueDocumentSources.length,
    })

    res.json({
      conversationId,
      assistantMessage: {
        id: insertedAssistant.rows[0].id,
        role: 'assistant',
        content: aiAnswer.answer,
        createdAt: insertedAssistant.rows[0].created_at,
        confidence: aiAnswer.confidence,
        needsEscalation: aiAnswer.needsEscalation,
        followUpQuestions: aiAnswer.followUpQuestions,
      },
      sources: uniqueDocumentSources.map((source) => ({
        id: source.documentId,
        title: source.title,
        category: source.category,
        score: Number(source.score.toFixed(3)),
      })),
    })
  },
)

app.post('/api/reports/email', requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest
  const schema = z.object({
    conversationId: z.string().uuid(),
    supervisorEmail: z.string().email().optional(),
  })

  const parsed = schema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ message: 'Payload report tidak valid.' })
    return
  }

  const messagesResult = await query<{
    role: 'user' | 'assistant'
    content: string
  }>(
    `
      SELECT m.role, m.content
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.id = $1
        AND c.employee_id = $2
      ORDER BY m.created_at ASC
    `,
    [parsed.data.conversationId, authReq.user.id],
  )

  if (messagesResult.rows.length === 0) {
    res.status(404).json({ message: 'Percakapan tidak ditemukan.' })
    return
  }

  const supervisorEmail =
    parsed.data.supervisorEmail ?? authReq.user.supervisorEmail ?? env.DEMO_SUPERVISOR_EMAIL

  const summary = await generateConversationSummary({
    employee: authReq.user,
    supervisorEmail,
    messages: messagesResult.rows,
  })

  const subject = `Summary Helpdesk AI - ${authReq.user.fullName}`
  const delivery = await sendSummaryEmail({
    recipientEmail: supervisorEmail,
    subject,
    html: `<pre style="font-family: IBM Plex Mono, Consolas, monospace; white-space: pre-wrap;">${summary}</pre>`,
  })

  const reportResult = await query<{
    id: string
    created_at: string
  }>(
    `
      INSERT INTO summary_reports (
        employee_id,
        conversation_id,
        recipient_email,
        subject,
        summary,
        sent_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `,
    [
      authReq.user.id,
      parsed.data.conversationId,
      supervisorEmail,
      subject,
      summary,
      delivery.delivered ? new Date().toISOString() : null,
    ],
  )

  await logAudit(authReq.user.id, 'report.email', {
    conversationId: parsed.data.conversationId,
    supervisorEmail,
    delivered: delivery.delivered,
  })

  res.json({
    report: {
      id: reportResult.rows[0].id,
      subject,
      summary,
      recipientEmail: supervisorEmail,
      createdAt: reportResult.rows[0].created_at,
    },
    delivery,
  })
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  res.status(500).json({
    message: 'Terjadi kesalahan pada server. Periksa konfigurasi database, Gemini, atau SMTP.',
  })
})

const port = env.PORT

try {
  await pool.query('SELECT 1')
  app.listen(port, () => {
    console.log(`API ready on http://localhost:${port}`)
  })
} catch (error) {
  console.error('Failed to start API:', error)
  process.exit(1)
}

import fs from 'node:fs/promises'

import { GoogleGenerativeAI } from '@google/generative-ai'

import { env, hasGeminiApiKey } from '../env.js'
import type { AuthUser, ChatAnswer, ConversationTurn, KnowledgeSource } from '../types.js'

const genAI = hasGeminiApiKey()
  ? new GoogleGenerativeAI(env.GEMINI_API_KEY)
  : null

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function generateContentWithRetry(input: {
  prompt?: string
  parts?: Array<
    | { text: string }
    | {
        inlineData: {
          mimeType: string
          data: string
        }
      }
  >
}) {
  if (!genAI) {
    throw new Error('Gemini belum dikonfigurasi.')
  }

  let lastError: unknown

  for (const attempt of [1, 2, 3]) {
    try {
      const model = genAI.getGenerativeModel({
        model: env.GEMINI_MODEL,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: input.parts ? 'application/json' : undefined,
        },
      })

      if (input.parts) {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: input.parts }],
        })

        return result.response.text()
      }

      const result = await model.generateContent(input.prompt ?? '')
      return result.response.text()
    } catch (error) {
      lastError = error

      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        (error.status === 503 || error.status === 429) &&
        attempt < 3
      ) {
        await sleep(1200 * attempt)
        continue
      }

      throw error
    }
  }

  throw lastError
}

function buildSystemPrompt(input: {
  employee: AuthUser
  question: string
  history: ConversationTurn[]
  sources: KnowledgeSource[]
}) {
  const uniqueSources = Array.from(
    new Map(input.sources.map((source) => [source.documentId, source])).values(),
  )

  const formattedSources = uniqueSources
    .map((source, index) => {
      return [
        `Source ${index + 1}:`,
        `Title: ${source.title}`,
        `Category: ${source.category}`,
        `Content: ${source.content}`,
        `Reference answer: ${source.answer ?? '-'}`,
      ].join('\n')
    })
    .join('\n\n')

  const formattedHistory = input.history
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n')

  return `
Anda adalah Helpdesk Chatbot AI internal PT EPSON untuk area manufaktur, assembly, printing quality, scan quality, dan operasional internal.

Aturan yang wajib dipatuhi:
1. Jawaban harus tetap fokus pada kebutuhan karyawan PT EPSON.
2. Jangan menjawab topik umum di luar helpdesk, manufaktur, defect, printing, scan, SOP kerja, atau summary report.
3. Utamakan konteks knowledge base yang diberikan. Jangan mengarang fakta baru.
4. Jika konteks kurang kuat, katakan secara jujur dan arahkan user untuk eskalasi ke helpdesk/supervisor.
5. Gunakan bahasa Indonesia yang ringkas, sopan, dan operasional.
6. Jika ada gambar, gunakan gambar hanya sebagai petunjuk tambahan dan tetap hubungkan ke knowledge base.
7. Kembalikan JSON valid dengan format:
{
  "answer": "string",
  "confidence": "high|medium|low",
  "needsEscalation": true,
  "followUpQuestions": ["..."]
}

Profil user:
- Nama: ${input.employee.fullName}
- Departemen: ${input.employee.department}

Riwayat singkat:
${formattedHistory || 'Belum ada histori.'}

Pertanyaan user:
${input.question}

Knowledge base:
${formattedSources || 'Tidak ada knowledge yang cocok.'}
  `.trim()
}

function cleanJsonFence(payload: string) {
  return payload.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
}

function parseJsonAnswer(payload: string): ChatAnswer | null {
  try {
    const parsed = JSON.parse(cleanJsonFence(payload)) as ChatAnswer

    if (
      typeof parsed.answer === 'string' &&
      (parsed.confidence === 'high' ||
        parsed.confidence === 'medium' ||
        parsed.confidence === 'low') &&
      typeof parsed.needsEscalation === 'boolean' &&
      Array.isArray(parsed.followUpQuestions)
    ) {
      return parsed
    }
  } catch {
    return null
  }

  return null
}

function buildFallbackAnswer(question: string, sources: KnowledgeSource[]): ChatAnswer {
  const uniqueSources = Array.from(
    new Map(sources.map((source) => [source.documentId, source])).values(),
  )

  if (uniqueSources.length === 0) {
    return {
      answer:
        'Saya fokus pada helpdesk internal PT EPSON. Saat ini saya belum menemukan referensi dataset yang cukup untuk pertanyaan tersebut. Silakan perjelas gejala, lokasi proses, atau eskalasi ke helpdesk/supervisor terkait.',
      confidence: 'low',
      needsEscalation: true,
      followUpQuestions: [
        'Defect atau gejalanya muncul di proses apa?',
        'Apakah ada foto defect part atau hasil print/scan?',
      ],
    }
  }

  const topSources = uniqueSources
    .slice(0, 3)
    .map((source, index) => {
      const detail = source.answer ?? source.content
      return `${index + 1}. ${source.title}: ${detail}`
    })
    .join('\n')

  const mentionsImage = /gambar|foto|image/i.test(question)

  return {
    answer: [
      'Berikut panduan awal berdasarkan knowledge base internal yang tersedia:',
      topSources,
      mentionsImage
        ? 'Analisis gambar penuh sementara belum tersedia, jadi saya mengandalkan knowledge base tekstual yang ada.'
        : 'Jawaban ini sedang menggunakan fallback knowledge base lokal karena layanan Gemini belum merespons stabil.',
    ].join('\n\n'),
    confidence: 'medium',
    needsEscalation: false,
    followUpQuestions: [
      'Apakah kondisi aktual di line produksi sama dengan referensi di atas?',
      'Perlu saya bantu buat summary analysis report untuk atasan?',
    ],
  }
}

export async function answerHelpdeskQuestion(input: {
  employee: AuthUser
  question: string
  history: ConversationTurn[]
  sources: KnowledgeSource[]
  imagePath?: string
  imageMimeType?: string
}) {
  if (!genAI) {
    return buildFallbackAnswer(input.question, input.sources)
  }

  try {
    const prompt = buildSystemPrompt(input)
    const parts: Array<
      | { text: string }
      | {
          inlineData: {
            mimeType: string
            data: string
          }
        }
    > = [{ text: prompt }]

    if (input.imagePath && input.imageMimeType) {
      const buffer = await fs.readFile(input.imagePath)
      parts.push({
        inlineData: {
          mimeType: input.imageMimeType,
          data: buffer.toString('base64'),
        },
      })
    }

    const text = await generateContentWithRetry({ parts })
    const parsed = parseJsonAnswer(text)

    if (parsed) {
      return parsed
    }

    return buildFallbackAnswer(input.question, input.sources)
  } catch {
    return buildFallbackAnswer(input.question, input.sources)
  }
}

export async function generateConversationSummary(input: {
  employee: AuthUser
  supervisorEmail: string
  messages: ConversationTurn[]
}) {
  const transcript = input.messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n')

  if (!genAI) {
    return [
      `Summary untuk supervisor: ${input.supervisorEmail}`,
      `Karyawan: ${input.employee.fullName} (${input.employee.department})`,
      '',
      'Ringkasan percakapan:',
      transcript || 'Belum ada isi percakapan.',
      '',
      'Catatan: summary ini dibuat tanpa Gemini karena API key masih placeholder.',
    ].join('\n')
  }

  const prompt = `
Buat summary analysis report untuk supervisor internal PT EPSON.

Aturan:
1. Tulis dalam bahasa Indonesia.
2. Fokus pada masalah, indikasi akar masalah, tindakan yang sudah dilakukan, rekomendasi tindak lanjut, dan kebutuhan eskalasi.
3. Jangan menambah fakta baru di luar percakapan.
4. Format hasil sebagai teks biasa yang rapi dan siap dikirim email.

Profil karyawan:
- Nama: ${input.employee.fullName}
- Departemen: ${input.employee.department}

Email supervisor:
- ${input.supervisorEmail}

Transkrip:
${transcript || 'Belum ada isi percakapan.'}
  `.trim()

  const result = await generateContentWithRetry({ prompt })
  return result.trim()
}

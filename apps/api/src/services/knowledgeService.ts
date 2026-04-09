import { TaskType } from '@google/generative-ai'
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'

import { query } from '../db.js'
import { env, hasGeminiApiKey } from '../env.js'
import type { KnowledgeSource } from '../types.js'

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 650,
  chunkOverlap: 120,
})

const embeddings = hasGeminiApiKey()
  ? new GoogleGenerativeAIEmbeddings({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_EMBEDDING_MODEL,
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    })
  : null

function formatVector(values: number[]) {
  return `[${values.join(',')}]`
}

export async function splitDocument(content: string) {
  return splitter.splitText(content)
}

export async function replaceSuggestedQuestions(
  entries: Array<{ category: string; question: string; sortOrder: number }>,
) {
  await query('DELETE FROM suggested_questions')

  for (const entry of entries) {
    await query(
      `
        INSERT INTO suggested_questions (category, question, sort_order)
        VALUES ($1, $2, $3)
      `,
      [entry.category, entry.question, entry.sortOrder],
    )
  }
}

export async function clearSeededKnowledge() {
  await query(
    `
      DELETE FROM knowledge_documents
      WHERE source_type IN ('spreadsheet_faq', 'spreadsheet_request')
    `,
  )
}

export async function indexKnowledgeDocument(input: {
  sourceType: string
  sourceRef: string
  title: string
  category: string
  content: string
  answer: string | null
  metadata?: Record<string, unknown>
}) {
  const documentResult = await query<{ id: string }>(
    `
      INSERT INTO knowledge_documents (
        source_type,
        source_ref,
        title,
        category,
        content,
        answer,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING id
    `,
    [
      input.sourceType,
      input.sourceRef,
      input.title,
      input.category,
      input.content,
      input.answer,
      JSON.stringify(input.metadata ?? {}),
    ],
  )

  const documentId = documentResult.rows[0].id
  const chunks = await splitDocument(
    [input.title, input.content, input.answer].filter(Boolean).join('\n\n'),
  )

  let vectors: number[][] = []

  if (embeddings) {
    try {
      vectors = await embeddings.embedDocuments(chunks)
    } catch {
      vectors = []
    }
  }

  for (const [index, chunk] of chunks.entries()) {
    const vector = vectors[index] ? formatVector(vectors[index]) : null

    await query(
      `
        INSERT INTO knowledge_chunks (
          document_id,
          chunk_index,
          content,
          embedding,
          metadata
        )
        VALUES ($1, $2, $3, $4::vector, $5::jsonb)
      `,
      [
        documentId,
        index,
        chunk,
        vector,
        JSON.stringify({
          sourceRef: input.sourceRef,
          sourceType: input.sourceType,
        }),
      ],
    )
  }

  return documentId
}

export async function getSuggestedQuestions() {
  const result = await query<{
    id: string
    category: string
    question: string
  }>(
    `
      SELECT id, category, question
      FROM suggested_questions
      ORDER BY sort_order ASC, created_at ASC
    `,
  )

  return result.rows
}

async function embeddingSearch(question: string, limit: number) {
  if (!embeddings) {
    return []
  }

  try {
    const vector = await embeddings.embedQuery(question)
    const vectorLiteral = formatVector(vector)

    const result = await query<{
      chunk_id: string
      document_id: string
      title: string
      category: string
      source_type: string
      content: string
      answer: string | null
      metadata: Record<string, unknown>
      score: number
    }>(
      `
        SELECT
          kc.id AS chunk_id,
          kd.id AS document_id,
          kd.title,
          kd.category,
          kd.source_type,
          kc.content,
          kd.answer,
          kd.metadata,
          1 - (kc.embedding <=> $1::vector) AS score
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kd.id = kc.document_id
        WHERE kc.embedding IS NOT NULL
        ORDER BY kc.embedding <=> $1::vector
        LIMIT $2
      `,
      [vectorLiteral, limit],
    )

    return result.rows
  } catch {
    return []
  }
}

async function lexicalSearch(question: string, limit: number) {
  const result = await query<{
    chunk_id: string
    document_id: string
    title: string
    category: string
    source_type: string
    content: string
    answer: string | null
    metadata: Record<string, unknown>
    score: number
  }>(
    `
      SELECT
        kc.id AS chunk_id,
        kd.id AS document_id,
        kd.title,
        kd.category,
        kd.source_type,
        kc.content,
        kd.answer,
        kd.metadata,
        ts_rank(kc.searchable, plainto_tsquery('simple', $1)) AS score
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc.document_id
      WHERE kc.searchable @@ plainto_tsquery('simple', $1)
      ORDER BY score DESC, kc.created_at ASC
      LIMIT $2
    `,
    [question, limit],
  )

  if (result.rows.length > 0) {
    return result.rows
  }

  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((token, index, tokens) => {
      const stopwords = new Set([
        'yang',
        'untuk',
        'dengan',
        'atau',
        'dan',
        'saya',
        'kami',
        'jika',
        'apa',
        'bagaimana',
        'hasil',
        'awal',
        'saat',
        'agar',
      ])

      return token.length >= 4 && !stopwords.has(token) && tokens.indexOf(token) === index
    })
    .slice(0, 8)

  if (keywords.length > 0) {
    const scoreClauses = keywords
      .map(
        (_keyword, index) =>
          `CASE
             WHEN LOWER(kc.content) LIKE '%' || LOWER($${index + 1}) || '%'
               OR LOWER(kd.title) LIKE '%' || LOWER($${index + 1}) || '%'
               OR LOWER(COALESCE(kd.answer, '')) LIKE '%' || LOWER($${index + 1}) || '%'
             THEN 1
             ELSE 0
           END`,
      )
      .join(' + ')

    const whereClauses = keywords
      .map(
        (_keyword, index) =>
          `(LOWER(kc.content) LIKE '%' || LOWER($${index + 1}) || '%'
            OR LOWER(kd.title) LIKE '%' || LOWER($${index + 1}) || '%'
            OR LOWER(COALESCE(kd.answer, '')) LIKE '%' || LOWER($${index + 1}) || '%')`,
      )
      .join(' OR ')

    const keywordResult = await query<{
      chunk_id: string
      document_id: string
      title: string
      category: string
      source_type: string
      content: string
      answer: string | null
      metadata: Record<string, unknown>
      score: number
    }>(
      `
        SELECT
          kc.id AS chunk_id,
          kd.id AS document_id,
          kd.title,
          kd.category,
          kd.source_type,
          kc.content,
          kd.answer,
          kd.metadata,
          (${scoreClauses})::float AS score
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kd.id = kc.document_id
        WHERE ${whereClauses}
        ORDER BY score DESC, kc.created_at ASC
        LIMIT $${keywords.length + 1}
      `,
      [...keywords, limit],
    )

    if (keywordResult.rows.length > 0) {
      return keywordResult.rows
    }
  }

  const fallback = await query<{
    chunk_id: string
    document_id: string
    title: string
    category: string
    source_type: string
    content: string
    answer: string | null
    metadata: Record<string, unknown>
    score: number
  }>(
    `
      SELECT
        kc.id AS chunk_id,
        kd.id AS document_id,
        kd.title,
        kd.category,
        kd.source_type,
        kc.content,
        kd.answer,
        kd.metadata,
        0.1 AS score
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc.document_id
      WHERE kc.content ILIKE '%' || $1 || '%'
         OR kd.title ILIKE '%' || $1 || '%'
         OR COALESCE(kd.answer, '') ILIKE '%' || $1 || '%'
      ORDER BY kc.created_at ASC
      LIMIT $2
    `,
    [question, limit],
  )

  return fallback.rows
}

export async function searchKnowledge(
  question: string,
  limit = 4,
): Promise<KnowledgeSource[]> {
  const semantic = await embeddingSearch(question, limit)
  const lexical = await lexicalSearch(question, limit)

  const merged = [...semantic, ...lexical]
  const unique = new Map<string, KnowledgeSource>()

  for (const row of merged) {
    if (!unique.has(row.chunk_id)) {
      unique.set(row.chunk_id, {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        title: row.title,
        category: row.category,
        sourceType: row.source_type,
        content: row.content,
        answer: row.answer,
        metadata: row.metadata ?? {},
        score: Number(row.score ?? 0),
      })
    }
  }

  return [...unique.values()].slice(0, limit)
}

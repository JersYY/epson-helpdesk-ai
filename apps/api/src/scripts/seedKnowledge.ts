import path from 'node:path'

import XLSX from 'xlsx'

import { closePool } from '../db.js'
import { env } from '../env.js'
import {
  clearSeededKnowledge,
  indexKnowledgeDocument,
  replaceSuggestedQuestions,
} from '../services/knowledgeService.js'

function readSpreadsheetRows(sheetName: string) {
  const workbook = XLSX.readFile(env.KNOWLEDGE_SPREADSHEET_PATH)
  const worksheet = workbook.Sheets[sheetName]

  if (!worksheet) {
    return []
  }

  return XLSX.utils.sheet_to_json<(string | null)[]>(worksheet, {
    header: 1,
    defval: null,
  })
}

async function seedFaqRows() {
  const rows = readSpreadsheetRows('list pertanyaan').slice(1)
  let index = 0

  for (const row of rows) {
    const [category, question, answer] = row

    if (!category || !question || !answer) {
      continue
    }

    await indexKnowledgeDocument({
      sourceType: 'spreadsheet_faq',
      sourceRef: path.basename(env.KNOWLEDGE_SPREADSHEET_PATH),
      title: String(question),
      category: String(category),
      content: `Pertanyaan: ${question}`,
      answer: String(answer),
      metadata: {
        originSheet: 'list pertanyaan',
        rowNumber: index + 2,
      },
    })

    index += 1
  }
}

async function seedRequestRows() {
  const rows = readSpreadsheetRows('Request khusus')
  let itemIndex = 0

  for (const [first, second, third] of rows) {
    const text = third ?? second ?? first

    if (!text) {
      continue
    }

    if (String(text).toLowerCase().includes('request khusus')) {
      continue
    }

    await indexKnowledgeDocument({
      sourceType: 'spreadsheet_request',
      sourceRef: path.basename(env.KNOWLEDGE_SPREADSHEET_PATH),
      title: `Request khusus ${itemIndex + 1}`,
      category: 'Request Khusus',
      content: String(text),
      answer: String(text),
      metadata: {
        originSheet: 'Request khusus',
        rowNumber: itemIndex + 1,
      },
    })

    itemIndex += 1
  }
}

async function seedSuggestedQuestions() {
  await replaceSuggestedQuestions([
    {
      category: 'Printing Quality',
      question: 'Apa langkah awal jika hasil print bergaris atau banding saat proses quality check?',
      sortOrder: 1,
    },
    {
      category: 'Scan Quality',
      question: 'Apa yang perlu dicek jika hasil scan buram, terpotong, atau tidak terbaca?',
      sortOrder: 2,
    },
    {
      category: 'Assembly Defect',
      question: 'Bagaimana cara melaporkan defect part dari line assembly agar cepat dianalisis?',
      sortOrder: 3,
    },
    {
      category: 'Stopline',
      question: 'Jika ada masalah yang berpotensi stopline produksi, tindakan awal apa yang harus saya lakukan?',
      sortOrder: 4,
    },
    {
      category: 'Image Analysis',
      question: 'Bisakah saya upload foto defect part atau hasil printing quality untuk dianalisis?',
      sortOrder: 5,
    },
    {
      category: 'Reporting',
      question: 'Bagaimana membuat summary analysis report lalu mengirimkannya ke atasan?',
      sortOrder: 6,
    },
  ])
}

async function main() {
  if (!env.KNOWLEDGE_SPREADSHEET_PATH) {
    throw new Error('KNOWLEDGE_SPREADSHEET_PATH belum diisi.')
  }

  await clearSeededKnowledge()
  await seedFaqRows()
  await seedRequestRows()
  await seedSuggestedQuestions()

  console.log(`Knowledge seeded from ${env.KNOWLEDGE_SPREADSHEET_PATH}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool()
  })

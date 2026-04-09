export interface AuthUser {
  id: string
  employeeId: string
  fullName: string
  email: string
  department: string
  supervisorEmail: string | null
  role: string
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface KnowledgeSource {
  chunkId: string
  documentId: string
  title: string
  category: string
  sourceType: string
  content: string
  answer: string | null
  metadata: Record<string, unknown>
  score: number
}

export interface ChatAnswer {
  answer: string
  confidence: 'high' | 'medium' | 'low'
  needsEscalation: boolean
  followUpQuestions: string[]
}

export interface UserProfile {
  id: string
  employeeId: string
  fullName: string
  email: string
  department: string
  supervisorEmail: string | null
  role: string
}

export interface SuggestedQuestion {
  id: string
  category: string
  question: string
}

export interface SourceSummary {
  id: string
  title: string
  category: string
  score: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  attachmentName?: string
  confidence?: 'high' | 'medium' | 'low'
  needsEscalation?: boolean
  followUpQuestions?: string[]
  sources?: SourceSummary[]
}

export interface BootstrapResponse {
  user: UserProfile
  suggestedQuestions: SuggestedQuestion[]
}

export interface LoginResponse {
  token: string
  user: UserProfile
}

export interface ChatResponse {
  conversationId: string
  assistantMessage: {
    id: string
    role: 'assistant'
    content: string
    createdAt: string
    confidence: 'high' | 'medium' | 'low'
    needsEscalation: boolean
    followUpQuestions: string[]
  }
  sources: SourceSummary[]
}

export interface ReportResponse {
  report: {
    id: string
    subject: string
    summary: string
    recipientEmail: string
    createdAt: string
  }
  delivery: {
    delivered: boolean
    preview: string
  }
}

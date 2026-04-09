import type {
  BootstrapResponse,
  ChatResponse,
  LoginResponse,
  ReportResponse,
} from './types'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'

async function apiFetch<T>(
  path: string,
  options: {
    method?: string
    token?: string
    body?: BodyInit | string
    headers?: HeadersInit
  } = {},
) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body,
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { message?: string }
      | null

    throw new Error(error?.message ?? 'Request gagal diproses.')
  }

  return (await response.json()) as T
}

export function login(email: string, password: string) {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function bootstrap(token: string) {
  return apiFetch<BootstrapResponse>('/bootstrap', {
    token,
  })
}

export function sendChat(input: {
  token: string
  question: string
  conversationId?: string
  image?: File | null
}) {
  const formData = new FormData()
  formData.append('question', input.question)

  if (input.conversationId) {
    formData.append('conversationId', input.conversationId)
  }

  if (input.image) {
    formData.append('image', input.image)
  }

  return apiFetch<ChatResponse>('/chat', {
    method: 'POST',
    token: input.token,
    body: formData,
  })
}

export function sendSummaryReport(input: {
  token: string
  conversationId: string
  supervisorEmail?: string
}) {
  return apiFetch<ReportResponse>('/reports/email', {
    method: 'POST',
    token: input.token,
    body: JSON.stringify({
      conversationId: input.conversationId,
      supervisorEmail: input.supervisorEmail || undefined,
    }),
  })
}

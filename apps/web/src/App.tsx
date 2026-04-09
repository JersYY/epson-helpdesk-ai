import {
  type FormEvent,
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react'

import './App.css'
import { bootstrap, login, sendChat, sendSummaryReport } from './api'
import type {
  BootstrapResponse,
  ChatMessage,
  ReportResponse,
  UserProfile,
} from './types'

const TOKEN_STORAGE_KEY = 'epson-helpdesk-token'

function App() {
  const [token, setToken] = useState(
    () => window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '',
  )
  const [user, setUser] = useState<UserProfile | null>(null)
  const [suggestedQuestions, setSuggestedQuestions] = useState<
    BootstrapResponse['suggestedQuestions']
  >([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState('')
  const [loginForm, setLoginForm] = useState({
    email: 'operator.assembly@epson.local',
    password: 'Password123!',
  })
  const [questionDraft, setQuestionDraft] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [supervisorEmail, setSupervisorEmail] = useState('')
  const [latestReport, setLatestReport] = useState<ReportResponse | null>(null)
  const [statusMessage, setStatusMessage] = useState(
    'Sistem siap membantu problem solving di area manufacturing PT EPSON.',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const hasConversation = messages.length > 0
  const starterPrompts = suggestedQuestions.slice(0, 6)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    if (!token) {
      return
    }

    let active = true

    async function hydrate() {
      try {
        const data = await bootstrap(token)

        if (!active) {
          return
        }

        startTransition(() => {
          setUser(data.user)
          setSuggestedQuestions(data.suggestedQuestions)
          setSupervisorEmail(data.user.supervisorEmail ?? '')
        })
      } catch (error) {
        if (!active) {
          return
        }

        window.localStorage.removeItem(TOKEN_STORAGE_KEY)
        setToken('')
        setUser(null)
        setErrorMessage(
          error instanceof Error ? error.message : 'Gagal memuat sesi login.',
        )
      }
    }

    hydrate()

    return () => {
      active = false
    }
  }, [token])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthLoading(true)
    setErrorMessage('')

    try {
      const response = await login(loginForm.email, loginForm.password)
      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.token)
      setToken(response.token)
      setStatusMessage(
        `${response.user.fullName} siap memulai sesi helpdesk. Pertanyaan dan foto defect dapat dikirim kapan saja.`,
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Login gagal dilakukan.',
      )
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleSendQuestion(
    directQuestion?: string,
    directImage?: File | null,
  ) {
    if (!token || !user) {
      return
    }

    const nextQuestion = (directQuestion ?? questionDraft).trim()
    const nextImage = directImage ?? selectedImage

    if (!nextQuestion) {
      setErrorMessage('Tuliskan pertanyaan terlebih dahulu.')
      return
    }

    const userMessage: ChatMessage = {
      id: `draft-${Date.now()}`,
      role: 'user',
      content: nextQuestion,
      createdAt: new Date().toISOString(),
      attachmentName: nextImage?.name,
    }

    setMessages((current) => [...current, userMessage])
    setChatLoading(true)
    setErrorMessage('')
    setQuestionDraft('')
    setSelectedImage(null)
    setStatusMessage('AI sedang mencari knowledge yang paling relevan...')

    try {
      const response = await sendChat({
        token,
        question: nextQuestion,
        conversationId,
        image: nextImage,
      })

      setConversationId(response.conversationId)
      setMessages((current) => [
        ...current,
        {
          id: response.assistantMessage.id,
          role: 'assistant',
          content: response.assistantMessage.content,
          createdAt: response.assistantMessage.createdAt,
          confidence: response.assistantMessage.confidence,
          needsEscalation: response.assistantMessage.needsEscalation,
          followUpQuestions: response.assistantMessage.followUpQuestions,
          sources: response.sources,
        },
      ])
      setStatusMessage(
        'Jawaban terbaru siap. Sesi dapat dilanjutkan atau report dapat dibuat untuk atasan.',
      )
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== userMessage.id))
      setErrorMessage(
        error instanceof Error ? error.message : 'Pertanyaan gagal dikirim.',
      )
    } finally {
      setChatLoading(false)
    }
  }

  async function sendReport() {
    if (!token || !conversationId) {
      setErrorMessage('Belum ada percakapan yang bisa diringkas.')
      return
    }

    setReportLoading(true)
    setErrorMessage('')
    setStatusMessage('Membuat summary analysis report...')

    try {
      const response = await sendSummaryReport({
        token,
        conversationId,
        supervisorEmail,
      })

      setLatestReport(response)
      setStatusMessage(response.delivery.preview)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Report gagal dibuat.',
      )
    } finally {
      setReportLoading(false)
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken('')
    setUser(null)
    setSuggestedQuestions([])
    setMessages([])
    setConversationId('')
    setLatestReport(null)
    setSelectedImage(null)
    setStatusMessage('Sesi diakhiri. Silakan login kembali.')
    setErrorMessage('')
  }

  function handleNewChat() {
    setMessages([])
    setConversationId('')
    setLatestReport(null)
    setQuestionDraft('')
    setSelectedImage(null)
    setErrorMessage('')
    setStatusMessage('Percakapan baru siap dimulai.')
  }

  return (
    <main className="chat-shell">
      {!user ? (
        <section className="auth-screen">
          <article className="auth-card">
            <div className="auth-copy">
              <p className="auth-eyebrow">PT EPSON</p>
              <h1>EPSON Helpdesk AI</h1>
              <p className="auth-subtitle">
                Masuk untuk memulai sesi helpdesk internal berbasis teks, gambar,
                dan summary report.
              </p>
            </div>

            <form className="auth-form" onSubmit={handleLogin}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                />
              </label>
              <button className="primary-button" disabled={authLoading} type="submit">
                {authLoading ? 'Sedang login...' : 'Masuk ke Helpdesk AI'}
              </button>
            </form>

            <div className="auth-note">
              <p>Akun demo tersedia untuk pengujian.</p>
              <p>{errorMessage || statusMessage}</p>
            </div>
          </article>
        </section>
      ) : (
        <section className="chat-layout">
          <aside className="chat-sidebar">
            <div className="sidebar-header">
              <div>
                <p className="sidebar-caption">PT EPSON</p>
                <h2>Helpdesk AI</h2>
              </div>
              <button className="sidebar-button" onClick={handleNewChat} type="button">
                Chat baru
              </button>
            </div>

            <div className="sidebar-user">
              <p className="sidebar-caption">User aktif</p>
              <strong>{user.fullName}</strong>
              <span>{user.department}</span>
              <span>{user.email}</span>
            </div>

            <div className="sidebar-section">
              <p className="sidebar-caption">Prompt cepat</p>
              <div className="prompt-list">
                {starterPrompts.map((item) => (
                  <button
                    key={item.id}
                    className="prompt-button"
                    disabled={chatLoading}
                    onClick={() => {
                      void handleSendQuestion(item.question, null)
                    }}
                    type="button"
                  >
                    {item.question}
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <p className="sidebar-caption">Summary report</p>
              <div className="report-stack">
                <input
                  type="email"
                  value={supervisorEmail}
                  onChange={(event) => setSupervisorEmail(event.target.value)}
                  placeholder="Email atasan"
                />
                <button
                  className="primary-button contrast"
                  disabled={reportLoading || !conversationId}
                  onClick={(event) => {
                    event.preventDefault()
                    void sendReport()
                  }}
                  type="button"
                >
                  {reportLoading ? 'Membuat report...' : 'Kirim report'}
                </button>
                <p className="sidebar-note">
                  {latestReport
                    ? `Report terakhir dikirim ke ${latestReport.report.recipientEmail}.`
                    : 'Ringkasan dibuat dari percakapan aktif.'}
                </p>
              </div>
            </div>

            <div className="sidebar-footer">
              <p className="sidebar-note">{statusMessage}</p>
              <button className="ghost-button" onClick={handleLogout} type="button">
                Logout
              </button>
            </div>
          </aside>

          <section className="chat-main">
            <div className="chat-topbar">
              <div>
                <h2>EPSON Helpdesk AI</h2>
                <p className="chat-subtitle">
                  Troubleshooting internal untuk manufacturing, defect, printing, dan
                  scan quality.
                </p>
              </div>
            </div>

            <div className="chat-stream">
              {!hasConversation ? (
                <div className="chat-empty">
                  <div className="chat-empty-copy">
                    <h3>Mulai percakapan</h3>
                    <p>
                      Ajukan pertanyaan helpdesk, kirim foto defect, atau minta
                      summary report untuk supervisor.
                    </p>
                  </div>
                  <div className="starter-grid">
                    {starterPrompts.map((item) => (
                      <button
                        key={item.id}
                        className="starter-card"
                        onClick={() => void handleSendQuestion(item.question, null)}
                        type="button"
                      >
                        <span>{item.category}</span>
                        <strong>{item.question}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((message) => (
                <article className={`message-row ${message.role}`} key={message.id}>
                  <div className="message-meta">
                    <span>{message.role === 'user' ? 'Karyawan' : 'Helpdesk AI'}</span>
                    <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className={`message-bubble ${message.role}`}>
                    <p className="message-body">{message.content}</p>
                    {message.attachmentName ? (
                      <div className="attachment-chip">{message.attachmentName}</div>
                    ) : null}
                  </div>
                </article>
              ))}

              {chatLoading ? (
                <article className="message-row assistant">
                  <div className="message-meta">
                    <span>Helpdesk AI</span>
                  </div>
                  <div className="message-bubble assistant loading-bubble">
                    Menyusun jawaban...
                  </div>
                </article>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <form
              className="chat-composer"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSendQuestion()
              }}
            >
              {selectedImage ? (
                <div className="composer-chip-row">
                  <span className="file-chip">{selectedImage.name}</span>
                  <button
                    className="chip-clear"
                    onClick={() => setSelectedImage(null)}
                    type="button"
                  >
                    Hapus
                  </button>
                </div>
              ) : null}
              <div className="composer-shell">
                <textarea
                  placeholder="Ketik pertanyaan helpdesk atau jelaskan defect yang sedang terjadi..."
                  rows={4}
                  value={questionDraft}
                  onChange={(event) => setQuestionDraft(event.target.value)}
                />
                <div className="composer-toolbar">
                  <label className="composer-upload">
                    <span>Tambah gambar</span>
                    <input
                      accept="image/*"
                      hidden
                      onChange={(event) => setSelectedImage(event.target.files?.[0] ?? null)}
                      type="file"
                    />
                  </label>
                  <button className="primary-button" disabled={chatLoading} type="submit">
                    {chatLoading ? 'Memproses...' : 'Kirim'}
                  </button>
                </div>
              </div>
              {errorMessage ? <p className="composer-error">{errorMessage}</p> : null}
            </form>
          </section>
        </section>
      )}
    </main>
  )
}

export default App

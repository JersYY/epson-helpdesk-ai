# EPSON Helpdesk AI

Helpdesk chatbot AI internal untuk karyawan PT EPSON.

Project ini dibuat untuk kebutuhan capstone berdasarkan spreadsheet referensi yang berisi:

- daftar pertanyaan dan jawaban awal
- kebutuhan akses internal perusahaan
- dukungan text dan gambar defect
- login user dan activity log
- summary analysis report ke atasan melalui email

## Tujuan

Membangun chatbot helpdesk internal yang dapat:

- membantu karyawan PT EPSON mencari jawaban operasional secara cepat
- tetap fokus pada domain manufaktur, assembly, printing quality, dan scan quality
- menerima pertanyaan teks maupun gambar defect
- menyusun ringkasan analisis lalu mengirimkannya ke atasan

## Tech Stack

- Frontend: React + Vite + TypeScript
- Backend: Express.js + TypeScript
- AI Processing: LangChain + Gemini
- Database: PostgreSQL + `pgvector`
- Email: SMTP via Mailpit untuk development
- Dev Services: Docker Compose

## Fitur Utama

- login user internal
- chat helpdesk berbasis web internal
- suggested questions untuk memandu karyawan
- knowledge base dari spreadsheet Epson
- guardrail agar jawaban tidak melebar ke luar konteks helpdesk internal
- upload gambar defect part atau printing quality
- summary analysis report
- pengiriman email report ke atasan
- audit log aktivitas user

## Arsitektur Singkat

- `apps/web`:
  frontend React untuk login, chat, upload gambar, dan report
- `apps/api`:
  backend Express untuk auth, chat API, retrieval, Gemini, audit log, dan email
- `database/init.sql`:
  schema PostgreSQL
- `docs/architecture.md`:
  penjelasan arsitektur dan alur sistem

## Struktur Folder

```text
epson-helpdesk-ai/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   ├── .env
│   │   └── .env.example
│   └── web/
│       ├── src/
│       ├── .env
│       └── .env.example
├── database/
│   └── init.sql
├── docs/
│   └── architecture.md
├── docker-compose.yml
├── package.json
└── README.md
```

## Kebutuhan Sebelum Menjalankan

Pastikan environment Anda memiliki:

- Node.js 22+
- npm 10+
- Docker
- Docker Compose

## Konfigurasi Environment

File environment utama:

- [apps/api/.env](/home/jersyy/capstone/epson/epson-helpdesk-ai/apps/api/.env)
- [apps/web/.env](/home/jersyy/capstone/epson/epson-helpdesk-ai/apps/web/.env)

Catatan:

- sekarang placeholder hanya tersisa untuk `GEMINI_API_KEY`
- PostgreSQL, JWT, dan SMTP development sudah dibuat siap pakai
- SMTP development memakai Mailpit lokal

## Cara Menjalankan Project

### 1. Install dependency

```bash
npm install
```

### 2. Jalankan service development

```bash
npm run dev:services:up
```

Service yang akan aktif:

- PostgreSQL: `localhost:5432`
- Mailpit SMTP: `localhost:1025`
- Mailpit UI: `http://localhost:8025`

### 3. Jalankan schema database

```bash
psql "postgresql://postgres:postgres@localhost:5432/epson_helpdesk_ai" -f database/init.sql
```

### 4. Seed data awal

```bash
npm run seed:demo
npm run seed:kb
```

### 5. Jalankan backend dan frontend

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:web
```

## URL Development

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`
- API Health Check: `http://localhost:4000/api/health`
- Mailpit UI: `http://localhost:8025`

## Akun Demo

Gunakan akun berikut untuk login:

- Email: `operator.assembly@epson.local`
- Password: `Password123!`

## Pertanyaan Awal yang Sudah Disiapkan

Beberapa contoh pertanyaan yang sudah dimasukkan ke sistem:

- Apa langkah awal jika hasil print bergaris atau banding saat quality check?
- Apa yang perlu dicek jika hasil scan buram, terpotong, atau tidak terbaca?
- Bagaimana cara melaporkan defect part dari line assembly agar cepat dianalisis?
- Jika ada masalah yang berpotensi stopline produksi, tindakan awal apa yang harus saya lakukan?
- Bisakah saya upload foto defect part atau hasil printing quality untuk dianalisis?
- Bagaimana membuat summary analysis report lalu mengirimkannya ke atasan?

## Sumber Knowledge Base

Knowledge base awal berasal dari spreadsheet:

- `Jawab_Pertanyaan_Capstone_Chatboot (1).xlsx`

Isi spreadsheet tersebut diubah menjadi:

- `knowledge_documents`
- `knowledge_chunks`
- `suggested_questions`

## Guardrail AI

Chatbot dibatasi agar:

- fokus pada kebutuhan internal PT EPSON
- tidak menjawab topik umum di luar konteks helpdesk/manufaktur
- mengutamakan knowledge base yang tersedia
- memberi arahan eskalasi jika konteks kurang kuat

## Email dan Reporting

Untuk development:

- email dikirim ke Mailpit lokal
- semua email report bisa dilihat di `http://localhost:8025`

Untuk production/internal deployment:

- ganti konfigurasi SMTP lokal dengan SMTP internal perusahaan

## Script Penting

```bash
npm run dev:services:up
npm run dev:services:down
npm run dev:api
npm run dev:web
npm run seed:demo
npm run seed:kb
npm run build
npm run lint
```

## Status Implementasi Saat Ini

Yang sudah berjalan:

- frontend React
- backend Express
- login demo
- knowledge seed dari spreadsheet
- integrasi Gemini
- SMTP development via Mailpit
- summary report via email

Yang bisa dikembangkan lagi:

- upload dataset internal dari dashboard admin
- histori percakapan per user
- role admin/supervisor
- evaluasi relevance retrieval yang lebih kuat
- integrasi ke jaringan internal Epson


## Dokumentasi Tambahan

- Arsitektur: [docs/architecture.md](/home/jersyy/capstone/epson/epson-helpdesk-ai/docs/architecture.md)


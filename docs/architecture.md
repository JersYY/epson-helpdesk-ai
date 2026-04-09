# Arsitektur MVP

## Tujuan

Menyediakan chatbot helpdesk internal untuk karyawan PT EPSON yang:

- Menjawab pertanyaan troubleshooting berbasis dataset internal
- Menerima pertanyaan teks dan gambar
- Menyimpan histori chat dan aktivitas pengguna
- Membuat summary analysis report
- Mengirim summary ke atasan melalui SMTP

## Komponen

### Frontend React

- Login karyawan
- Daftar pertanyaan cepat
- Chat dengan upload gambar defect
- Panel status guardrail dan sumber knowledge
- Tombol generate dan kirim report

### Backend Express

- Auth JWT
- Endpoint bootstrap, chat, dan report
- Audit log
- Integrasi PostgreSQL
- Knowledge retrieval berbasis text search dan embedding
- Integrasi Gemini untuk jawaban dan summary

### Knowledge Layer

- Spreadsheet Epson dimasukkan ke tabel `knowledge_documents` dan `knowledge_chunks`
- Chunk displit memakai LangChain text splitter
- Embedding disimpan di PostgreSQL `pgvector`
- Saat query masuk, sistem mengambil chunk yang paling relevan lalu menyusun jawaban

## Guardrail AI

- Chatbot hanya menjawab topik helpdesk/manufaktur/PT EPSON
- Jika di luar cakupan, chatbot menolak dengan sopan dan menyarankan eskalasi
- Jawaban wajib mengacu pada konteks dataset yang ditemukan
- Jika keyakinan rendah, chatbot memberi disclaimer dan langkah eskalasi
- Riwayat percakapan dan sumber jawaban dicatat untuk audit

## Alur Chat

1. User login
2. User mengirim pertanyaan teks atau teks + gambar
3. Backend mencari knowledge yang relevan
4. Gemini menghasilkan jawaban berdasarkan guardrail dan konteks
5. Jawaban, sumber, dan metadata confidence disimpan ke database
6. User dapat meminta summary report dan mengirimkannya ke email atasan

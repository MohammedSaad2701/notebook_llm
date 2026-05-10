# PDF-Constrained Groq Chatbot

Simple local setup for a PDF chatbot that answers only from uploaded PDF content.

## Backend

```bash
cd backend
python3 -m pip install -r requirements.txt
cp .env.example .env
```

Add your Groq API key to `backend/.env`:

```bash
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama-3.1-8b-instant
```

Run the backend:

```bash
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## API Flow

- `POST /upload` accepts a PDF file and returns a `pdf_id`.
- `POST /chat` accepts `pdf_id` and `question`.
- The backend retrieves relevant PDF chunks and sends only those chunks to Groq with a strict PDF-constrained prompt.

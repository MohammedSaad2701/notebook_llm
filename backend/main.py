import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pypdf import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="PDF-Constrained Groq Chatbot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = BASE_DIR / "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

PDF_STORE: dict[str, dict[str, Any]] = {}
RETRIEVAL_MIN_SCORE = 0.03

PDF_CONSTRAINED_SYSTEM_PROMPT = """
You are a PDF-constrained chatbot.

Rules:
1. Answer only from the provided PDF context.
2. Do not use outside knowledge, even if you know the answer.
3. If the answer is not clearly present in the context, say exactly:
   "I cannot find this information in the provided PDF."
4. Cite page numbers for every factual answer.
5. Be concise, direct, and helpful.
6. Never invent facts, citations, names, dates, numbers, or explanations.
"""


def get_groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GROQ_API_KEY. Add it to backend/.env.")

    return Groq(api_key=api_key)


def extract_pages(pdf_path: str) -> list[dict[str, Any]]:
    reader = PdfReader(pdf_path)
    pages = []

    for index, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append({"page_number": index + 1, "text": text.strip()})

    return pages


def chunk_pages(
    pages: list[dict[str, Any]], chunk_size: int = 900, overlap: int = 150
) -> list[dict[str, Any]]:
    chunks = []

    for page in pages:
        text = page["text"]
        start = 0

        while start < len(text):
            chunk = text[start : start + chunk_size].strip()
            if chunk:
                chunks.append(
                    {"text": chunk, "page_number": page["page_number"]}
                )

            start += chunk_size - overlap

    return chunks


def build_index(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    texts = [chunk["text"] for chunk in chunks]
    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform(texts)
    return {"vectorizer": vectorizer, "matrix": matrix}


def retrieve_chunks(pdf_id: str, question: str, limit: int = 4) -> list[dict[str, Any]]:
    stored_pdf = PDF_STORE[pdf_id]
    index = stored_pdf["index"]
    chunks = stored_pdf["chunks"]

    query_vector = index["vectorizer"].transform([question])
    scores = cosine_similarity(query_vector, index["matrix"])[0]
    ranked_indices = scores.argsort()[::-1][:limit]

    results = []
    for chunk_index in ranked_indices:
        score = scores[chunk_index]
        if score <= 0:
            continue

        chunk = chunks[chunk_index]
        results.append(
            {
                "text": chunk["text"],
                "page_number": chunk["page_number"],
                "score": float(score),
            }
        )

    return results


def build_context(chunks: list[dict[str, Any]]) -> str:
    return "\n\n".join(
        f"[Page {chunk['page_number']}]\n{chunk['text']}" for chunk in chunks
    )


def ask_groq(question: str, context: str) -> str:
    client = get_groq_client()

    response = client.chat.completions.create(
        model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
        messages=[
            {"role": "system", "content": PDF_CONSTRAINED_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "PDF context:\n"
                    f"{context}\n\n"
                    "Question:\n"
                    f"{question}\n\n"
                    "Answer with page citations:"
                ),
            },
        ],
        temperature=0.1,
        max_tokens=700,
    )

    return response.choices[0].message.content


@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "PDF-constrained Groq backend is live",
    }


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return {"error": "Only PDF files are allowed."}

    pdf_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{pdf_id}.pdf")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    pages = extract_pages(file_path)
    chunks = chunk_pages(pages)

    if not chunks:
        return {"error": "No readable text found in the PDF."}

    PDF_STORE[pdf_id] = {
        "filename": file.filename,
        "file_path": file_path,
        "pages": pages,
        "chunks": chunks,
        "index": build_index(chunks),
    }

    return {
        "message": "PDF uploaded and processed successfully.",
        "pdf_id": pdf_id,
        "filename": file.filename,
        "total_pages": len(pages),
        "total_chunks": len(chunks),
    }


@app.post("/chat")
async def chat_with_pdf(pdf_id: str = Form(...), question: str = Form(...)):
    if pdf_id not in PDF_STORE:
        return {"error": "Invalid PDF ID. Please upload a PDF first."}

    retrieved_context = retrieve_chunks(pdf_id, question)
    best_score = retrieved_context[0]["score"] if retrieved_context else 0

    if best_score < RETRIEVAL_MIN_SCORE:
        return {
            "answer": "I cannot find this information in the provided PDF.",
            "citations": [],
            "retrieved_context": retrieved_context,
            "status": "out_of_scope",
        }

    try:
        answer = ask_groq(question, build_context(retrieved_context))
    except RuntimeError as error:
        return {"error": str(error), "status": "error"}

    citations = sorted({chunk["page_number"] for chunk in retrieved_context})

    return {
        "answer": answer,
        "citations": citations,
        "retrieved_context": retrieved_context,
        "status": "answered",
    }

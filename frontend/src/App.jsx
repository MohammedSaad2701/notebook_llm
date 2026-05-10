import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://notebook-llm-1-nyob.onrender.com";

function formatErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function CitationBadges({ citations = [] }) {
  if (!citations.length) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {citations.map((page) => (
        <span
          key={page}
          className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700"
        >
          Page {page}
        </span>
      ))}
    </div>
  );
}

function RetrievedEvidence({ items = [] }) {
  if (!items.length) {
    return null;
  }

  return (
    <details className="mt-4 rounded-2xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700">
        Retrieved Evidence
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-4">
        {items.map((item, index) => (
          <article
            key={`${item.page_number}-${index}`}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Page {item.page_number}
            </div>
            <p className="text-sm leading-6 text-slate-700">{item.text}</p>
          </article>
        ))}
      </div>
    </details>
  );
}

function EmptyState({ uploaded }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
      <div className="rounded-full bg-cyan-50 p-6">
        <svg
          className="h-12 w-12 text-sky-700"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 8V6a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3v-2M4 12h9m-3-3 3 3-3 3"
          />
        </svg>
      </div>
      <h3 className="mt-6 text-[18px] font-semibold text-slate-900">
        {uploaded ? "Ask about your PDF" : "Upload a PDF to begin"}
      </h3>
      <p className="mt-3 max-w-md text-[13px] leading-7 text-slate-500">
        {uploaded
          ? "Use the chat box below to ask grounded questions and review backend-provided citations."
          : "Use the upload panel to load a PDF before starting the chat."}
      </p>
    </div>
  );
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadInfo, setUploadInfo] = useState(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isChatting]);

  const canSend = useMemo(() => {
    return Boolean(uploadInfo?.pdf_id) && question.trim() && !isChatting;
  }, [uploadInfo?.pdf_id, question, isChatting]);

  async function uploadPdf() {
    if (!selectedFile) {
      setErrorMessage("Please choose a PDF before uploading.");
      return;
    }

    setErrorMessage("");
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to upload PDF.");
      }

      setUploadInfo(data);
      setMessages([]);
      setQuestion("");
    } catch (error) {
      setUploadInfo(null);
      setMessages([]);
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  async function sendQuestion(submittedQuestion) {
    const trimmedQuestion = submittedQuestion.trim();
    if (!trimmedQuestion || !uploadInfo?.pdf_id) {
      return;
    }

    setErrorMessage("");
    setIsChatting(true);

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");

    try {
      const formData = new FormData();
      formData.append("pdf_id", uploadInfo.pdf_id);
      formData.append("question", trimmedQuestion);

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to fetch an answer.");
      }

      const isOutOfScope = data.status === "out_of_scope";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: isOutOfScope
            ? "This question is outside the uploaded PDF."
            : data.answer,
          citations: data.citations || [],
          evidence: data.retrieved_context || [],
          status: data.status,
        },
      ]);
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setIsChatting(false);
    }
  }

  function handleQuestionSubmit(event) {
    event.preventDefault();
    void sendQuestion(question);
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4b98c4] text-[18px] font-semibold text-white">
              Č
            </div>
            <div>
              <h1 className="text-[22px] font-semibold leading-none text-slate-900">
                ChatPDF
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-8 py-8">
        <div className="grid gap-7 xl:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <h2 className="text-[26px] font-semibold leading-[1.08] tracking-tight text-slate-900">
              PDF Chat
            </h2>
            <p className="mt-6 max-w-md text-[14px] leading-8 text-slate-500">
              Upload a PDF, ask questions, and get grounded answers from the
              uploaded document.
            </p>

            <div className="mt-7 rounded-[2rem] border border-dashed border-[#cfd9e6] bg-[#fbfdff] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-[#3b81a9]">
                  <svg
                    className="h-7 w-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 16V4m0 0-4 4m4-4 4 4M4 14v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-[16px] font-semibold text-slate-900">
                    {uploadInfo ? "PDF uploaded" : "No PDF uploaded yet"}
                  </div>
                  <div className="mt-1.5 text-[13px] leading-7 text-slate-500">
                    {uploadInfo
                      ? uploadInfo.filename
                      : "Choose a PDF to preview the interface."}
                  </div>
                </div>
              </div>

              <label className="mt-6 block cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setSelectedFile(file);
                    setErrorMessage("");
                  }}
                />
                <div className="rounded-2xl border border-transparent bg-[#4a97c0] px-6 py-3 text-center text-[15px] font-medium text-white transition hover:bg-[#408ab2]">
                  {selectedFile ? "Ready to upload PDF" : "Upload PDF"}
                </div>
              </label>

              <button
                type="button"
                onClick={uploadPdf}
                disabled={!selectedFile || isUploading}
                className="mt-3.5 w-full rounded-2xl bg-slate-100 px-6 py-3 text-[15px] font-semibold text-slate-500 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isUploading ? "Uploading..." : "Confirm Upload"}
              </button>
            </div>

            {uploadInfo && (
              <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-[#fafcff] p-5">
                <div className="text-[15px] font-semibold text-slate-900">
                  Uploaded document
                </div>
                <p className="mt-2.5 text-[13px] leading-7 text-slate-500">
                  {uploadInfo.filename}
                </p>
              </div>
            )}
          </aside>

          <section className="flex min-h-[780px] flex-col rounded-[2rem] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <div className="border-b border-slate-200 px-8 py-5">
              <h2 className="text-[20px] font-semibold text-slate-900">
                Conversation
              </h2>
              <p className="mt-2 text-[13px] leading-7 text-slate-500">
                Ask questions about the uploaded PDF and review citations.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-7">
              {!messages.length ? (
                <EmptyState uploaded={Boolean(uploadInfo?.pdf_id)} />
              ) : (
                <div className="space-y-8">
                  {messages.map((message) => {
                    const isUser = message.role === "user";
                    const isWarning = message.status === "out_of_scope";

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-3xl rounded-[1.75rem] px-5 py-4 ${
                            isUser
                              ? "bg-[#06091d] text-white"
                              : isWarning
                                ? "border border-amber-200 bg-amber-50 text-amber-950"
                                : "border border-slate-200 bg-slate-50 text-slate-900"
                          }`}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] opacity-70">
                            {isUser ? "Question" : isWarning ? "Refusal" : "Assistant"}
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-7">
                            {message.content}
                          </p>
                          {!isUser && !isWarning && (
                            <CitationBadges citations={message.citations} />
                          )}
                          {!isUser && <RetrievedEvidence items={message.evidence} />}
                        </div>
                      </div>
                    );
                  })}

                  {isChatting && (
                    <div className="flex justify-start">
                      <div className="rounded-[2rem] border border-slate-200 bg-slate-50 px-5 py-4 text-[1.02rem] text-slate-500">
                        <div className="text-[14px] text-slate-500">
                          Searching the uploaded PDF and waiting for the backend...
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 px-8 py-5">
              {errorMessage && (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleQuestionSubmit} className="flex gap-4">
                <input
                  type="text"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={
                    uploadInfo
                      ? "Ask something about the uploaded PDF"
                      : "Upload a PDF to start the preview"
                  }
                  disabled={!uploadInfo?.pdf_id || isChatting}
                  className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  className="flex h-[52px] w-[52px] items-center justify-center rounded-3xl bg-[#a9d3e6] text-white transition hover:bg-[#98c8dd] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m20 12-15-7 4 7-4 7 15-7Zm0 0H9"
                    />
                  </svg>
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;

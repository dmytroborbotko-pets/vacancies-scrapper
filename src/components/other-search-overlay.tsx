"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "text"; delta: string }
  | { type: "done"; found: number; created: number }
  | { type: "error"; message: string };

const BUFFER_CHAR_LIMIT = 4000;

export function OtherSearchTrigger({
  cvProfileId,
  className,
}: {
  cvProfileId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("Запускаю…");
  const [narration, setNarration] = useState("");
  const [done, setDone] = useState<{ found: number; created: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [narration]);

  async function run() {
    setOpen(true);
    setStatus("Запускаю…");
    setNarration("");
    setDone(null);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(
        `/api/run-other?cvProfileId=${encodeURIComponent(cvProfileId)}`,
        { signal: controller.signal },
      );
      if (!response.body) throw new Error("Немає потоку відповіді");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "status") {
            setStatus(event.message);
          } else if (event.type === "text") {
            setNarration((prev) => (prev + event.delta).slice(-BUFFER_CHAR_LIMIT));
          } else if (event.type === "done") {
            setDone({ found: event.found, created: event.created });
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Невідома помилка");
      }
    } finally {
      router.refresh();
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        className={className}
      >
        Запустити «Інші» зараз
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl flex-col items-center gap-4 px-6 text-center">
            {!done && !error && (
              <>
                <Spinner className="h-8 w-8 text-zinc-300" />
                <p className="text-sm font-medium text-zinc-300">{status}</p>
                <div
                  ref={scrollRef}
                  className="h-64 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950/60 p-4 text-left font-mono text-sm leading-relaxed text-zinc-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <span className="animate-pulse">{narration || "…"}</span>
                </div>
                <button
                  type="button"
                  onClick={cancel}
                  className="text-xs text-zinc-500 underline hover:text-zinc-300"
                >
                  Скасувати
                </button>
              </>
            )}

            {done && (
              <>
                <p className="text-lg font-medium text-zinc-100">Готово</p>
                <p className="text-sm text-zinc-400">
                  Знайдено: {done.found} · Нових: {done.created}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-300"
                >
                  Закрити
                </button>
              </>
            )}

            {error && (
              <>
                <p className="text-lg font-medium text-red-400">Помилка</p>
                <p className="text-sm text-zinc-400">{error}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
                >
                  Закрити
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

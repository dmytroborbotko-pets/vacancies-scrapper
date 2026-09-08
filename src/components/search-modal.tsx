"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";
import { SearchParamsFields, SCOPE_LABELS, type Scope } from "@/components/search-params-fields";
import { ALL_CV_PROFILES } from "@/lib/search-constants";
import { createScheduledSearch, setHideScheduleSuggestion } from "@/app/settings/schedule-actions";
import { INTERVAL_LABELS, SCHEDULE_ERROR_LABELS, type ScheduleInterval } from "@/lib/scheduling";

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "done"; found: number; created: number; failed: number }
  | { type: "error"; message: string }
  | { type: "ping" };

type Stage = "config" | "running" | "schedule-suggest" | "done" | "error";

type Result = { found: number; created: number; failed: number } | "unknown" | null;

export function SearchModal({
  cvProfiles,
  defaultCvProfileId,
  triggerLabel,
  triggerClassName,
  hideScheduleSuggestion,
  disabled = false,
}: {
  cvProfiles: { id: string; label: string }[];
  defaultCvProfileId: string;
  triggerLabel: string;
  triggerClassName?: string;
  hideScheduleSuggestion: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const intervalGroupName = useId();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("config");
  const [cvProfileId, setCvProfileId] = useState(defaultCvProfileId);
  const [scope, setScope] = useState<Scope>("BOTH");
  const [requireReservation, setRequireReservation] = useState(false);
  const [status, setStatus] = useState("Запускаю…");
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState<string | null>(null);
  const [intervalValue, setIntervalValue] = useState<ScheduleInterval>("DAILY");
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [schedulePending, setSchedulePending] = useState(false);
  const [suppressed, setSuppressed] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  function openModal() {
    if (stage === "running") return;
    setCvProfileId(defaultCvProfileId);
    setScope("BOTH");
    setRequireReservation(false);
    setStatus("Запускаю…");
    setResult(null);
    setError(null);
    setIntervalValue("DAILY");
    setDontShowAgain(false);
    setScheduled(false);
    setScheduleError(null);
    setStage("config");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  function cancel() {
    abortRef.current?.abort();
    setOpen(false);
  }

  async function runSearch() {
    setStage("running");
    setStatus("Запускаю…");

    // Track what happened locally during the stream — the terminal event
    // (or its absence) decides the next stage exactly once, at the end.
    // Branching on React state set mid-loop from the finally block below
    // would race the not-yet-applied setState calls.
    let terminalResult: Result = null;
    let terminalError: string | null = null;

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvProfileId, scope, requireReservation }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Не вдалося запустити пошук");
      if (!response.body) throw new Error("Немає потоку відповіді");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotTerminalEvent = false;

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
          } else if (event.type === "done") {
            gotTerminalEvent = true;
            terminalResult = { found: event.found, created: event.created, failed: event.failed };
          } else if (event.type === "error") {
            gotTerminalEvent = true;
            terminalError = event.message;
          }
        }
      }

      // The connection can close cleanly (no thrown error) without the
      // final "done" byte having made it across — e.g. the server function
      // hit its own time limit right at the tail end, after already
      // persisting everything. That's still a finished run, not a failure
      // — treat it as an ambiguous-but-likely-successful completion.
      if (!gotTerminalEvent) {
        terminalResult = "unknown";
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // user cancelled — modal is already closed by the cancel handler
      }
      terminalError = err instanceof Error ? err.message : "Невідома помилка";
    } finally {
      router.refresh();
    }

    if (terminalError) {
      setError(terminalError);
      setStage("error");
    } else {
      setResult(terminalResult);
      setStage(hideScheduleSuggestion || suppressed ? "done" : "schedule-suggest");
    }
  }

  async function confirmSchedule() {
    setScheduleError(null);
    setSchedulePending(true);
    try {
      const formData = new FormData();
      formData.set("cvProfileId", cvProfileId);
      formData.set("scope", scope);
      formData.set("requireReservation", requireReservation ? "true" : "false");
      formData.set("interval", intervalValue);

      const scheduleResult = await createScheduledSearch(formData);

      // Honour the checkbox regardless of whether the schedule itself
      // succeeded — the user's "don't show again" preference is independent
      // of whether this particular schedule request went through.
      if (dontShowAgain) {
        await setHideScheduleSuggestion(true);
        setSuppressed(true);
      }

      if (!scheduleResult.ok) {
        setScheduleError(`Не вдалося запланувати: ${SCHEDULE_ERROR_LABELS[scheduleResult.reason]}`);
        return;
      }

      setScheduled(true);
      setStage("done");
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Невідома помилка");
    } finally {
      setSchedulePending(false);
    }
  }

  async function skipSchedule() {
    setScheduleError(null);
    setSchedulePending(true);
    try {
      if (dontShowAgain) {
        await setHideScheduleSuggestion(true);
        setSuppressed(true);
      }
      setStage("done");
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Невідома помилка");
    } finally {
      setSchedulePending(false);
    }
  }

  const cvLabel =
    cvProfileId === ALL_CV_PROFILES
      ? "Всі CV"
      : (cvProfiles.find((cv) => cv.id === cvProfileId)?.label ?? "CV");

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={open || disabled}
        className={`${triggerClassName ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            {stage === "config" && (
              <>
                <h2 className="text-xl font-semibold">Запустити пошук</h2>
                <SearchParamsFields
                  cvProfiles={cvProfiles}
                  cvProfileId={cvProfileId}
                  onCvProfileIdChange={setCvProfileId}
                  scope={scope}
                  onScopeChange={setScope}
                  requireReservation={requireReservation}
                  onRequireReservationChange={setRequireReservation}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={runSearch}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Шукати
                  </button>
                </div>
              </>
            )}

            {stage === "running" && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <Spinner className="h-8 w-8 text-zinc-400 dark:text-zinc-300" />
                <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">{status}</p>
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Скасувати
                </button>
              </div>
            )}

            {stage === "schedule-suggest" && (
              <>
                <h2 className="text-xl font-semibold">Запланувати цей пошук?</h2>
                <p className="text-sm text-zinc-500">
                  {cvLabel} · {SCOPE_LABELS[scope]}
                  {requireReservation && " · лише з бронюванням"}
                </p>

                <fieldset className="flex flex-col gap-1">
                  <legend className="text-sm text-zinc-500">Як часто</legend>
                  {(Object.entries(INTERVAL_LABELS) as [ScheduleInterval, string][]).map(
                    ([value, label]) => (
                      <label key={value} className="flex items-center gap-2 text-base">
                        <input
                          type="radio"
                          name={intervalGroupName}
                          value={value}
                          checked={intervalValue === value}
                          onChange={() => setIntervalValue(value)}
                        />
                        {label}
                      </label>
                    ),
                  )}
                </fieldset>

                <label className="flex items-center gap-2 text-base">
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                  />
                  Більше не пропонувати
                </label>

                {scheduleError && <p className="text-base text-red-500">{scheduleError}</p>}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={skipSchedule}
                    disabled={schedulePending}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Ні
                  </button>
                  <button
                    type="button"
                    onClick={confirmSchedule}
                    disabled={schedulePending}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-base font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Так, запланувати
                  </button>
                </div>
              </>
            )}

            {stage === "done" && (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <p className="text-lg font-medium">Готово</p>
                <p className="text-base text-zinc-500">
                  {result === "unknown" &&
                    "Пошук завершився. Онови сторінку, щоб побачити нові вакансії, якщо вони є."}
                  {result && result !== "unknown" && (
                    <>
                      Знайдено: {result.found} · Нових: {result.created}
                      {result.failed > 0 && ` · Помилок: ${result.failed}`}
                    </>
                  )}
                </p>
                {scheduled && (
                  <p className="text-base text-zinc-500">Заплановано на повторення.</p>
                )}
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Закрити
                </button>
              </div>
            )}

            {stage === "error" && (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <p className="text-lg font-medium text-red-500 dark:text-red-400">Помилка</p>
                <p className="text-base text-zinc-500">{error}</p>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Закрити
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

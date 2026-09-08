import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { runSearch, type SearchScope } from "@/lib/ingest";
import { ALL_CV_PROFILES } from "@/components/search-params-fields";

// DOU (rate-limited) + Djinni + the OTHER web-search leg, across possibly
// several CVs in one "Всі" run, can together run close to 300s — the hard
// ceiling on the Hobby plan.
export const maxDuration = 300;

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "done"; found: number; created: number; failed: number }
  | { type: "error"; message: string }
  | { type: "ping" };

const VALID_SCOPES: SearchScope[] = ["DOU", "DJINNI", "BOTH", "EVERYWHERE"];

// Single streaming entry point for every manual search — replaces the old
// plain-redirect "run all CVs" route and the separate "Інші" NDJSON route.
// Body: { cvProfileId: string | ALL_CV_PROFILES, scope: SearchScope, requireReservation: boolean }.
export async function POST(request: Request) {
  const userId = await requireUserId();
  const body: Record<string, unknown> = await request.json().catch(() => ({}));
  const cvProfileIdParam = String(body.cvProfileId ?? "");
  const scopeParam = body.scope;
  const requireReservation = body.requireReservation === true;

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      // A silent multi-minute leg (e.g. EVERYWHERE waiting on web_search)
      // can let an idle intermediate proxy drop the connection long before
      // either side times out — a steady trickle of bytes keeps it alive.
      heartbeat = setInterval(() => send({ type: "ping" }), 15_000);

      try {
        const scope = VALID_SCOPES.find((s) => s === scopeParam);
        if (!scope) {
          send({ type: "error", message: "Невідомий тип пошуку" });
          return;
        }

        const cvProfileIds =
          cvProfileIdParam === ALL_CV_PROFILES
            ? (
                await prisma.cvProfile.findMany({
                  where: { userId },
                  select: { id: true },
                })
              ).map((p) => p.id)
            : (await prisma.cvProfile.findFirst({
                  where: { id: cvProfileIdParam, userId },
                  select: { id: true },
                }))
              ? [cvProfileIdParam]
              : [];

        if (cvProfileIds.length === 0) {
          send({
            type: "error",
            message: cvProfileIdParam === ALL_CV_PROFILES ? "Немає жодного завантаженого CV" : "CV не знайдено",
          });
          return;
        }

        const results = await runSearch({
          cvProfileIds,
          scope,
          requireReservation,
          onStatus: (message) => send({ type: "status", message }),
        });

        if (results.length > 0 && results.every((r) => r.error)) {
          const message = [...new Set(results.map((r) => r.error).filter(Boolean))].join("; ") || "Невідома помилка";
          send({ type: "error", message });
          return;
        }

        const totalFound = results.reduce((sum, r) => sum + r.found, 0);
        const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
        const failedCount = results.filter((r) => r.error).length;
        send({ type: "done", found: totalFound, created: totalCreated, failed: failedCount });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Невідома помилка",
        });
      } finally {
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed/errored — e.g. the client disconnected via cancel().
        }
      }
    },
    cancel() {
      closed = true;
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}

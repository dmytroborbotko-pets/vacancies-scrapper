import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { runSearch, type SearchScope } from "@/lib/ingest";

// DOU (rate-limited) + Djinni + the OTHER web-search leg, across possibly
// several CVs in one "Всі" run, can together run close to 300s — the hard
// ceiling on the Hobby plan.
export const maxDuration = 300;

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "done"; found: number; created: number }
  | { type: "error"; message: string }
  | { type: "ping" };

const VALID_SCOPES: SearchScope[] = ["DOU", "DJINNI", "BOTH", "EVERYWHERE"];

// Single streaming entry point for every manual search — replaces the old
// plain-redirect "run all CVs" route and the separate "Інші" NDJSON route.
// Body: { cvProfileId: string | "all", scope: SearchScope, requireReservation: boolean }.
export async function POST(request: Request) {
  const userId = await requireUserId();
  const body = await request.json().catch(() => ({}));
  const cvProfileIdParam = String(body.cvProfileId ?? "");
  const scope = body.scope as SearchScope;
  const requireReservation = body.requireReservation === true;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      // A silent multi-minute leg (e.g. EVERYWHERE waiting on web_search)
      // can let an idle intermediate proxy drop the connection long before
      // either side times out — a steady trickle of bytes keeps it alive.
      const heartbeat = setInterval(() => send({ type: "ping" }), 15_000);

      try {
        if (!VALID_SCOPES.includes(scope)) {
          send({ type: "error", message: "Невідомий тип пошуку" });
          return;
        }

        const cvProfileIds =
          cvProfileIdParam === "all"
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
          send({ type: "error", message: "CV не знайдено" });
          return;
        }

        const results = await runSearch({
          cvProfileIds,
          scope,
          requireReservation,
          onStatus: (message) => send({ type: "status", message }),
        });

        if (results.every((r) => r.error)) {
          send({ type: "error", message: results[0].error ?? "Невідома помилка" });
          return;
        }

        const totalFound = results.reduce((sum, r) => sum + r.found, 0);
        const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
        send({ type: "done", found: totalFound, created: totalCreated });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Невідома помилка",
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}

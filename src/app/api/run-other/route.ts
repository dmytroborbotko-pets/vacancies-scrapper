import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { ingestSearchConfig, ingestOtherSearchConfig } from "@/lib/ingest";
import { scoreProfilesForUser } from "@/lib/scoring";

// DJINNI + DOU (22 keyword terms each, DOU rate-limited to one request per
// ~2s) + the OTHER web-search leg can together run close to 300s. Ask for
// more headroom; Vercel silently caps this to whatever the plan allows
// (300s on Hobby), so it's a no-op there but real slack on Pro/Enterprise.
export const maxDuration = 800;

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "text"; delta: string }
  | { type: "done"; found: number; created: number }
  | { type: "error"; message: string }
  | { type: "ping" };

// Per-CV manual trigger for "Інші" mode, streamed as NDJSON so the client
// can show Claude's live search narration during the OTHER (web-search)
// leg. Unlike the general manual "run search now" button, this is the one
// place otherMode's managed configs run on demand — gated by CV ownership +
// otherModeEnabled, same daily cap as the cron path.
export async function GET(request: Request) {
  const userId = await requireUserId();
  const { searchParams } = new URL(request.url);
  const cvProfileId = searchParams.get("cvProfileId") ?? "";

  const cvProfile = await prisma.cvProfile.findFirst({
    where: { id: cvProfileId, userId, otherModeEnabled: true },
    select: { id: true },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      if (!cvProfile) {
        send({ type: "error", message: "CV не знайдено або режим «Інші» вимкнено" });
        controller.close();
        return;
      }

      // The OTHER leg can go tens of seconds between visible text deltas
      // (Claude silently waiting on a web_search tool result) — without
      // some traffic, an idle intermediate proxy can drop the connection
      // long before either side times out, leaving the client frozen with
      // no error. A steady trickle of bytes keeps it alive.
      const heartbeat = setInterval(() => send({ type: "ping" }), 15_000);

      try {
        const managedConfigs = await prisma.searchConfig.findMany({
          where: { cvProfileId: cvProfile.id, managed: true, active: true },
        });

        let totalFound = 0;
        let totalCreated = 0;

        for (const config of managedConfigs) {
          if (config.source === "DJINNI") {
            send({ type: "status", message: "Сканую Djinni…" });
            const result = await ingestSearchConfig(config);
            totalFound += result.found;
            totalCreated += result.created;
          } else if (config.source === "DOU") {
            send({ type: "status", message: "Сканую DOU…" });
            const result = await ingestSearchConfig(config);
            totalFound += result.found;
            totalCreated += result.created;
          } else {
            send({ type: "status", message: "Шукаю по всьому інтернету…" });
            const result = await ingestOtherSearchConfig(config, {
              onText: (delta) => send({ type: "text", delta }),
            });
            totalFound += result.found;
            totalCreated += result.created;
          }
        }

        send({ type: "status", message: "Рахую % збігу…" });
        await scoreProfilesForUser(userId);

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

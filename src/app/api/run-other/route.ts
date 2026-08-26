import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { ingestSearchConfig, ingestOtherSearchConfig } from "@/lib/ingest";

export const maxDuration = 300;

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "text"; delta: string }
  | { type: "done"; found: number; created: number }
  | { type: "error"; message: string };

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

        send({ type: "done", found: totalFound, created: totalCreated });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Невідома помилка",
        });
      } finally {
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

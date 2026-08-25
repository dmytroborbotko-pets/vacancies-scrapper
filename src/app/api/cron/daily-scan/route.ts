import { NextResponse } from "next/server";
import { runActiveSearches } from "@/lib/ingest";
import { scoreAllProfiles } from "@/lib/scoring";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const ingestResults = await runActiveSearches();
  const scoreResults = await scoreAllProfiles();

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    ingest: ingestResults,
    score: scoreResults,
  });
}

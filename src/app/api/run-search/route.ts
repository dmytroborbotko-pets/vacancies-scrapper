import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runActiveSearches } from "@/lib/ingest";

export const maxDuration = 300;

export async function GET(request: Request) {
  await runActiveSearches();
  revalidatePath("/settings");
  revalidatePath("/vacancies");
  return NextResponse.redirect(new URL("/settings", request.url));
}

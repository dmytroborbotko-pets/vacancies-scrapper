import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { scoreAllProfiles } from "@/lib/scoring";

export const maxDuration = 300;

export async function GET(request: Request) {
  await scoreAllProfiles();
  revalidatePath("/settings");
  revalidatePath("/vacancies");
  return NextResponse.redirect(new URL("/settings", request.url));
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { scoreProfilesForUser } from "@/lib/scoring";
import { requireUserId } from "@/lib/session";

export const maxDuration = 300;

export async function GET(request: Request) {
  const userId = await requireUserId();
  await scoreProfilesForUser(userId);
  revalidatePath("/settings");
  revalidatePath("/vacancies");
  return NextResponse.redirect(new URL("/settings", request.url));
}

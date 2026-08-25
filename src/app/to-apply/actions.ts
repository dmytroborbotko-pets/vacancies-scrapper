"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function markApplied(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.match.updateMany({
    where: { id, cvProfile: { userId } },
    data: { status: "APPLIED" },
  });

  revalidatePath("/to-apply");
  revalidatePath("/applied");
}

export async function deleteMatch(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Mark dismissed rather than deleting the row: scoring only rescores a
  // vacancy when it has no Match row yet for that CV, so a hard delete
  // would let the daily scan resurrect the same vacancy the next day.
  await prisma.match.updateMany({
    where: { id, cvProfile: { userId } },
    data: { status: "DISMISSED" },
  });

  revalidatePath("/to-apply");
  revalidatePath("/vacancies");
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function markApplied(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.match.update({
    where: { id },
    data: { status: "APPLIED" },
  });

  revalidatePath("/to-apply");
  revalidatePath("/applied");
}

export async function deleteMatch(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Mark dismissed rather than deleting the row: scoring only rescores a
  // vacancy when it has no Match row yet for that CV, so a hard delete
  // would let the daily scan resurrect the same vacancy the next day.
  await prisma.match.update({
    where: { id },
    data: { status: "DISMISSED" },
  });

  revalidatePath("/to-apply");
  revalidatePath("/vacancies");
}

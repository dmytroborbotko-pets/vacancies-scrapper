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

  await prisma.match.delete({ where: { id } });

  revalidatePath("/to-apply");
}

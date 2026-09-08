"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { extractTextFromFile, extractSearchTerms } from "@/lib/cv";
import { requireUserId } from "@/lib/session";

export async function uploadCvProfile(formData: FormData) {
  const userId = await requireUserId();
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");

  if (!label || !(file instanceof File) || file.size === 0) return;

  const buffer = Buffer.from(await file.arrayBuffer());
  const extractedText = await extractTextFromFile(buffer, file.name);

  let searchTerms: string[] = [];
  try {
    searchTerms = await extractSearchTerms(extractedText);
  } catch (error) {
    console.error("extractSearchTerms failed during CV upload:", error);
  }

  await prisma.cvProfile.create({
    data: {
      userId,
      label,
      fileName: file.name,
      fileData: buffer,
      extractedText,
      searchTerms,
    },
  });

  revalidatePath("/settings");
}

export async function deleteCvProfile(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.cvProfile.deleteMany({ where: { id, userId } });

  revalidatePath("/settings");
  revalidatePath("/vacancies");
}

"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { runActiveSearches } from "@/lib/ingest";
import { extractTextFromFile } from "@/lib/cv";
import { scoreAllProfiles } from "@/lib/scoring";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads", "cv");

export async function addSearchConfig(formData: FormData) {
  const keywords = String(formData.get("keywords") ?? "").trim();
  const cvProfileId = String(formData.get("cvProfileId") ?? "");
  if (!keywords || !cvProfileId) return;

  const expLevels = formData.getAll("expLevels").map(String);
  const requireReservation = formData.get("requireReservation") === "true";

  await prisma.searchConfig.create({
    data: {
      keywords,
      source: "DJINNI",
      cvProfileId,
      expLevels: expLevels.length > 0 ? expLevels.join(",") : null,
      requireReservation,
    },
  });

  revalidatePath("/settings");
}

export async function toggleSearchConfig(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const nextActive = formData.get("nextActive") === "true";
  if (!id) return;

  await prisma.searchConfig.update({
    where: { id },
    data: { active: nextActive },
  });
  revalidatePath("/settings");
}

export async function deleteSearchConfig(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.searchConfig.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/vacancies");
}

export async function runSearchesNow() {
  await runActiveSearches();
  revalidatePath("/settings");
  revalidatePath("/vacancies");
  revalidatePath("/");
}

export async function runMatchingNow() {
  await scoreAllProfiles();
  revalidatePath("/settings");
  revalidatePath("/vacancies");
  revalidatePath("/");
}

export async function uploadCvProfile(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");

  if (!label || !(file instanceof File) || file.size === 0) return;

  const buffer = Buffer.from(await file.arrayBuffer());
  const extractedText = await extractTextFromFile(buffer, file.name);

  await mkdir(UPLOADS_DIR, { recursive: true });
  const ext = file.name.toLowerCase().split(".").pop();
  const storedFilename = `${crypto.randomUUID()}.${ext}`;
  await writeFile(path.join(UPLOADS_DIR, storedFilename), buffer);

  await prisma.cvProfile.create({
    data: {
      label,
      fileUrl: `/uploads/cv/${storedFilename}`,
      extractedText,
    },
  });

  revalidatePath("/settings");
}

export async function deleteCvProfile(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const profile = await prisma.cvProfile.delete({ where: { id } });

  const storedPath = path.join(process.cwd(), "public", profile.fileUrl);
  await unlink(storedPath).catch(() => {});

  revalidatePath("/settings");
  revalidatePath("/vacancies");
}

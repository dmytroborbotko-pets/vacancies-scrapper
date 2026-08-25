"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runActiveSearches } from "@/lib/ingest";
import { extractTextFromFile } from "@/lib/cv";
import { scoreAllProfiles } from "@/lib/scoring";

export async function addSearchConfig(formData: FormData) {
  const keywords = String(formData.get("keywords") ?? "").trim();
  const cvProfileId = String(formData.get("cvProfileId") ?? "");
  if (!keywords || !cvProfileId) return;

  const selectedSources = formData.getAll("sources").map(String);
  const sources = (
    selectedSources.length > 0 ? selectedSources : ["DJINNI"]
  ) as ("DJINNI" | "DOU")[];
  const expLevels = formData.getAll("expLevels").map(String);
  const requireReservation = formData.get("requireReservation") === "true";

  // One row per selected source (not a single "both" row) — each source
  // has its own fetch logic and Vacancy.source already tags every result,
  // so a vacancy list naturally shows which source it came from.
  await prisma.searchConfig.createMany({
    data: sources.map((source) => ({
      keywords,
      source,
      cvProfileId,
      // Djinni-only filters; harmless no-ops for a DOU config.
      expLevels: source === "DJINNI" && expLevels.length > 0 ? expLevels.join(",") : null,
      requireReservation: source === "DJINNI" && requireReservation,
    })),
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

async function logDebug(label: string, detail: string) {
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "_debug_log" (id SERIAL PRIMARY KEY, label TEXT, detail TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_debug_log" (label, detail) VALUES ($1, $2)`,
      label,
      detail,
    );
  } catch {
    // best-effort diagnostic only
  }
}

export async function runSearchesNow() {
  await logDebug("runSearchesNow", "start");
  try {
    await runActiveSearches();
    await logDebug("runSearchesNow", "search-ok");
  } catch (error) {
    await logDebug(
      "runSearchesNow:search-error",
      error instanceof Error ? `${error.message}\n${error.stack}` : String(error),
    );
    throw error;
  }
  try {
    revalidatePath("/settings");
    await logDebug("runSearchesNow", "revalidate-settings-ok");
    revalidatePath("/vacancies");
    await logDebug("runSearchesNow", "revalidate-vacancies-ok");
    revalidatePath("/");
    await logDebug("runSearchesNow", "revalidate-home-ok");
  } catch (error) {
    await logDebug(
      "runSearchesNow:revalidate-error",
      error instanceof Error ? `${error.message}\n${error.stack}` : String(error),
    );
    throw error;
  }
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

  await prisma.cvProfile.create({
    data: {
      label,
      fileName: file.name,
      fileData: buffer,
      extractedText,
    },
  });

  revalidatePath("/settings");
}

export async function deleteCvProfile(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.cvProfile.delete({ where: { id } });

  revalidatePath("/settings");
  revalidatePath("/vacancies");
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { extractTextFromFile } from "@/lib/cv";
import { requireUserId } from "@/lib/session";
import { DEFENSE_KEYWORDS } from "@/lib/defense-keywords";

export async function addSearchConfig(formData: FormData) {
  const userId = await requireUserId();
  const keywords = String(formData.get("keywords") ?? "").trim();
  const cvProfileId = String(formData.get("cvProfileId") ?? "");
  if (!keywords || !cvProfileId) return;

  // Verify the CV profile is actually the caller's before attaching a
  // search to it — cvProfileId comes from a client-supplied hidden field.
  const cvProfile = await prisma.cvProfile.findFirst({
    where: { id: cvProfileId, userId },
    select: { id: true },
  });
  if (!cvProfile) return;

  const selectedSources = formData.getAll("sources").map(String);
  const sources = (
    selectedSources.length > 0 ? selectedSources : ["DJINNI"]
  ) as ("DJINNI" | "DOU")[];
  const requireReservation = formData.get("requireReservation") === "true";

  // One row per selected source (not a single "both" row) — each source
  // has its own fetch logic and Vacancy.source already tags every result,
  // so a vacancy list naturally shows which source it came from.
  await prisma.searchConfig.createMany({
    data: sources.map((source) => ({
      keywords,
      source,
      cvProfileId,
      // requireReservation applies to both — Djinni via
      // editorial=reservation, DOU via ANDing the keyword "бронювання"
      // into the search query.
      requireReservation,
    })),
  });

  revalidatePath("/settings");
}

export async function toggleSearchConfig(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const nextActive = formData.get("nextActive") === "true";
  if (!id) return;

  await prisma.searchConfig.updateMany({
    where: { id, cvProfile: { userId } },
    data: { active: nextActive },
  });
  revalidatePath("/settings");
}

export async function deleteSearchConfig(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.searchConfig.deleteMany({
    where: { id, cvProfile: { userId } },
  });
  revalidatePath("/settings");
  revalidatePath("/vacancies");
}

const MANAGED_SOURCES = ["DJINNI", "DOU", "OTHER"] as const;

// "Інші" mode: turning it on deactivates the CV's own manual keyword
// configs and ensures three system-managed configs exist (one per source)
// with the canonical defense/military-tech keywords, always requiring a
// reservation. Turning it off just deactivates the managed configs — the
// user's manual configs stay deactivated too, and can be re-enabled by hand.
export async function toggleOtherMode(formData: FormData) {
  const userId = await requireUserId();
  const cvProfileId = String(formData.get("cvProfileId") ?? "");
  const next = formData.get("next") === "true";
  if (!cvProfileId) return;

  const cvProfile = await prisma.cvProfile.findFirst({
    where: { id: cvProfileId, userId },
    select: { id: true },
  });
  if (!cvProfile) return;

  if (next) {
    await prisma.searchConfig.updateMany({
      where: { cvProfileId, managed: false },
      data: { active: false },
    });

    for (const source of MANAGED_SOURCES) {
      const existing = await prisma.searchConfig.findFirst({
        where: { cvProfileId, managed: true, source },
        select: { id: true },
      });
      if (existing) {
        // Also refresh keywords: DEFENSE_KEYWORDS can change between
        // releases, and a pre-existing managed row would otherwise keep
        // scanning with a stale list forever.
        await prisma.searchConfig.update({
          where: { id: existing.id },
          data: { active: true, keywords: DEFENSE_KEYWORDS },
        });
      } else {
        await prisma.searchConfig.create({
          data: {
            cvProfileId,
            source,
            managed: true,
            active: true,
            keywords: DEFENSE_KEYWORDS,
            requireReservation: true,
          },
        });
      }
    }
  } else {
    await prisma.searchConfig.updateMany({
      where: { cvProfileId, managed: true },
      data: { active: false },
    });
  }

  await prisma.cvProfile.update({
    where: { id: cvProfileId },
    data: { otherModeEnabled: next },
  });

  revalidatePath("/settings");
}

export async function uploadCvProfile(formData: FormData) {
  const userId = await requireUserId();
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");

  if (!label || !(file instanceof File) || file.size === 0) return;

  const buffer = Buffer.from(await file.arrayBuffer());
  const extractedText = await extractTextFromFile(buffer, file.name);

  await prisma.cvProfile.create({
    data: {
      userId,
      label,
      fileName: file.name,
      fileData: buffer,
      extractedText,
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

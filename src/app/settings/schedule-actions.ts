"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { computeNextRunAt, type ScheduleInterval } from "@/lib/scheduling";
import type { SearchScope } from "@/lib/ingest";

const VALID_SCOPES: SearchScope[] = ["DOU", "DJINNI", "BOTH", "EVERYWHERE"];
const VALID_INTERVALS: ScheduleInterval[] = ["DAILY", "EVERY_3_DAYS", "WEEKLY", "MONTHLY"];

// cvProfileIdRaw is "" / "all" for "Всі"; anything else must be a CV the
// caller owns. Returns null for "Всі", throws/returns undefined (caller
// bails) if an id was given but doesn't belong to this user.
async function resolveOwnedCvProfileId(
  userId: string,
  cvProfileIdRaw: string,
): Promise<{ ok: true; cvProfileId: string | null } | { ok: false }> {
  if (!cvProfileIdRaw || cvProfileIdRaw === "all") return { ok: true, cvProfileId: null };
  const cvProfile = await prisma.cvProfile.findFirst({
    where: { id: cvProfileIdRaw, userId },
    select: { id: true },
  });
  return cvProfile ? { ok: true, cvProfileId: cvProfile.id } : { ok: false };
}

export async function createScheduledSearch(formData: FormData) {
  const userId = await requireUserId();
  const scope = String(formData.get("scope") ?? "") as SearchScope;
  const interval = String(formData.get("interval") ?? "") as ScheduleInterval;
  const requireReservation = formData.get("requireReservation") === "true";
  if (!VALID_SCOPES.includes(scope) || !VALID_INTERVALS.includes(interval)) return;

  const resolved = await resolveOwnedCvProfileId(userId, String(formData.get("cvProfileId") ?? ""));
  if (!resolved.ok) return;

  await prisma.scheduledSearch.create({
    data: {
      userId,
      cvProfileId: resolved.cvProfileId,
      scope,
      requireReservation,
      interval,
      nextRunAt: computeNextRunAt(interval),
    },
  });

  revalidatePath("/settings");
}

export async function updateScheduledSearch(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const scope = String(formData.get("scope") ?? "") as SearchScope;
  const interval = String(formData.get("interval") ?? "") as ScheduleInterval;
  const requireReservation = formData.get("requireReservation") === "true";
  if (!id || !VALID_SCOPES.includes(scope) || !VALID_INTERVALS.includes(interval)) return;

  const resolved = await resolveOwnedCvProfileId(userId, String(formData.get("cvProfileId") ?? ""));
  if (!resolved.ok) return;

  await prisma.scheduledSearch.updateMany({
    where: { id, userId },
    data: {
      cvProfileId: resolved.cvProfileId,
      scope,
      requireReservation,
      interval,
      nextRunAt: computeNextRunAt(interval),
    },
  });

  revalidatePath("/settings");
}

export async function toggleScheduledSearchPaused(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const nextPaused = formData.get("nextPaused") === "true";
  if (!id) return;

  await prisma.scheduledSearch.updateMany({ where: { id, userId }, data: { paused: nextPaused } });
  revalidatePath("/settings");
}

export async function deleteScheduledSearch(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.scheduledSearch.deleteMany({ where: { id, userId } });
  revalidatePath("/settings");
}

// Called directly from a client component (not a <form> action) — Next.js
// server actions can be invoked as plain typed async functions too.
export async function setHideScheduleSuggestion(hide: boolean) {
  const userId = await requireUserId();
  await prisma.user.update({ where: { id: userId }, data: { hideScheduleSuggestion: hide } });
}

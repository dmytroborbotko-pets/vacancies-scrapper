"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { computeNextRunAt, type ScheduleInterval } from "@/lib/scheduling";
import type { SearchScope } from "@/lib/ingest";

// Keyed records (not plain arrays) so adding a value to the Prisma enum
// without updating this file fails to compile — same exhaustiveness
// convention as computeNextRunAt's `never` guard and ingest.ts's scope guard.
const VALID_SCOPES: Record<SearchScope, true> = { DOU: true, DJINNI: true, BOTH: true, EVERYWHERE: true };
const VALID_INTERVALS: Record<ScheduleInterval, true> = { DAILY: true, EVERY_3_DAYS: true, WEEKLY: true, MONTHLY: true };

// cvProfileIdRaw is "" / "all" for "Всі"; anything else must be a CV the
// caller owns. Returns { ok: true, cvProfileId: null } for "Всі", and
// { ok: false } (never throws, never returns undefined) if an id was given
// but doesn't belong to this user — the caller is responsible for bailing.
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

export async function createScheduledSearch(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; reason: "invalid-input" | "unowned-cv" | "duplicate" }> {
  const userId = await requireUserId();
  const scopeRaw = String(formData.get("scope") ?? "");
  const intervalRaw = String(formData.get("interval") ?? "");
  const requireReservation = formData.get("requireReservation") === "true";
  if (!(scopeRaw in VALID_SCOPES) || !(intervalRaw in VALID_INTERVALS)) {
    console.error(`createScheduledSearch: rejected invalid input (scope=${scopeRaw}, interval=${intervalRaw})`);
    return { ok: false, reason: "invalid-input" as const };
  }
  const scope = scopeRaw as SearchScope;
  const interval = intervalRaw as ScheduleInterval;

  const resolved = await resolveOwnedCvProfileId(userId, String(formData.get("cvProfileId") ?? ""));
  if (!resolved.ok) {
    console.error(`createScheduledSearch: rejected unowned or unknown CV profile`);
    return { ok: false, reason: "unowned-cv" as const };
  }

  // Dedup guard: the cron iterates every due job and runs the full
  // search+scoring pipeline per job, so a duplicate row doubles real API
  // spend and eats into the shared serverless time budget for all users.
  const duplicate = await prisma.scheduledSearch.findFirst({
    where: { userId, cvProfileId: resolved.cvProfileId, scope, requireReservation, interval },
    select: { id: true },
  });
  if (duplicate) {
    console.error(`createScheduledSearch: duplicate schedule already exists (${duplicate.id})`);
    return { ok: false, reason: "duplicate" as const };
  }

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
  return { ok: true as const };
}

export async function updateScheduledSearch(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; reason: "invalid-input" | "unowned-cv" | "not-found" | "duplicate" }> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const scopeRaw = String(formData.get("scope") ?? "");
  const intervalRaw = String(formData.get("interval") ?? "");
  const requireReservation = formData.get("requireReservation") === "true";
  if (!id || !(scopeRaw in VALID_SCOPES) || !(intervalRaw in VALID_INTERVALS)) {
    console.error(`updateScheduledSearch: rejected invalid input (id=${id}, scope=${scopeRaw}, interval=${intervalRaw})`);
    return { ok: false, reason: "invalid-input" as const };
  }
  const scope = scopeRaw as SearchScope;
  const interval = intervalRaw as ScheduleInterval;

  const resolved = await resolveOwnedCvProfileId(userId, String(formData.get("cvProfileId") ?? ""));
  if (!resolved.ok) {
    console.error(`updateScheduledSearch: rejected unowned or unknown CV profile`);
    return { ok: false, reason: "unowned-cv" as const };
  }

  const existing = await prisma.scheduledSearch.findFirst({ where: { id, userId } });
  if (!existing) {
    console.error(`updateScheduledSearch: no ScheduledSearch ${id} owned by user ${userId}`);
    return { ok: false, reason: "not-found" as const };
  }

  // Same dedup guard as createScheduledSearch: editing a row to match another
  // row's {cvProfileId, scope, requireReservation, interval} would otherwise
  // create the exact duplicate the create path is designed to prevent.
  const duplicate = await prisma.scheduledSearch.findFirst({
    where: {
      userId,
      cvProfileId: resolved.cvProfileId,
      scope,
      requireReservation,
      interval,
      NOT: { id },
    },
    select: { id: true },
  });
  if (duplicate) {
    console.error(`updateScheduledSearch: duplicate schedule already exists (${duplicate.id})`);
    return { ok: false, reason: "duplicate" as const };
  }

  await prisma.scheduledSearch.update({
    where: { id },
    data: {
      cvProfileId: resolved.cvProfileId,
      scope,
      requireReservation,
      interval,
      // Only push the schedule clock forward when the interval itself
      // changed — editing an unrelated field (e.g. requireReservation)
      // must not silently defer a job that was due soon.
      nextRunAt:
        existing.interval === interval
          ? existing.nextRunAt
          : computeNextRunAt(interval, existing.lastRunAt ?? existing.createdAt),
    },
  });

  revalidatePath("/settings");
  return { ok: true as const };
}

export async function toggleScheduledSearchPaused(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const nextPaused = formData.get("nextPaused") === "true";
  if (!id) {
    console.error(`toggleScheduledSearchPaused: rejected missing id`);
    return;
  }

  const { count } = await prisma.scheduledSearch.updateMany({ where: { id, userId }, data: { paused: nextPaused } });
  if (count === 0) {
    console.error(`toggleScheduledSearchPaused: no ScheduledSearch ${id} owned by user ${userId} was updated`);
  }
  // The scheduled-jobs nav now lives in the root layout and renders on
  // every route, not just /settings — revalidate the whole layout so a
  // pause toggled from any page (e.g. /vacancies) isn't left showing stale
  // data there.
  revalidatePath("/", "layout");
}

export async function deleteScheduledSearch(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) {
    console.error(`deleteScheduledSearch: rejected missing id`);
    return;
  }

  const { count } = await prisma.scheduledSearch.deleteMany({ where: { id, userId } });
  if (count === 0) {
    console.error(`deleteScheduledSearch: no ScheduledSearch ${id} owned by user ${userId} was deleted`);
  }
  // The scheduled-jobs nav now lives in the root layout and renders on
  // every route, not just /settings — revalidate the whole layout so a
  // delete triggered from any page (e.g. /to-apply) isn't left showing
  // stale data there.
  revalidatePath("/", "layout");
}

// Called directly from a client component (not a <form> action) — Next.js
// server actions can be invoked as plain typed async functions too.
export async function setHideScheduleSuggestion(hide: boolean) {
  const userId = await requireUserId();
  await prisma.user.update({ where: { id: userId }, data: { hideScheduleSuggestion: hide } });

  revalidatePath("/settings");
}

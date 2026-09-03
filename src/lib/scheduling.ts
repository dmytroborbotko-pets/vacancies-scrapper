import type { ScheduleInterval } from "@/generated/prisma/client";
export type { ScheduleInterval };

// Vercel Hobby-plan cron can only fire once/day, so there's deliberately no
// time-of-day here — just "how many days/weeks/months from the last run".
export function computeNextRunAt(interval: ScheduleInterval, from: Date = new Date()): Date {
  const next = new Date(from);
  switch (interval) {
    case "DAILY":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "EVERY_3_DAYS":
      next.setUTCDate(next.getUTCDate() + 3);
      break;
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "MONTHLY":
      // JS Date overflows past month-end rather than clamping (e.g. Jan 31 + 1mo
      // → "Feb 31" → normalizes to Mar 3). This is a known, accepted quirk: the
      // day-of-month shifts once for schedules created on the 29th-31st, then
      // stays stable on the new date — cadence stays ~monthly throughout, it
      // never compounds further.
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    default: {
      const _exhaustive: never = interval;
      throw new Error(`Unhandled schedule interval: ${_exhaustive}`);
    }
  }
  return next;
}

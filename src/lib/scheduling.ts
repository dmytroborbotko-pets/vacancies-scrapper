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
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }
  return next;
}

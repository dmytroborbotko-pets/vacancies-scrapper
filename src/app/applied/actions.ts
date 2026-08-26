"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

const OUTCOMES = ["INTERVIEW", "HIRED", "REJECTED"] as const;
type Outcome = (typeof OUTCOMES)[number];

// Toggle semantics: submitting the outcome that's already active clears it
// back to null (plain "Подався"); submitting a different one replaces it.
export async function setOutcome(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const outcomeRaw = String(formData.get("outcome") ?? "");
  if (!id) return;

  const outcome = OUTCOMES.includes(outcomeRaw as Outcome)
    ? (outcomeRaw as Outcome)
    : null;

  await prisma.match.updateMany({
    where: { id, cvProfile: { userId } },
    data: { outcome },
  });

  revalidatePath("/applied");
}

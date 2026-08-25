"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { signOut } from "@/auth";

const MIN_PASSWORD_LENGTH = 8;

export async function changePassword(formData: FormData) {
  const userId = await requireUserId();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    redirect("/account?error=too-short");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    redirect("/account?error=wrong-password");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  redirect("/account?success=1");
}

export async function deleteAccount() {
  const userId = await requireUserId();
  // Cascades: CvProfile -> SearchConfig -> VacancyDiscovery, and
  // CvProfile -> Match. Shared Vacancy rows are untouched.
  await prisma.user.delete({ where: { id: userId } });
  await signOut({ redirectTo: "/login" });
}

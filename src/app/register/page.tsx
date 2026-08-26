import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { SubmitButton } from "@/components/submit-button";

const MIN_PASSWORD_LENGTH = 8;

async function register(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < MIN_PASSWORD_LENGTH) {
    redirect("/register?error=validation");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/register?error=exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, passwordHash } });

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: `Пароль має бути не менше ${MIN_PASSWORD_LENGTH} символів.`,
  exists: "Користувач з таким email вже існує.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10 sm:py-16">
      <h1 className="text-4xl font-semibold">Реєстрація</h1>
      {error && (
        <p className="text-base text-red-500">
          {ERROR_MESSAGES[error] ?? "Щось пішло не так."}
        </p>
      )}
      <form action={register} className="flex flex-col gap-3">
        <input
          type="email"
          name="email"
          placeholder="Email"
          required
          autoComplete="email"
          className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="password"
          name="password"
          placeholder="Пароль (мінімум 8 символів)"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
        <SubmitButton
          pendingText="Реєструю…"
          className="rounded-md bg-zinc-900 px-3 py-2 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Зареєструватися
        </SubmitButton>
      </form>
      <p className="text-base text-zinc-500">
        Вже є акаунт?{" "}
        <Link href="/login" className="underline">
          Увійти
        </Link>
      </p>
    </div>
  );
}

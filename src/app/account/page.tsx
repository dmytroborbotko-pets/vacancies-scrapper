import { auth } from "@/auth";
import { changePassword, deleteAccount } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const ERROR_MESSAGES: Record<string, string> = {
  "wrong-password": "Поточний пароль невірний.",
  "too-short": "Новий пароль має бути не менше 8 символів.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  const { error, success } = await searchParams;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-4xl font-semibold">Акаунт</h1>
        <p className="mt-1 text-sm text-zinc-500">{session?.user?.email}</p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">Змінити пароль</h2>
        {error && <p className="text-base text-red-500">{ERROR_MESSAGES[error]}</p>}
        {success && (
          <p className="text-base text-green-600 dark:text-green-500">
            Пароль змінено.
          </p>
        )}
        <form action={changePassword} className="flex max-w-sm flex-col gap-3">
          <input
            type="password"
            name="currentPassword"
            placeholder="Поточний пароль"
            required
            autoComplete="current-password"
            className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="password"
            name="newPassword"
            placeholder="Новий пароль (мінімум 8 символів)"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
          />
          <SubmitButton
            pendingText="Змінюю…"
            className="rounded-md border border-zinc-300 px-3 py-2 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Змінити пароль
          </SubmitButton>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-red-600 dark:text-red-500">
          Видалити акаунт
        </h2>
        <p className="text-base text-zinc-500">
          Видалить твій акаунт і всі твої CV-профілі, ключові слова та
          матчі. Дію неможливо скасувати.
        </p>
        <form action={deleteAccount}>
          <SubmitButton
            pendingText="Видаляю…"
            className="rounded-md bg-red-600 px-3 py-2 text-base font-medium text-white hover:bg-red-700"
          >
            Видалити акаунт назавжди
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}

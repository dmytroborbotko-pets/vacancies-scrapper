import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { SubmitButton } from "@/components/submit-button";
import { SearchModal } from "@/components/search-modal";
import { ALL_CV_PROFILES } from "@/components/search-params-fields";
import { CreateScheduleButton } from "@/components/create-schedule-button";
import { deleteCvProfile, uploadCvProfile } from "./actions";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [cvProfiles, user] = await Promise.all([
    prisma.cvProfile.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, extractedText: true, searchTerms: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { hideScheduleSuggestion: true },
    }),
  ]);

  const cvProfileOptions = cvProfiles.map((p) => ({ id: p.id, label: p.label }));
  const hasCvProfiles = cvProfiles.length > 0;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-4xl font-semibold">Налаштування</h1>
        <div className="flex flex-wrap gap-2">
          <SearchModal
            cvProfiles={cvProfileOptions}
            defaultCvProfileId={ALL_CV_PROFILES}
            triggerLabel="Шукати вакансії"
            triggerClassName="rounded-md bg-zinc-900 px-3 py-1.5 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
            hideScheduleSuggestion={user.hideScheduleSuggestion}
            disabled={!hasCvProfiles}
          />
          <CreateScheduleButton cvProfiles={cvProfileOptions} disabled={!hasCvProfiles} />
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">Додати CV-профіль</h2>
        <form action={uploadCvProfile} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            name="label"
            placeholder="напр. Backend Python"
            required
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-base sm:flex-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="file"
            name="file"
            accept=".pdf,.docx"
            required
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-base file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 sm:flex-1 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-zinc-800"
          />
          <SubmitButton
            pendingText="Завантажую…"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Завантажити
          </SubmitButton>
        </form>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold">CV-профілі та їх ключові слова</h2>

        {cvProfiles.length === 0 ? (
          <p className="text-base text-zinc-500">
            Ще не завантажено жодного CV. Додай CV вище — ключові слова
            пошуку витягуються автоматично з тексту CV.
          </p>
        ) : (
          cvProfiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{profile.label}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-zinc-500">
                    {profile.extractedText}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-500">
                    {profile.searchTerms.length > 0
                      ? `Ключові слова: ${profile.searchTerms.join(", ")}`
                      : "Не вдалося витягнути ключові слова з цього CV. Спробуй завантажити CV ще раз."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <SearchModal
                    cvProfiles={cvProfileOptions}
                    defaultCvProfileId={profile.id}
                    triggerLabel="Шукати для цього CV"
                    triggerClassName="rounded-full border border-zinc-300 px-3 py-1 text-base font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    hideScheduleSuggestion={user.hideScheduleSuggestion}
                  />
                  <form action={deleteCvProfile}>
                    <input type="hidden" name="id" value={profile.id} />
                    <SubmitButton
                      pendingText="Видаляю…"
                      className="text-base text-red-500 underline hover:text-red-700 dark:hover:text-red-400"
                    >
                      Видалити CV
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import type { CvProfile, SearchConfig } from "@/generated/prisma/client";
import { requireUserId } from "@/lib/session";
import { RunTaskButton } from "@/components/run-task-button";
import { SubmitButton } from "@/components/submit-button";
import { OtherSearchTrigger } from "@/components/other-search-overlay";
import { SourceCheckboxes, ReservationCheckbox } from "@/components/source-checkboxes";
import {
  addSearchConfig,
  toggleSearchConfig,
  deleteSearchConfig,
  deleteCvProfile,
  uploadCvProfile,
  toggleOtherMode,
} from "./actions";

type CvProfileWithConfigs = CvProfile & { searchConfigs: SearchConfig[] };

export default async function SettingsPage() {
  const userId = await requireUserId();
  const cvProfiles: CvProfileWithConfigs[] = await prisma.cvProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      searchConfigs: { where: { managed: false }, orderBy: { createdAt: "desc" } },
    },
  });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-4xl font-semibold">Налаштування</h1>
        <div className="flex flex-wrap gap-2">
          <RunTaskButton
            href="/api/run-search"
            label="Запустити пошук зараз (усі CV)"
            runningLabel="Шукаю та рахую % збігу…"
            modal
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          />
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
            пошуку додаються під конкретний CV-профіль.
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
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <form action={toggleOtherMode}>
                    <input type="hidden" name="cvProfileId" value={profile.id} />
                    <input
                      type="hidden"
                      name="next"
                      value={(!profile.otherModeEnabled).toString()}
                    />
                    <SubmitButton
                      pendingText="…"
                      className={
                        "rounded-full px-3 py-1 text-base font-medium " +
                        (profile.otherModeEnabled
                          ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                          : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900")
                      }
                    >
                      Режим «Інші»: {profile.otherModeEnabled ? "увімкнено" : "вимкнено"}
                    </SubmitButton>
                  </form>
                  {profile.otherModeEnabled && (
                    <OtherSearchTrigger
                      cvProfileId={profile.id}
                      className="rounded-full border border-zinc-300 px-3 py-1 text-base font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    />
                  )}
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

              <p className="mt-2 text-sm text-zinc-500">
                «Інші»: щоденний пошук defense/military-tech вакансій із
                бронюванням будь-де в інтернеті (включно з Djinni й DOU),
                незалежно від ключових слів нижче. Вмикання деактивує
                ручні конфігурації Djinni/DOU для цього CV.
              </p>

              {profile.otherModeEnabled ? (
                <p className="mt-4 rounded-md border border-zinc-200 p-3 text-base text-zinc-500 dark:border-zinc-800">
                  Ручні ключові слова вимкнено, поки активний режим «Інші».
                  Вимкни режим вище, щоб знову керувати Djinni/DOU вручну.
                </p>
              ) : (
              <form action={addSearchConfig} className="mt-4 flex flex-col gap-2">
                <input type="hidden" name="cvProfileId" value={profile.id} />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    name="keywords"
                    placeholder="напр. Python, FastAPI, Django"
                    required
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-base sm:flex-1 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <SubmitButton
                    pendingText="Додаю…"
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Додати
                  </SubmitButton>
                </div>
                <p className="text-sm text-zinc-500">
                  Через кому — вакансія підходить, якщо в ній є хоча б одне зі
                  слів.
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-500">
                    Джерела (можна обидва):
                  </span>
                  <SourceCheckboxes />
                </div>
                <ReservationCheckbox />
              </form>
              )}

              {profile.searchConfigs.length === 0 ? (
                <p className="mt-3 text-base text-zinc-500">
                  Для цього CV ще не додано ключових слів.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {profile.searchConfigs.map((config) => (
                    <li
                      key={config.id}
                      className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2 text-base sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800"
                    >
                      <span>
                        {config.keywords} · {config.source}
                        {config.expLevels && ` · досвід: ${config.expLevels}`}
                        {config.requireReservation && " · лише з бронюванням"}
                        {!config.active && " · вимкнено"}
                      </span>
                      <div className="flex items-center gap-3">
                        <form action={toggleSearchConfig}>
                          <input type="hidden" name="id" value={config.id} />
                          <input
                            type="hidden"
                            name="nextActive"
                            value={(!config.active).toString()}
                          />
                          <SubmitButton
                            pendingText="…"
                            disabled={profile.otherModeEnabled}
                            className="text-base text-zinc-500 underline hover:text-zinc-900 disabled:hover:no-underline dark:hover:text-zinc-100"
                          >
                            {config.active ? "Вимкнути" : "Увімкнути"}
                          </SubmitButton>
                        </form>
                        <form action={deleteSearchConfig}>
                          <input type="hidden" name="id" value={config.id} />
                          <SubmitButton
                            pendingText="Видаляю…"
                            disabled={profile.otherModeEnabled}
                            className="text-base text-red-500 underline hover:text-red-700 disabled:hover:no-underline dark:hover:text-red-400"
                          >
                            Видалити
                          </SubmitButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

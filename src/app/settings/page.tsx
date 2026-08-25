import { prisma } from "@/lib/prisma";
import type { CvProfile, SearchConfig } from "@/generated/prisma/client";
import {
  addSearchConfig,
  toggleSearchConfig,
  deleteSearchConfig,
  deleteCvProfile,
  uploadCvProfile,
} from "./actions";

type CvProfileWithConfigs = CvProfile & { searchConfigs: SearchConfig[] };

const EXP_LEVEL_OPTIONS = [
  { value: "no_exp", label: "без досвіду" },
  { value: "1y", label: "1 рік" },
  { value: "2y", label: "2 роки" },
  { value: "3y", label: "3 роки" },
  { value: "5y,6y,7y,8y,9y,10y", label: "5+ років" },
];

export default async function SettingsPage() {
  const cvProfiles: CvProfileWithConfigs[] = await prisma.cvProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: { searchConfigs: { orderBy: { createdAt: "desc" } } },
  });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Налаштування</h1>
        <div className="flex gap-2">
          <a
            href="/api/run-search"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Запустити пошук зараз (усі CV)
          </a>
          <a
            href="/api/run-matching"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Порахувати % збігу
          </a>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Додати CV-профіль</h2>
        <form action={uploadCvProfile} className="flex gap-2">
          <input
            type="text"
            name="label"
            placeholder="напр. Backend Python"
            required
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="file"
            name="file"
            accept=".pdf,.docx"
            required
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-zinc-800"
          />
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Завантажити
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">CV-профілі та їх ключові слова</h2>

        {cvProfiles.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Ще не завантажено жодного CV. Додай CV вище — ключові слова
            пошуку додаються під конкретний CV-профіль.
          </p>
        ) : (
          cvProfiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{profile.label}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-zinc-500">
                    {profile.extractedText}
                  </div>
                </div>
                <form action={deleteCvProfile}>
                  <input type="hidden" name="id" value={profile.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-500 underline hover:text-red-700 dark:hover:text-red-400"
                  >
                    Видалити CV
                  </button>
                </form>
              </div>

              <form action={addSearchConfig} className="mt-4 flex flex-col gap-2">
                <input type="hidden" name="cvProfileId" value={profile.id} />
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="keywords"
                    placeholder="напр. Python, FastAPI, Django"
                    required
                    className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Додати
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  Через кому — вакансія підходить, якщо в ній є хоча б одне зі
                  слів.
                </p>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="text-zinc-500">
                      Джерела (можна обидва):
                    </span>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        name="sources"
                        value="DJINNI"
                        defaultChecked
                      />
                      Djinni
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" name="sources" value="DOU" />
                      DOU (експериментально)
                    </label>
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    DOU: за повідомленнями спільноти сайт забороняє
                    автоматизований збір даних без згоди адміністрації —
                    вмикається на власний розсуд, використовується
                    консервативно (мінімум запитів, без пагінації). Кожна
                    вакансія позначена джерелом, звідки вона знайдена.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-zinc-500">
                    Досвід, лише Djinni (необов&apos;язково):
                  </span>
                  {EXP_LEVEL_OPTIONS.map((level) => (
                    <label
                      key={level.value}
                      className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400"
                    >
                      <input
                        type="checkbox"
                        name="expLevels"
                        value={level.value}
                      />
                      {level.label}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    name="requireReservation"
                    value="true"
                  />
                  Лише вакансії з бронюванням від мобілізації (перевірена
                  добірка Djinni, лише Djinni)
                </label>
              </form>

              {profile.searchConfigs.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  Для цього CV ще не додано ключових слів.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {profile.searchConfigs.map((config) => (
                    <li
                      key={config.id}
                      className="flex items-center justify-between rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-800"
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
                          <button
                            type="submit"
                            className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                          >
                            {config.active ? "Вимкнути" : "Увімкнути"}
                          </button>
                        </form>
                        <form action={deleteSearchConfig}>
                          <input type="hidden" name="id" value={config.id} />
                          <button
                            type="submit"
                            className="text-xs text-red-500 underline hover:text-red-700 dark:hover:text-red-400"
                          >
                            Видалити
                          </button>
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

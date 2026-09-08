# Search engine redesign — design

Status: validated with user, ready for implementation planning.

## Problem

The current search system couples three things that shouldn't be coupled:

- **"Fuel" for a search** is a manually-typed, comma-separated keyword string
  the user maintains per CV (`SearchConfig.keywords`), instead of coming from
  the CV itself.
- **Which sites to search** is expressed as separate `SearchConfig` rows (one
  per source) that the user creates/toggles/deletes by hand, plus a totally
  separate "Інші" mode (`CvProfile.otherModeEnabled`) that swaps in
  system-managed configs hardcoded to a defense/military-tech keyword list
  (`defense-keywords.ts`), unrelated to the CV.
- **Scoring** only reliably runs after the two paths that happen to call
  `scoreProfilesForUser`/`scoreAllProfiles` themselves (`/api/run-search`,
  `/api/run-other`, the cron). There's no single choke point that guarantees
  "search finished without error → scoring always runs, and the user always
  sees it running."

This causes: no way to search DOU-only or Djinni-only on demand without
hand-managing config rows; the "everywhere" mode is locked to one hardcoded
topic instead of the user's actual CV; reservation-filtering is buried inside
the keyword-add form instead of being a simple per-search toggle; and there's
no per-CV manual trigger for a normal keyword search at all (only the
all-CVs button, and the separate "Інші" trigger).

## Decisions made during brainstorming

1. **"Everywhere" search becomes fully CV-driven**, not
   defense/military-tech-specific. `defense-keywords.ts` and the "Інші" mode
   concept are retired. Reservation-filtering becomes an orthogonal, optional
   toggle available on every search, not a topic.
2. **DOU/Djinni search terms are auto-extracted from the CV once, at
   upload time**, cached on `CvProfile`, and reused for every search until
   the CV is replaced (not re-extracted per search, not manually edited).
3. **Djinni's experience-level filter (`expLevels`) is dropped entirely** —
   it was part of the manual keyword-add form being removed and was never
   mentioned as a requirement.
4. **The daily cron becomes optional and user-configured per search**,
   replacing the old single fixed daily scan of "all active configs" with a
   `ScheduledSearch` entity the user creates from the UI (see below).
5. A scheduled/manual search can target **one specific CV or all of the
   user's CVs** — both the top-level button and per-CV buttons open the same
   modal with a CV dropdown (defaulting appropriately, always freely
   editable) containing "Всі" plus each CV's label.
6. Vercel Hobby-plan cron jobs can only fire once per day (platform limit,
   not a code choice) — so **schedules only carry an interval** (Щодня /
   Кожні 3 дні / Щотижня / Щомісяця), no time-of-day picker, since an "at
   14:00" promise couldn't be honored anyway.
7. `VacancyDiscovery` loses its link to a specific search run/config — it's
   just "vacancy X is in CV Y's pool," no audit trail of which run found it.
   This was an explicit simplification the user accepted (nothing in the UI
   ever showed that history anyway).
8. The "don't suggest scheduling again" preference is a **DB-level per-user
   flag** (`User.hideScheduleSuggestion`), not localStorage — it should
   follow the account across devices/browsers.
9. Searches across CVs/sources within one run stay **sequential**, matching
   today's DOU rate-limiting behavior and staying safely inside the 300s
   Vercel function budget.
10. **Task 1's migration was hand-written instead of a literal
    `prisma migrate dev` run.** The plan's one-liner would have been
    data-lossy: `VacancyDiscovery` needed a new required `cvProfileId`
    column derived from each row's `SearchConfig` before `SearchConfig`
    could be dropped, which a generated migration can't sequence on its own.
    The applied migration instead adds the new columns nullable, backfills
    them from the still-present `SearchConfig` table, dedupes rows that
    collapse under the new `(vacancyId, cvProfileId)` uniqueness (2 of 446
    existing rows were exact collisions), then drops the old columns and
    `SearchConfig` itself.

## Data model

```prisma
enum SearchScope {
  DOU
  DJINNI
  BOTH
  EVERYWHERE
}

enum ScheduleInterval {
  DAILY
  EVERY_3_DAYS
  WEEKLY
  MONTHLY
}

model User {
  // ...existing fields...
  hideScheduleSuggestion Boolean @default(false)
  scheduledSearches      ScheduledSearch[]
}

model CvProfile {
  // ...existing fields, minus otherModeEnabled...
  searchTerms String[] // auto-extracted at upload time, cached
}

// Direct link, no more SearchConfig middle-man.
model VacancyDiscovery {
  id          String   @id @default(cuid())
  vacancy     Vacancy  @relation(fields: [vacancyId], references: [id], onDelete: Cascade)
  vacancyId   String
  cvProfile   CvProfile @relation(fields: [cvProfileId], references: [id], onDelete: Cascade)
  cvProfileId String
  foundAt     DateTime @default(now())

  @@unique([vacancyId, cvProfileId])
}

model ScheduledSearch {
  id                 String           @id @default(cuid())
  user               User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId             String
  // null = "Всі" (every CV the user owns, evaluated at run time)
  cvProfile          CvProfile?       @relation(fields: [cvProfileId], references: [id], onDelete: Cascade)
  cvProfileId        String?
  scope              SearchScope
  requireReservation Boolean          @default(false)
  interval           ScheduleInterval
  paused             Boolean          @default(false)
  lastRunAt          DateTime?
  nextRunAt          DateTime
  createdAt          DateTime         @default(now())
}
```

`SearchConfig` model and the `otherModeEnabled` field are dropped entirely
(destructive migration — acceptable, nothing worth preserving survives the
redesign). Existing `CvProfile` rows get a one-time backfill script to
populate `searchTerms` via the same extraction call used at upload time.

`Match` and `Vacancy` are unchanged.

## The generic search engine

One function replaces `ingestSearchConfig`/`ingestOtherSearchConfig`/
`toggleOtherMode`:

```ts
async function runSearch(params: {
  cvProfileIds: string[]; // resolved by the caller: [oneId] or every CV id
  scope: SearchScope;
  requireReservation: boolean;
  onStatus?: (message: string) => void;
}): Promise<{ perCv: Array<{ cvProfileId: string; found: number; created: number; error?: string }> }>
```

For each CV profile, sequentially:

- If `scope` is `DOU`, `DJINNI`, or `BOTH`: query each of `cvProfile.searchTerms`
  against the relevant site(s), OR-merged by `sourceUrl` (same dedup logic
  `ingest.ts` already has), `requireReservation` passed straight into the
  existing Djinni `editorial=reservation` / DOU `+ "бронювання"` mechanics
  (unchanged — this part already works).
- If `scope` is `EVERYWHERE`: `fetchOtherVacancies` is rewritten to build its
  web-search prompt from the CV's own terms/domain instead of
  `DEFENSE_KEYWORDS`, with `requireReservation` folded in as an optional
  instruction rather than the whole premise. The existing daily creation cap
  and staleness filter stay.
- Persist via the simplified `VacancyDiscovery` (dedup globally by
  `sourceUrl`, never delete).
- **If that CV's ingest succeeded, score it immediately** — this is the
  scoring guarantee: it is not a separate step callers can forget to invoke,
  it lives inside `runSearch` itself. If CV A's ingest throws, CV B in the
  same batch still gets scored; A's error is reported per-CV, not
  batch-fatal.

`runSearch` is the *only* path that ingests or scores. It is called from
three places: the manual search modal's streaming route, the schedule
evaluator (replacing the cron's direct calls to `runActiveSearches`/
`scoreAllProfiles`), and nowhere else — so manual and automatic runs can
never drift apart in behavior.

## UI: the search modal

One reusable client component, `SearchModal`, replaces `RunTaskButton`,
`OtherSearchTrigger`, `SourceCheckboxes`, and `ReservationCheckbox`.

Two triggers on `/settings`:
- A large primary button above the CV list ("Шукати вакансії"), opening the
  modal with the CV dropdown defaulted to **«Всі»**.
- A smaller button on each CV card, opening the same modal defaulted to
  **that CV** — the dropdown is always freely editable regardless of which
  trigger opened it.

Modal contents:
1. CV dropdown — «Всі» + every uploaded CV's label.
2. Scope — radio: Тільки DOU / Тільки Djinni / DOU + Djinni / По всьому
   інтернету.
3. Reservation checkbox — «Лише вакансії з бронюванням від мобілізації».
4. «Шукати» button.

Submitting calls one streaming NDJSON route (generalizing today's
`/api/run-other` pattern) that runs `runSearch(...)`, pushing live status per
CV/source, then explicitly **"Оцінюю відповідність…"** while scoring runs —
same full-screen spinner overlay throughout, so the scoring phase is never
silent or skippable. Ends in "Готово" (found/created counts) or an error
state.

On success, if `!user.hideScheduleSuggestion`, the modal's content swaps
in-place to the schedule-suggestion follow-up (see below) instead of just
closing.

`/api/run-search` (today's plain GET-redirect) is replaced by the streaming
route; every search, of every scope, now goes through this one modal and one
engine call.

## Scheduling subsystem

**Creating a schedule, two entry points:**

1. **Post-search suggestion** — after a manual search's "Готово" screen, if
   the user hasn't opted out, the modal shows: "Запланувати автоматичний
   пошук із цими параметрами?" (CV/scope/reservation carried over from the
   run that just finished) + an interval picker (Щодня / Кожні 3 дні /
   Щотижня / Щомісяця) + «Так, запланувати» / «Ні» + a «Більше не
   пропонувати» checkbox that sets `User.hideScheduleSuggestion = true`
   regardless of Так/Ні.
2. **Standalone** — a `/settings` button ("Запланувати автоматичне
   виконання") opens the same configuration modal (CV dropdown, scope,
   reservation, interval) but only creates the schedule — no immediate run.

**Management:** a small, slightly-highlighted button in the header, next to
the nav links (desktop) and in the mobile menu — visible on every screen —
opens a modal listing the user's `ScheduledSearch` rows: CV (or «Всі»),
scope, reservation, interval, next run date, paused state. Each row has
Редагувати (reopens the same creation modal, prefilled), Пауза/Відновити,
Видалити.

**Evaluation:** `/api/cron/daily-scan` (still triggered once/day by Vercel,
`vercel.json` unchanged) becomes a thin evaluator: fetch every
`ScheduledSearch` where `paused = false && nextRunAt <= now`; for each,
resolve `cvProfileIds` (the one CV, or every CV owned by that job's user) and
call `runSearch(...)`; update `lastRunAt = now` and recompute `nextRunAt`
from `interval`; catch per-job errors so one failing job doesn't block the
rest.

## Files touched

**Removed:** `src/lib/defense-keywords.ts`, `src/components/other-search-overlay.tsx`,
`src/components/source-checkboxes.tsx`, `src/components/run-task-button.tsx`,
the `addSearchConfig`/`toggleSearchConfig`/`deleteSearchConfig`/
`toggleOtherMode` actions in `src/app/settings/actions.ts`.

**Rewritten:** `src/lib/ingest.ts` (→ `runSearch`), `src/lib/sources/other.ts`
(CV-driven, reservation optional), `src/app/api/run-search/route.ts` (→ NDJSON
streaming, parametrized by scope/CV selection/reservation), `src/app/api/cron/daily-scan/route.ts`
(→ schedule evaluator), `src/app/settings/page.tsx` and `src/app/vacancies/page.tsx`
(drop the manual-config list UI and the disabled-config vacancy-hiding
logic), `prisma/schema.prisma`.

**Added:** `SearchModal` (+ its schedule-suggestion follow-up state), a
header "Заплановані пошуки" button + management modal, a CV-term-extraction
helper (used both at upload and in the backfill script), `ScheduledSearch`
CRUD server actions, the schedule evaluator logic inside the cron route.

# Search Engine Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the manual-keyword-config search system with a generic, CV-driven search engine (4 selectable scopes: DOU-only / Djinni-only / both / everywhere), an optional reservation filter, scoring that always runs after a successful search (with a visible loader), and a user-configured scheduling subsystem replacing the fixed daily cron.

**Architecture:** One `runSearch()` function in `src/lib/ingest.ts` becomes the single ingest+score entry point, called from a new streaming API route (manual searches, via a `SearchModal` UI) and from the cron route (scheduled searches, via a `ScheduledSearch` table). `SearchConfig` and the "Інші" mode are deleted; DOU/Djinni query terms come from `CvProfile.searchTerms`, auto-extracted once at CV upload.

**Tech Stack:** Next.js App Router, Prisma 7 / Postgres, Anthropic SDK (Haiku for term extraction, Sonnet for the web-search "everywhere" leg), no test runner in this repo — verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, and manual dev-server QA (see final task).

**Design doc:** `docs/plans/2026-09-02-search-engine-redesign-design.md` — read it first for the "why" behind every decision below.

---

## Before you start

This repo has **no test framework** (`package.json` has no jest/vitest/playwright). Every task below substitutes TDD's red/green steps with: write the code → `npx tsc --noEmit` → for pure logic, a one-off manual check via `npx tsx`. Do not add a test framework as part of this work — out of scope, not requested.

The schema migration in Task 1 is **destructive**: it drops the `SearchConfig` table and `CvProfile.otherModeEnabled` column. This has already been discussed and accepted (see design doc, decision log) — nothing in those rows is worth preserving, the CV-derived `searchTerms` replace them. Still, **stop and confirm with the user before running `prisma migrate dev` against a real database** if this is a shared/production DB, not a disposable local one.

Commit after every task (the plan says exactly when).

---

### Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Replace the file with this complete content**

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Source {
  DJINNI
  DOU
  OTHER
}

enum MatchStatus {
  NEW
  TO_APPLY
  APPLIED
  DISMISSED
}

// Finer-grained outcome of an already-applied match, independent of
// MatchStatus — null means still just "Подався" with no outcome yet.
enum MatchOutcome {
  INTERVIEW
  HIRED
  REJECTED
}

// What a search run looked at: one board, both boards, or a broad
// web-search across the whole internet. Independent of the reservation
// filter, which is just a boolean on top of any scope.
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
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  // "Don't suggest scheduling a job after a manual search" — set once the
  // user checks that box in the post-search follow-up modal.
  hideScheduleSuggestion Boolean @default(false)

  cvProfiles        CvProfile[]
  scheduledSearches ScheduledSearch[]
}

model CvProfile {
  id            String   @id @default(cuid())
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId        String
  label         String
  // Original uploaded filename (for extension/content-type on re-download);
  // the file itself is stored in the DB, not on disk — Vercel's filesystem
  // is ephemeral, so a local upload would vanish on the next deploy.
  fileName      String
  fileData      Bytes
  extractedText String
  createdAt     DateTime @default(now())
  // Short skill/technology/domain terms auto-extracted from extractedText
  // once at upload time (see lib/cv.ts#extractSearchTerms), cached here and
  // reused as DOU/Djinni query terms for every search until the CV is
  // replaced. Never user-edited.
  searchTerms   String[]

  matches           Match[]
  discoveries       VacancyDiscovery[]
  scheduledSearches ScheduledSearch[]
}

model Vacancy {
  id        String   @id @default(cuid())
  source    Source
  sourceUrl String   @unique
  title     String
  company   String?
  rawText   String
  foundAt   DateTime @default(now())

  matches     Match[]
  discoveries VacancyDiscovery[]
}

// Direct link between a Vacancy (globally deduped by URL) and the CvProfile
// whose search found it — no longer routed through a persisted search
// config, so the same vacancy can belong to more than one CV's pool without
// duplicating the Vacancy row, and nothing about it is ever deleted on a
// later search.
model VacancyDiscovery {
  id          String    @id @default(cuid())
  vacancy     Vacancy   @relation(fields: [vacancyId], references: [id], onDelete: Cascade)
  vacancyId   String
  cvProfile   CvProfile @relation(fields: [cvProfileId], references: [id], onDelete: Cascade)
  cvProfileId String
  foundAt     DateTime  @default(now())

  @@unique([vacancyId, cvProfileId])
}

model Match {
  id          String        @id @default(cuid())
  vacancy     Vacancy       @relation(fields: [vacancyId], references: [id], onDelete: Cascade)
  vacancyId   String
  cvProfile   CvProfile     @relation(fields: [cvProfileId], references: [id], onDelete: Cascade)
  cvProfileId String
  score       Int
  coverLetter String?
  status      MatchStatus   @default(NEW)
  outcome     MatchOutcome?
  createdAt   DateTime      @default(now())

  @@unique([vacancyId, cvProfileId])
}

// A user-configured recurring search: "run this same search every N days".
// cvProfileId null means "Всі" — every CV the user owns at evaluation time,
// not a frozen list. Evaluated by the daily cron (see api/cron/daily-scan);
// Vercel Hobby cron can only fire once/day, so there is deliberately no
// time-of-day field, only an interval.
model ScheduledSearch {
  id                 String           @id @default(cuid())
  user               User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId             String
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

**Step 2: Format and create the migration**

```bash
npx prisma format
npx prisma migrate dev --name search_engine_redesign
```

If Prisma warns about data loss (dropping `SearchConfig`, dropping
`CvProfile.otherModeEnabled`) and prompts for confirmation, confirm — this is
the intended, discussed change. If `migrate dev` can't reach the database
from this environment, use `npx prisma migrate dev --create-only --name search_engine_redesign`
to generate the SQL for review, then apply it the way this project normally
applies migrations.

**Step 3: Regenerate the client (usually automatic from Step 2, run explicitly to be sure)**

```bash
npx prisma generate
```

**Step 4: Verify**

```bash
npx tsc --noEmit
```

Expect existing errors in files this plan hasn't touched yet (`ingest.ts`,
`settings/actions.ts`, `settings/page.tsx`, `vacancies/page.tsx` will all
reference now-removed `SearchConfig`/`otherModeEnabled`) — that's expected
until later tasks fix them. Just confirm the *schema/client* itself
generated without error (no Prisma errors in the output).

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Replace SearchConfig with CV-driven scopes and ScheduledSearch"
```

---

### Task 2: CV search-term extraction

**Files:**
- Modify: `src/lib/cv.ts`
- Modify: `src/app/settings/actions.ts:138-159` (`uploadCvProfile`)

**Step 1: Add `extractSearchTerms` to `src/lib/cv.ts`**

Append to the existing file (keep the existing `extractTextFromFile` and its
imports untouched):

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const client = new Anthropic();

const SearchTermsSchema = z.object({
  terms: z
    .array(z.string())
    .min(5)
    .max(15)
    .describe(
      "Short skill/technology/domain terms suitable as job-board keyword-search queries",
    ),
});

const SEARCH_TERMS_SYSTEM_PROMPT = `You extract short search-engine keywords from a candidate's CV, suitable for querying a job board's keyword search (like "Python", "FastAPI", "computer vision", "embedded systems"). Prefer specific technologies, frameworks, and named domains over generic soft-skill words ("teamwork", "communication"). Return 8-15 terms, ranked by how central they are to the candidate's profile, no duplicates, no explanations.`;

// Cached once on CvProfile.searchTerms at upload time (see
// settings/actions.ts#uploadCvProfile) and reused as DOU/Djinni query terms
// for every search of that CV, instead of a user-typed keyword list.
export async function extractSearchTerms(cvText: string): Promise<string[]> {
  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: SEARCH_TERMS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: cvText }],
    output_config: {
      format: zodOutputFormat(SearchTermsSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return parseable search terms");
  }
  return response.parsed_output.terms;
}
```

**Step 2: Wire it into `uploadCvProfile`**

In `src/app/settings/actions.ts`, add the import and update the function:

```ts
import { extractTextFromFile, extractSearchTerms } from "@/lib/cv";
```

```ts
export async function uploadCvProfile(formData: FormData) {
  const userId = await requireUserId();
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");

  if (!label || !(file instanceof File) || file.size === 0) return;

  const buffer = Buffer.from(await file.arrayBuffer());
  const extractedText = await extractTextFromFile(buffer, file.name);
  const searchTerms = await extractSearchTerms(extractedText);

  await prisma.cvProfile.create({
    data: {
      userId,
      label,
      fileName: file.name,
      fileData: buffer,
      extractedText,
      searchTerms,
    },
  });

  revalidatePath("/settings");
}
```

**Step 3: Verify**

```bash
npx tsc --noEmit
```

`cv.ts` and the `uploadCvProfile` edit should now type-check cleanly (other
pre-existing errors from Task 1 are still expected).

**Step 4: Commit**

```bash
git add src/lib/cv.ts src/app/settings/actions.ts
git commit -m "Auto-extract CV search terms at upload time"
```

---

### Task 3: Backfill script for existing CVs

**Files:**
- Create: `scripts/backfill-search-terms.ts`

**Step 1: Write the script**

```ts
import { prisma } from "../src/lib/prisma";
import { extractSearchTerms } from "../src/lib/cv";

async function main() {
  const profiles = await prisma.cvProfile.findMany({
    where: { searchTerms: { isEmpty: true } },
  });
  console.log(`Backfilling searchTerms for ${profiles.length} CV profile(s)…`);

  for (const profile of profiles) {
    const terms = await extractSearchTerms(profile.extractedText);
    await prisma.cvProfile.update({
      where: { id: profile.id },
      data: { searchTerms: terms },
    });
    console.log(`  ${profile.id} (${profile.label}): ${terms.join(", ")}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
```

**Step 2: Run it once, after Task 1's migration is applied to the real database**

```bash
npx tsx scripts/backfill-search-terms.ts
```

(`npx` fetches `tsx` transiently if it isn't installed — no need to add it
as a dependency for a one-off script.) Confirm every existing CV profile
printed a non-empty term list.

**Step 3: Commit**

```bash
git add scripts/backfill-search-terms.ts
git commit -m "Add one-time backfill script for CV search terms"
```

---

### Task 4: Rewrite the "everywhere" source to be CV-driven

**Files:**
- Modify: `src/lib/sources/other.ts`

**Step 1: Replace the file's content**

Keep the file's existing top-of-function comment explaining why `thinking`
is deliberately omitted (cost/reliability tradeoff) — carry it over
unchanged. Replace the defense-topic-specific parts:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { FetchedVacancy } from "@/lib/sources/types";

const client = new Anthropic();

// Vacancies discovered by this web-search leg must have an estimated
// publish date within this many days of the scan run, or an undeterminable
// date is treated as too old to trust.
export const OTHER_MAX_VACANCY_AGE_DAYS = 14;

// Global cap (not per-CV) on new OTHER-source vacancies created per day,
// across the whole app — protects the Claude API budget.
export const OTHER_DAILY_VACANCY_CAP = 100;

const CandidateSchema = z.object({
  vacancies: z.array(
    z.object({
      title: z.string(),
      sourceUrl: z.string().describe("Direct URL to the vacancy posting"),
      company: z.string().nullable(),
      rawText: z.string().describe("Short excerpt describing the role and requirements"),
      publishedDaysAgo: z
        .number()
        .int()
        .nullable()
        .describe("Days since the vacancy was posted, or null if undeterminable"),
    }),
  ),
});

function buildSearchSystemPrompt(requireReservation: boolean): string {
  return `Do NOT use code execution or write/run scripts of any kind. Call the web_search tool directly, one query at a time. This restriction is critical — violating it wastes budget and time.

You search the public web for current IT/tech job vacancies in Ukraine that match the given candidate's skills and domain.
${
  requireReservation
    ? "\nOnly report vacancies that explicitly offer a reservation from mobilization (\"бронювання\") — skip anything that does not mention it.\n"
    : ""
}
Search broadly — job boards, company career pages, aggregators, anywhere — not limited to any single site. For each distinct vacancy you find, report:
- its title
- the direct URL to the posting
- the employer/company if known
- a short excerpt describing the role and requirements
- how many days ago it was posted, if the page states or implies this (e.g. "posted 3 days ago", an explicit date, "today", "this week")

Do 4-6 targeted searches, then write a final summary listing every distinct vacancy you found, one per paragraph, with all of the above — keep each paragraph brief, this is a list not an essay. If you cannot determine how many days ago a vacancy was posted, say so explicitly rather than guessing.`;
}

// Broad, site-agnostic search driven by the CV's own extracted terms
// (see CvProfile.searchTerms), with an optional reservation-from-mobilization
// filter — not tied to any fixed topic. Two-step: (1) let Claude search the
// web and write up what it found in prose, (2) a separate structured-output
// call extracts a clean list from that prose. Filters out anything older
// than OTHER_MAX_VACANCY_AGE_DAYS or with an undeterminable publish date.
//
// Deliberately no `thinking` config: tested with adaptive thinking enabled,
// it never surfaced usable text (thinking blocks came back empty — the
// content is redacted/billed but not returned) while roughly quadrupling
// input-token cost (~500K vs ~130K tokens/call) and making the model far
// more likely to reach for an unrequested code_execution tool to batch
// searches, which is both slower and less reliable.
export async function fetchOtherVacancies(options: {
  cvSearchTerms: string[];
  requireReservation: boolean;
  maxResults: number;
}): Promise<FetchedVacancy[]> {
  if (options.maxResults <= 0) return [];

  const searchStream = client.messages.stream(
    {
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: buildSearchSystemPrompt(options.requireReservation),
      messages: [
        {
          role: "user",
          content: `Find vacancies posted within the last ${OTHER_MAX_VACANCY_AGE_DAYS} days matching this candidate profile. Relevant skills/terms: ${options.cvSearchTerms.join(", ")}.`,
        },
      ],
      tools: [
        {
          type: "web_search_20260318",
          name: "web_search",
          max_uses: 8,
        },
      ],
    },
    // Without this, a stalled request (network hiccup, Anthropic-side
    // stall) hangs indefinitely — the route's try/catch never fires, so
    // the client never gets an error/done event and the overlay just
    // freezes forever with no explanation.
    { timeout: 120_000 },
  );

  const searchResponse = await searchStream.finalMessage();

  const textBlocks = searchResponse.content.filter(
    (block) => block.type === "text",
  );
  const searchSummary = textBlocks.map((block) => block.text).join("\n\n");
  if (!searchSummary.trim()) return [];

  const extraction = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system:
      "Extract a structured list of vacancies from the given research notes. Only include vacancies that are clearly distinct postings with a URL.",
    messages: [{ role: "user", content: searchSummary }],
    output_config: {
      format: zodOutputFormat(CandidateSchema),
    },
  });

  if (!extraction.parsed_output) return [];

  const fresh = extraction.parsed_output.vacancies.filter(
    (candidate) =>
      candidate.publishedDaysAgo === null ||
      candidate.publishedDaysAgo <= OTHER_MAX_VACANCY_AGE_DAYS,
  );

  return fresh.slice(0, options.maxResults).map((candidate) => ({
    source: "OTHER" as const,
    sourceUrl: candidate.sourceUrl,
    title: candidate.title,
    company: candidate.company,
    rawText: candidate.rawText,
  }));
}
```

Note: this task does **not** delete `src/lib/defense-keywords.ts` yet — it's
still imported by `src/lib/ingest.ts` and `src/app/settings/actions.ts`
until Tasks 5 and 13 remove those. Deleting it now would break the build.

**Step 2: Verify**

```bash
npx tsc --noEmit
```

`src/lib/sources/other.ts` itself should type-check; errors elsewhere are
still expected.

**Step 3: Commit**

```bash
git add src/lib/sources/other.ts
git commit -m "Make the everywhere search CV-driven instead of defense-topic-specific"
```

---

### Task 5: The generic search engine (`runSearch`)

**Files:**
- Modify: `src/lib/ingest.ts` (full rewrite)

**Step 1: Replace the file's content**

```ts
import { prisma } from "@/lib/prisma";
import { fetchDjinniVacancies } from "@/lib/sources/djinni";
import { fetchDouVacancies } from "@/lib/sources/dou";
import { fetchOtherVacancies, OTHER_DAILY_VACANCY_CAP } from "@/lib/sources/other";
import { scoreCvProfile } from "@/lib/scoring";
import type { FetchedVacancy } from "@/lib/sources/types";
import type { CvProfile } from "@/generated/prisma/client";

export type SearchScope = "DOU" | "DJINNI" | "BOTH" | "EVERYWHERE";

export interface RunSearchParams {
  cvProfileIds: string[];
  scope: SearchScope;
  requireReservation: boolean;
  onStatus?: (message: string) => void;
}

export interface RunSearchCvResult {
  cvProfileId: string;
  found: number;
  created: number;
  scored: number;
  toApply: number;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Shared tail for every ingest path: dedup by sourceUrl against the global
// Vacancy table, create rows for new ones, and link this CV profile to each
// — never deleting anything, so re-running a search only ever adds.
async function persistDiscoveries(
  cvProfileId: string,
  vacancies: Iterable<FetchedVacancy>,
): Promise<{ found: number; created: number }> {
  let found = 0;
  let created = 0;
  for (const vacancy of vacancies) {
    found += 1;
    const existing = await prisma.vacancy.findUnique({
      where: { sourceUrl: vacancy.sourceUrl },
      select: { id: true },
    });

    const vacancyRecord =
      existing ??
      (await prisma.vacancy.create({
        data: {
          source: vacancy.source,
          sourceUrl: vacancy.sourceUrl,
          title: vacancy.title,
          company: vacancy.company,
          rawText: vacancy.rawText,
        },
      }));

    if (!existing) created += 1;

    await prisma.vacancyDiscovery.upsert({
      where: {
        vacancyId_cvProfileId: {
          vacancyId: vacancyRecord.id,
          cvProfileId,
        },
      },
      create: { vacancyId: vacancyRecord.id, cvProfileId },
      update: {},
    });
  }

  return { found, created };
}

// A CV's cached searchTerms are OR'd together: a vacancy matching any one
// term qualifies. DOU/Djinni only accept one query at a time, so each term
// is queried separately and merged by sourceUrl.
async function fetchDouOrDjinniVacancies(
  source: "DOU" | "DJINNI",
  terms: string[],
  requireReservation: boolean,
): Promise<FetchedVacancy[]> {
  const bySourceUrl = new Map<string, FetchedVacancy>();
  for (const term of terms) {
    const vacancies =
      source === "DOU"
        ? await fetchDouVacancies(term, { requireReservation })
        : await fetchDjinniVacancies(term, { requireReservation });
    for (const vacancy of vacancies) {
      if (!bySourceUrl.has(vacancy.sourceUrl)) {
        bySourceUrl.set(vacancy.sourceUrl, vacancy);
      }
    }
    // dou.ua is scraped HTML, not a public feed API — stay conservative
    // between requests rather than firing one per term back to back.
    if (source === "DOU" && terms.length > 1) {
      await sleep(2000);
    }
  }
  return Array.from(bySourceUrl.values());
}

async function ingestForCvProfile(
  cvProfile: CvProfile,
  scope: SearchScope,
  requireReservation: boolean,
  onStatus?: (message: string) => void,
): Promise<{ found: number; created: number }> {
  let found = 0;
  let created = 0;

  if (scope === "DOU" || scope === "BOTH") {
    onStatus?.(`Сканую DOU для «${cvProfile.label}»…`);
    const vacancies = await fetchDouOrDjinniVacancies("DOU", cvProfile.searchTerms, requireReservation);
    const result = await persistDiscoveries(cvProfile.id, vacancies);
    found += result.found;
    created += result.created;
  }

  if (scope === "DJINNI" || scope === "BOTH") {
    onStatus?.(`Сканую Djinni для «${cvProfile.label}»…`);
    const vacancies = await fetchDouOrDjinniVacancies("DJINNI", cvProfile.searchTerms, requireReservation);
    const result = await persistDiscoveries(cvProfile.id, vacancies);
    found += result.found;
    created += result.created;
  }

  if (scope === "EVERYWHERE") {
    onStatus?.(`Шукаю по всьому інтернету для «${cvProfile.label}»…`);
    const createdToday = await prisma.vacancy.count({
      where: { source: "OTHER", foundAt: { gte: startOfTodayUTC() } },
    });
    const remaining = OTHER_DAILY_VACANCY_CAP - createdToday;
    const vacancies = await fetchOtherVacancies({
      cvSearchTerms: cvProfile.searchTerms,
      requireReservation,
      maxResults: remaining,
    });
    const result = await persistDiscoveries(cvProfile.id, vacancies);
    found += result.found;
    created += result.created;
  }

  return { found, created };
}

// The single generic search+score entry point. Called from the manual
// search modal's streaming route and from the schedule evaluator — never
// called from anywhere else, so manual and automatic runs can't drift.
//
// Scoring is not optional or separately triggered: if a CV's ingest
// succeeds, it is scored immediately, in the same call, before moving to
// the next CV. If one CV's ingest throws, the others in the batch still get
// searched and scored — errors are per-CV, not batch-fatal.
export async function runSearch(params: RunSearchParams): Promise<RunSearchCvResult[]> {
  const cvProfiles = await prisma.cvProfile.findMany({
    where: { id: { in: params.cvProfileIds } },
  });

  const results: RunSearchCvResult[] = [];

  for (const cvProfile of cvProfiles) {
    try {
      const { found, created } = await ingestForCvProfile(
        cvProfile,
        params.scope,
        params.requireReservation,
        params.onStatus,
      );

      params.onStatus?.(`Оцінюю відповідність для «${cvProfile.label}»…`);
      const { scored, toApply } = await scoreCvProfile(cvProfile);

      results.push({ cvProfileId: cvProfile.id, found, created, scored, toApply });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Невідома помилка";
      params.onStatus?.(`Помилка для «${cvProfile.label}»: ${message}`);
      results.push({
        cvProfileId: cvProfile.id,
        found: 0,
        created: 0,
        scored: 0,
        toApply: 0,
        error: message,
      });
    }
  }

  return results;
}
```

**Step 2: Verify**

```bash
npx tsc --noEmit
```

`src/lib/ingest.ts` should now type-check cleanly. `scoreCvProfile` already
exists unchanged in `src/lib/scoring.ts` — no changes needed there.

**Step 3: Commit**

```bash
git add src/lib/ingest.ts
git commit -m "Replace SearchConfig-based ingest with generic runSearch engine"
```

---

### Task 6: Streaming search API route

**Files:**
- Create: `src/app/api/search/route.ts`
- Delete: `src/app/api/run-search/route.ts`
- Delete: `src/app/api/run-other/route.ts`

**Step 1: Create the new route**

```ts
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { runSearch, type SearchScope } from "@/lib/ingest";

// DOU (rate-limited) + Djinni + the OTHER web-search leg, across possibly
// several CVs in one "Всі" run, can together run close to 300s — the hard
// ceiling on the Hobby plan.
export const maxDuration = 300;

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "done"; found: number; created: number }
  | { type: "error"; message: string }
  | { type: "ping" };

const VALID_SCOPES: SearchScope[] = ["DOU", "DJINNI", "BOTH", "EVERYWHERE"];

// Single streaming entry point for every manual search — replaces the old
// plain-redirect "run all CVs" route and the separate "Інші" NDJSON route.
// Body: { cvProfileId: string | "all", scope: SearchScope, requireReservation: boolean }.
export async function POST(request: Request) {
  const userId = await requireUserId();
  const body = await request.json().catch(() => ({}));
  const cvProfileIdParam = String(body.cvProfileId ?? "");
  const scope = body.scope as SearchScope;
  const requireReservation = body.requireReservation === true;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      // A silent multi-minute leg (e.g. EVERYWHERE waiting on web_search)
      // can let an idle intermediate proxy drop the connection long before
      // either side times out — a steady trickle of bytes keeps it alive.
      const heartbeat = setInterval(() => send({ type: "ping" }), 15_000);

      try {
        if (!VALID_SCOPES.includes(scope)) {
          send({ type: "error", message: "Невідомий тип пошуку" });
          return;
        }

        const cvProfileIds =
          cvProfileIdParam === "all"
            ? (
                await prisma.cvProfile.findMany({
                  where: { userId },
                  select: { id: true },
                })
              ).map((p) => p.id)
            : (await prisma.cvProfile.findFirst({
                  where: { id: cvProfileIdParam, userId },
                  select: { id: true },
                }))
              ? [cvProfileIdParam]
              : [];

        if (cvProfileIds.length === 0) {
          send({ type: "error", message: "CV не знайдено" });
          return;
        }

        const results = await runSearch({
          cvProfileIds,
          scope,
          requireReservation,
          onStatus: (message) => send({ type: "status", message }),
        });

        if (results.every((r) => r.error)) {
          send({ type: "error", message: results[0].error ?? "Невідома помилка" });
          return;
        }

        const totalFound = results.reduce((sum, r) => sum + r.found, 0);
        const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
        send({ type: "done", found: totalFound, created: totalCreated });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Невідома помилка",
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
```

**Step 2: Delete the two old routes**

```bash
rm src/app/api/run-search/route.ts
rm src/app/api/run-other/route.ts
```

**Step 3: Verify**

```bash
npx tsc --noEmit
```

Expect errors in `src/app/settings/page.tsx` (still importing
`RunTaskButton`/`OtherSearchTrigger`, which reference the old routes) — that
UI is rewired in Task 11. New route itself should type-check.

**Step 4: Commit**

```bash
git add -A src/app/api/search src/app/api/run-search src/app/api/run-other
git commit -m "Replace run-search/run-other routes with one streaming search API"
```

---

### Task 7: Schedule interval helper

**Files:**
- Create: `src/lib/scheduling.ts`

**Step 1: Write the helper**

```ts
export type ScheduleInterval = "DAILY" | "EVERY_3_DAYS" | "WEEKLY" | "MONTHLY";

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
```

**Step 2: Manually verify the logic (no test runner in this repo)**

```bash
npx tsx -e "
import { computeNextRunAt } from './src/lib/scheduling';
const from = new Date('2026-09-02T04:00:00.000Z');
console.log(computeNextRunAt('DAILY', from).toISOString());
console.log(computeNextRunAt('EVERY_3_DAYS', from).toISOString());
console.log(computeNextRunAt('WEEKLY', from).toISOString());
console.log(computeNextRunAt('MONTHLY', from).toISOString());
"
```

Expected output: `2026-09-03…`, `2026-09-05…`, `2026-09-09…`, `2026-10-02…`.

**Step 3: Commit**

```bash
git add src/lib/scheduling.ts
git commit -m "Add computeNextRunAt schedule interval helper"
```

---

### Task 8: Scheduled-search CRUD actions

**Files:**
- Create: `src/app/settings/schedule-actions.ts`

**Step 1: Write the actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { computeNextRunAt, type ScheduleInterval } from "@/lib/scheduling";
import type { SearchScope } from "@/lib/ingest";

const VALID_SCOPES: SearchScope[] = ["DOU", "DJINNI", "BOTH", "EVERYWHERE"];
const VALID_INTERVALS: ScheduleInterval[] = ["DAILY", "EVERY_3_DAYS", "WEEKLY", "MONTHLY"];

// cvProfileIdRaw is "" / "all" for "Всі"; anything else must be a CV the
// caller owns. Returns null for "Всі", throws/returns undefined (caller
// bails) if an id was given but doesn't belong to this user.
async function resolveOwnedCvProfileId(
  userId: string,
  cvProfileIdRaw: string,
): Promise<{ ok: true; cvProfileId: string | null } | { ok: false }> {
  if (!cvProfileIdRaw || cvProfileIdRaw === "all") return { ok: true, cvProfileId: null };
  const cvProfile = await prisma.cvProfile.findFirst({
    where: { id: cvProfileIdRaw, userId },
    select: { id: true },
  });
  return cvProfile ? { ok: true, cvProfileId: cvProfile.id } : { ok: false };
}

export async function createScheduledSearch(formData: FormData) {
  const userId = await requireUserId();
  const scope = String(formData.get("scope") ?? "") as SearchScope;
  const interval = String(formData.get("interval") ?? "") as ScheduleInterval;
  const requireReservation = formData.get("requireReservation") === "true";
  if (!VALID_SCOPES.includes(scope) || !VALID_INTERVALS.includes(interval)) return;

  const resolved = await resolveOwnedCvProfileId(userId, String(formData.get("cvProfileId") ?? ""));
  if (!resolved.ok) return;

  await prisma.scheduledSearch.create({
    data: {
      userId,
      cvProfileId: resolved.cvProfileId,
      scope,
      requireReservation,
      interval,
      nextRunAt: computeNextRunAt(interval),
    },
  });

  revalidatePath("/settings");
}

export async function updateScheduledSearch(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const scope = String(formData.get("scope") ?? "") as SearchScope;
  const interval = String(formData.get("interval") ?? "") as ScheduleInterval;
  const requireReservation = formData.get("requireReservation") === "true";
  if (!id || !VALID_SCOPES.includes(scope) || !VALID_INTERVALS.includes(interval)) return;

  const resolved = await resolveOwnedCvProfileId(userId, String(formData.get("cvProfileId") ?? ""));
  if (!resolved.ok) return;

  await prisma.scheduledSearch.updateMany({
    where: { id, userId },
    data: {
      cvProfileId: resolved.cvProfileId,
      scope,
      requireReservation,
      interval,
      nextRunAt: computeNextRunAt(interval),
    },
  });

  revalidatePath("/settings");
}

export async function toggleScheduledSearchPaused(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const nextPaused = formData.get("nextPaused") === "true";
  if (!id) return;

  await prisma.scheduledSearch.updateMany({ where: { id, userId }, data: { paused: nextPaused } });
  revalidatePath("/settings");
}

export async function deleteScheduledSearch(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.scheduledSearch.deleteMany({ where: { id, userId } });
  revalidatePath("/settings");
}

// Called directly from a client component (not a <form> action) — Next.js
// server actions can be invoked as plain typed async functions too.
export async function setHideScheduleSuggestion(hide: boolean) {
  const userId = await requireUserId();
  await prisma.user.update({ where: { id: userId }, data: { hideScheduleSuggestion: hide } });
}
```

**Step 2: Verify**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/settings/schedule-actions.ts
git commit -m "Add ScheduledSearch CRUD server actions"
```

---

### Task 9: Rewrite the cron route as a schedule evaluator

**Files:**
- Modify: `src/app/api/cron/daily-scan/route.ts` (full rewrite)

**Step 1: Replace the file's content**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSearch } from "@/lib/ingest";
import { computeNextRunAt } from "@/lib/scheduling";

export const maxDuration = 300;

// Fires once/day (Vercel Hobby cron limit — see vercel.json). Evaluates
// every ScheduledSearch that's due, runs it through the exact same
// runSearch() a manual search uses (scoring included), and reschedules it.
// A failing job is caught and reported, not allowed to block the rest.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const dueJobs = await prisma.scheduledSearch.findMany({
    where: { paused: false, nextRunAt: { lte: now } },
  });

  const results: Array<{ scheduledSearchId: string; ok: boolean; error?: string }> = [];

  for (const job of dueJobs) {
    try {
      const cvProfileIds = job.cvProfileId
        ? [job.cvProfileId]
        : (
            await prisma.cvProfile.findMany({
              where: { userId: job.userId },
              select: { id: true },
            })
          ).map((p) => p.id);

      if (cvProfileIds.length > 0) {
        await runSearch({
          cvProfileIds,
          scope: job.scope,
          requireReservation: job.requireReservation,
        });
      }

      await prisma.scheduledSearch.update({
        where: { id: job.id },
        data: { lastRunAt: now, nextRunAt: computeNextRunAt(job.interval, now) },
      });

      results.push({ scheduledSearchId: job.id, ok: true });
    } catch (error) {
      results.push({
        scheduledSearchId: job.id,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ranAt: now.toISOString(), jobsEvaluated: dueJobs.length, results });
}
```

`vercel.json` is unchanged — the daily trigger stays at `"0 4 * * *"`.

**Step 2: Verify**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/cron/daily-scan/route.ts
git commit -m "Rewrite daily cron as a ScheduledSearch evaluator"
```

---

### Task 10: Shared search-parameter fields component

**Files:**
- Create: `src/components/search-params-fields.tsx`

This is the CV dropdown + scope radios + reservation checkbox, shared
between `SearchModal`'s config step and `ScheduleModal` (Task 12) — written
once here to keep them DRY.

**Step 1: Write the component**

```tsx
"use client";

export type Scope = "DOU" | "DJINNI" | "BOTH" | "EVERYWHERE";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "DOU", label: "Тільки DOU" },
  { value: "DJINNI", label: "Тільки Djinni" },
  { value: "BOTH", label: "DOU + Djinni" },
  { value: "EVERYWHERE", label: "По всьому інтернету" },
];

export function SearchParamsFields({
  cvProfiles,
  cvProfileId,
  onCvProfileIdChange,
  scope,
  onScopeChange,
  requireReservation,
  onRequireReservationChange,
}: {
  cvProfiles: { id: string; label: string }[];
  cvProfileId: string;
  onCvProfileIdChange: (id: string) => void;
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  requireReservation: boolean;
  onRequireReservationChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 text-left">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">CV</span>
        <select
          value={cvProfileId}
          onChange={(e) => onCvProfileIdChange(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">Всі</option>
          {cvProfiles.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-zinc-500">Де шукати</legend>
        {SCOPE_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-base">
            <input
              type="radio"
              name="scope"
              value={option.value}
              checked={scope === option.value}
              onChange={() => onScopeChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 text-base">
        <input
          type="checkbox"
          checked={requireReservation}
          onChange={(e) => onRequireReservationChange(e.target.checked)}
        />
        Лише вакансії з бронюванням від мобілізації
      </label>
    </div>
  );
}
```

**Step 2: Verify**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/search-params-fields.tsx
git commit -m "Add shared CV/scope/reservation fields component"
```

---

### Task 11: `SearchModal` — run a search, then optionally suggest scheduling it

**Files:**
- Create: `src/components/search-modal.tsx`

**Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";
import { SearchParamsFields, type Scope } from "@/components/search-params-fields";
import { createScheduledSearch, setHideScheduleSuggestion } from "@/app/settings/schedule-actions";
import type { ScheduleInterval } from "@/lib/scheduling";

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "done"; found: number; created: number }
  | { type: "error"; message: string }
  | { type: "ping" };

type Stage = "config" | "running" | "schedule-suggest" | "done" | "error";

const INTERVAL_OPTIONS: { value: ScheduleInterval; label: string }[] = [
  { value: "DAILY", label: "Щодня" },
  { value: "EVERY_3_DAYS", label: "Кожні 3 дні" },
  { value: "WEEKLY", label: "Щотижня" },
  { value: "MONTHLY", label: "Щомісяця" },
];

export function SearchModal({
  cvProfiles,
  defaultCvProfileId,
  triggerLabel,
  triggerClassName,
  hideScheduleSuggestion,
}: {
  cvProfiles: { id: string; label: string }[];
  defaultCvProfileId: string; // "all" or a CV id
  triggerLabel: string;
  triggerClassName?: string;
  hideScheduleSuggestion: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("config");
  const [cvProfileId, setCvProfileId] = useState(defaultCvProfileId);
  const [scope, setScope] = useState<Scope>("BOTH");
  const [requireReservation, setRequireReservation] = useState(false);
  const [status, setStatus] = useState("Запускаю…");
  const [result, setResult] = useState<{ found: number; created: number } | "unknown" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setIntervalValue] = useState<ScheduleInterval>("DAILY");
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const router = useRouter();

  function openModal() {
    setStage("config");
    setCvProfileId(defaultCvProfileId);
    setScope("BOTH");
    setRequireReservation(false);
    setResult(null);
    setError(null);
    setScheduled(false);
    setDontShowAgain(false);
    setOpen(true);
  }

  async function runSearch() {
    setStage("running");
    setStatus("Запускаю…");

    let sawError: string | null = null;
    let sawResult: { found: number; created: number } | "unknown" | null = null;

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvProfileId, scope, requireReservation }),
      });
      if (!response.body) throw new Error("Немає потоку відповіді");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "status") setStatus(event.message);
          else if (event.type === "done") sawResult = { found: event.found, created: event.created };
          else if (event.type === "error") sawError = event.message;
        }
      }

      if (!sawResult && !sawError) sawResult = "unknown";
    } catch (err) {
      sawError = err instanceof Error ? err.message : "Невідома помилка";
    } finally {
      router.refresh();
    }

    if (sawError) {
      setError(sawError);
      setStage("error");
    } else {
      setResult(sawResult);
      setStage(hideScheduleSuggestion ? "done" : "schedule-suggest");
    }
  }

  async function confirmSchedule() {
    const formData = new FormData();
    formData.set("cvProfileId", cvProfileId);
    formData.set("scope", scope);
    formData.set("requireReservation", String(requireReservation));
    formData.set("interval", interval);
    await createScheduledSearch(formData);
    if (dontShowAgain) await setHideScheduleSuggestion(true);
    setScheduled(true);
    setStage("done");
  }

  async function skipSchedule() {
    if (dontShowAgain) await setHideScheduleSuggestion(true);
    setStage("done");
  }

  return (
    <>
      <button type="button" onClick={openModal} className={triggerClassName}>
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg bg-white p-6 text-center dark:bg-zinc-900">
            {stage === "config" && (
              <>
                <h2 className="text-lg font-medium">Пошук вакансій</h2>
                <SearchParamsFields
                  cvProfiles={cvProfiles}
                  cvProfileId={cvProfileId}
                  onCvProfileIdChange={setCvProfileId}
                  scope={scope}
                  onScopeChange={setScope}
                  requireReservation={requireReservation}
                  onRequireReservationChange={setRequireReservation}
                />
                <div className="mt-2 flex w-full justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={runSearch}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Шукати
                  </button>
                </div>
              </>
            )}

            {stage === "running" && (
              <>
                <Spinner className="h-8 w-8 text-zinc-300" />
                <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">{status}</p>
              </>
            )}

            {stage === "schedule-suggest" && (
              <>
                <h2 className="text-lg font-medium">Запланувати автоматичний пошук?</h2>
                <p className="text-base text-zinc-500">
                  Той самий пошук виконуватиметься автоматично з обраною періодичністю.
                </p>
                <fieldset className="flex w-full flex-col gap-1 text-left">
                  {INTERVAL_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-base">
                      <input
                        type="radio"
                        name="interval"
                        value={option.value}
                        checked={interval === option.value}
                        onChange={() => setIntervalValue(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </fieldset>
                <label className="flex items-center gap-2 text-sm text-zinc-500">
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                  />
                  Більше не пропонувати
                </label>
                <div className="mt-2 flex w-full justify-end gap-2">
                  <button
                    type="button"
                    onClick={skipSchedule}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Ні
                  </button>
                  <button
                    type="button"
                    onClick={confirmSchedule}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Так, запланувати
                  </button>
                </div>
              </>
            )}

            {stage === "done" && (
              <>
                <p className="text-lg font-medium text-zinc-100 dark:text-zinc-100">Готово</p>
                <p className="text-base text-zinc-500 dark:text-zinc-400">
                  {result === "unknown"
                    ? "Пошук завершився. Онови сторінку, якщо нових вакансій не видно."
                    : result
                      ? `Знайдено: ${result.found} · Нових: ${result.created}`
                      : null}
                </p>
                {scheduled && <p className="text-sm text-zinc-500">Заплановано.</p>}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Закрити
                </button>
              </>
            )}

            {stage === "error" && (
              <>
                <p className="text-lg font-medium text-red-400">Помилка</p>
                <p className="text-base text-zinc-500 dark:text-zinc-400">{error}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Закрити
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

Note: this intentionally has no "Скасувати" mid-run cancel button (unlike
the old `OtherSearchTrigger`) — closing mid-run is out of scope for this
pass; the modal shows the spinner until the stream ends. If you want a
cancel button, wire an `AbortController` the same way the old component did
and pass its `signal` into the `fetch` call.

**Step 2: Verify**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/search-modal.tsx
git commit -m "Add SearchModal: run a search, then optionally suggest scheduling it"
```

---

### Task 12: `ScheduleModal` — create/edit a scheduled search

**Files:**
- Create: `src/components/schedule-modal.tsx`

This is a controlled dialog (no built-in trigger) used both by a small
"create" wrapper button on Settings (Task 13) and by the scheduled-jobs list
(Task 13) for editing an existing row.

**Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchParamsFields, type Scope } from "@/components/search-params-fields";
import { createScheduledSearch, updateScheduledSearch } from "@/app/settings/schedule-actions";
import type { ScheduleInterval } from "@/lib/scheduling";

const INTERVAL_OPTIONS: { value: ScheduleInterval; label: string }[] = [
  { value: "DAILY", label: "Щодня" },
  { value: "EVERY_3_DAYS", label: "Кожні 3 дні" },
  { value: "WEEKLY", label: "Щотижня" },
  { value: "MONTHLY", label: "Щомісяця" },
];

export type ScheduleModalInitial = {
  id?: string;
  cvProfileId: string; // "all" or a CV id
  scope: Scope;
  requireReservation: boolean;
  interval: ScheduleInterval;
};

export function ScheduleModal({
  open,
  onClose,
  cvProfiles,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  cvProfiles: { id: string; label: string }[];
  initial: ScheduleModalInitial;
}) {
  const [cvProfileId, setCvProfileId] = useState(initial.cvProfileId);
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [requireReservation, setRequireReservation] = useState(initial.requireReservation);
  const [interval, setIntervalValue] = useState<ScheduleInterval>(initial.interval);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  if (!open) return null;

  async function save() {
    setSaving(true);
    const formData = new FormData();
    if (initial.id) formData.set("id", initial.id);
    formData.set("cvProfileId", cvProfileId);
    formData.set("scope", scope);
    formData.set("requireReservation", String(requireReservation));
    formData.set("interval", interval);

    if (initial.id) await updateScheduledSearch(formData);
    else await createScheduledSearch(formData);

    setSaving(false);
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg bg-white p-6 text-center dark:bg-zinc-900">
        <h2 className="text-lg font-medium">
          {initial.id ? "Редагувати заплановий пошук" : "Запланувати автоматичний пошук"}
        </h2>
        <SearchParamsFields
          cvProfiles={cvProfiles}
          cvProfileId={cvProfileId}
          onCvProfileIdChange={setCvProfileId}
          scope={scope}
          onScopeChange={setScope}
          requireReservation={requireReservation}
          onRequireReservationChange={setRequireReservation}
        />
        <fieldset className="flex w-full flex-col gap-1 text-left">
          <legend className="text-sm text-zinc-500">Періодичність</legend>
          {INTERVAL_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-base">
              <input
                type="radio"
                name="interval"
                value={option.value}
                checked={interval === option.value}
                onChange={() => setIntervalValue(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <div className="mt-2 flex w-full justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Скасувати
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-md bg-zinc-900 px-4 py-2 text-base font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {initial.id ? "Зберегти" : "Запланувати"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/schedule-modal.tsx
git commit -m "Add ScheduleModal for creating/editing scheduled searches"
```

---

### Task 13: Header "Заплановані пошуки" button + management list

**Files:**
- Create: `src/components/scheduled-jobs-nav.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/mobile-nav.tsx`

**Step 1: Write the nav component**

It receives the already-fetched list from the server (layout.tsx) as a
prop — no client-side fetch needed, `router.refresh()` after any mutation
re-fetches it via the server component tree.

```tsx
"use client";

import { useState } from "react";
import { ScheduleModal, type ScheduleModalInitial } from "@/components/schedule-modal";
import { toggleScheduledSearchPaused, deleteScheduledSearch } from "@/app/settings/schedule-actions";
import type { Scope } from "@/components/search-params-fields";

const SCOPE_LABELS: Record<Scope, string> = {
  DOU: "DOU",
  DJINNI: "Djinni",
  BOTH: "DOU + Djinni",
  EVERYWHERE: "По всьому інтернету",
};

const INTERVAL_LABELS: Record<string, string> = {
  DAILY: "Щодня",
  EVERY_3_DAYS: "Кожні 3 дні",
  WEEKLY: "Щотижня",
  MONTHLY: "Щомісяця",
};

export type ScheduledJob = {
  id: string;
  cvProfileId: string | null;
  cvProfileLabel: string | null;
  scope: Scope;
  requireReservation: boolean;
  interval: "DAILY" | "EVERY_3_DAYS" | "WEEKLY" | "MONTHLY";
  paused: boolean;
  nextRunAt: string; // ISO
};

export function ScheduledJobsNav({
  jobs,
  cvProfiles,
  className,
}: {
  jobs: ScheduledJob[];
  cvProfiles: { id: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledJob | null>(null);

  function editInitial(job: ScheduledJob): ScheduleModalInitial {
    return {
      id: job.id,
      cvProfileId: job.cvProfileId ?? "all",
      scope: job.scope,
      requireReservation: job.requireReservation,
      interval: job.interval,
    };
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
        }
      >
        Заплановані пошуки{jobs.length > 0 ? ` (${jobs.length})` : ""}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Заплановані пошуки</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Закрити
              </button>
            </div>

            {jobs.length === 0 ? (
              <p className="text-base text-zinc-500">Ще немає запланованих пошуків.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 text-base dark:border-zinc-800"
                  >
                    <div>
                      <div className="font-medium">{job.cvProfileLabel ?? "Всі CV"}</div>
                      <div className="text-sm text-zinc-500">
                        {SCOPE_LABELS[job.scope]} · {INTERVAL_LABELS[job.interval]}
                        {job.requireReservation && " · лише з бронюванням"}
                        {job.paused && " · на паузі"}
                      </div>
                      <div className="text-sm text-zinc-500">
                        Наступний запуск: {new Date(job.nextRunAt).toLocaleDateString("uk-UA")}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEditing(job)}
                        className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                      >
                        Редагувати
                      </button>
                      <form
                        action={async (formData) => {
                          await toggleScheduledSearchPaused(formData);
                        }}
                      >
                        <input type="hidden" name="id" value={job.id} />
                        <input type="hidden" name="nextPaused" value={(!job.paused).toString()} />
                        <button type="submit" className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                          {job.paused ? "Відновити" : "Пауза"}
                        </button>
                      </form>
                      <form
                        action={async (formData) => {
                          await deleteScheduledSearch(formData);
                        }}
                      >
                        <input type="hidden" name="id" value={job.id} />
                        <button type="submit" className="text-sm text-red-500 underline hover:text-red-700 dark:hover:text-red-400">
                          Видалити
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {editing && (
        <ScheduleModal
          open={!!editing}
          onClose={() => setEditing(null)}
          cvProfiles={cvProfiles}
          initial={editInitial(editing)}
        />
      )}
    </>
  );
}
```

**Step 2: Wire it into `src/app/layout.tsx`**

Add imports and, inside `RootLayout`, fetch the current user's CVs and
scheduled jobs (only when logged in), then render `ScheduledJobsNav` next to
the desktop nav links and pass the same data into `MobileNav`:

```ts
import { prisma } from "@/lib/prisma";
import { ScheduledJobsNav, type ScheduledJob } from "@/components/scheduled-jobs-nav";
```

Inside `RootLayout`, after `const session = await auth();`:

```ts
const cvProfiles = session?.user
  ? await prisma.cvProfile.findMany({
      where: { userId: session.user.id },
      select: { id: true, label: true },
      orderBy: { createdAt: "desc" },
    })
  : [];

const scheduledSearchRows = session?.user
  ? await prisma.scheduledSearch.findMany({
      where: { userId: session.user.id },
      include: { cvProfile: { select: { label: true } } },
      orderBy: { createdAt: "desc" },
    })
  : [];

const scheduledJobs: ScheduledJob[] = scheduledSearchRows.map((row) => ({
  id: row.id,
  cvProfileId: row.cvProfileId,
  cvProfileLabel: row.cvProfile?.label ?? null,
  scope: row.scope,
  requireReservation: row.requireReservation,
  interval: row.interval,
  paused: row.paused,
  nextRunAt: row.nextRunAt.toISOString(),
}));
```

In the desktop nav block (next to `navItems.map(...)`), add:

```tsx
{session?.user && (
  <ScheduledJobsNav jobs={scheduledJobs} cvProfiles={cvProfiles} className="hidden md:inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60" />
)}
```

Place it so it renders on every page regardless of route, per the design —
right after the desktop nav links block and before the account/email block
reads naturally.

**Step 3: Add it to mobile nav**

`MobileNav` (`src/components/mobile-nav.tsx`) needs the same button
available in its dropdown. Extend its props:

```ts
export function MobileNav({
  navItems,
  userEmail,
  logoutAction,
  scheduledJobs,
  cvProfiles,
}: {
  navItems: NavItem[];
  userEmail: string;
  logoutAction: () => void;
  scheduledJobs: ScheduledJob[];
  cvProfiles: { id: string; label: string }[];
}) {
```

Import `ScheduledJobsNav`/`ScheduledJob` and render `<ScheduledJobsNav jobs={scheduledJobs} cvProfiles={cvProfiles} />` inside the dropdown panel (e.g.
right above the `navItems.map` list or below it — matches existing spacing).
Update the `<MobileNav ... />` call site in `layout.tsx` to pass
`scheduledJobs={scheduledJobs}` and `cvProfiles={cvProfiles}`.

**Step 4: Verify**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/components/scheduled-jobs-nav.tsx src/app/layout.tsx src/components/mobile-nav.tsx
git commit -m "Add always-visible scheduled-jobs button to header and mobile nav"
```

---

### Task 14: Rewrite the Settings page

**Files:**
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/settings/actions.ts`

**Step 1: Trim `src/app/settings/actions.ts`**

Remove `addSearchConfig`, `toggleSearchConfig`, `deleteSearchConfig`,
`toggleOtherMode`, and the `MANAGED_SOURCES` constant, and the now-unused
`DEFENSE_KEYWORDS` import. Keep `uploadCvProfile` (already updated in Task
2) and `deleteCvProfile` as-is.

**Step 2: Rewrite `src/app/settings/page.tsx`**

Structure:
- Fetch `cvProfiles` (drop the `searchConfigs` include — that relation no
  longer exists) and the current user's `hideScheduleSuggestion`:
  ```ts
  const cvProfiles = await prisma.cvProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { hideScheduleSuggestion: true },
  });
  ```
- Header row: replace `RunTaskButton` with
  ```tsx
  <SearchModal
    cvProfiles={cvProfiles.map((p) => ({ id: p.id, label: p.label }))}
    defaultCvProfileId="all"
    triggerLabel="Шукати вакансії"
    triggerClassName="rounded-md bg-zinc-900 px-3 py-1.5 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
    hideScheduleSuggestion={user.hideScheduleSuggestion}
  />
  <CreateScheduleButton cvProfiles={cvProfiles.map((p) => ({ id: p.id, label: p.label }))} />
  ```
  (see Step 3 for `CreateScheduleButton`, a tiny wrapper).
- Each CV card: replace the `otherModeEnabled` toggle form, the
  `OtherSearchTrigger`, the keyword-add `<form action={addSearchConfig}>`
  with its `SourceCheckboxes`/`ReservationCheckbox`, and the
  `searchConfigs.map(...)` list — with just:
  ```tsx
  <SearchModal
    cvProfiles={cvProfiles.map((p) => ({ id: p.id, label: p.label }))}
    defaultCvProfileId={profile.id}
    triggerLabel="Шукати для цього CV"
    triggerClassName="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
    hideScheduleSuggestion={user.hideScheduleSuggestion}
  />
  ```
  next to the existing "Видалити CV" button. Also render
  `profile.searchTerms.join(", ")` somewhere in the card (small `text-sm
  text-zinc-500` line) so the user can see what terms were extracted from
  their CV — replaces the deleted keyword-list UI with visibility into the
  new auto-extracted one.
- Delete unused imports (`RunTaskButton`, `OtherSearchTrigger`,
  `SourceCheckboxes`, `ReservationCheckbox`, `addSearchConfig`,
  `toggleSearchConfig`, `deleteSearchConfig`, `toggleOtherMode`); add
  imports for `SearchModal` and `CreateScheduleButton`.

**Step 3: Add the small `CreateScheduleButton` wrapper**

New file `src/components/create-schedule-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ScheduleModal } from "@/components/schedule-modal";

export function CreateScheduleButton({
  cvProfiles,
  className,
}: {
  cvProfiles: { id: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-md border border-zinc-300 px-3 py-1.5 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        }
      >
        Запланувати автоматичне виконання
      </button>
      {open && (
        <ScheduleModal
          open={open}
          onClose={() => setOpen(false)}
          cvProfiles={cvProfiles}
          initial={{ cvProfileId: "all", scope: "BOTH", requireReservation: false, interval: "DAILY" }}
        />
      )}
    </>
  );
}
```

**Step 4: Verify**

```bash
npx tsc --noEmit
npm run lint
```

Both should be clean now except for `src/app/vacancies/page.tsx` (Task 15).

**Step 5: Commit**

```bash
git add src/app/settings/page.tsx src/app/settings/actions.ts src/components/create-schedule-button.tsx
git commit -m "Rewrite Settings page around SearchModal and scheduling"
```

---

### Task 15: Clean up the Vacancies page

**Files:**
- Modify: `src/app/vacancies/page.tsx:37-99`

**Step 1: Update the query and grouping**

Replace the `cvProfiles` query's nested include — `searchConfigs` no longer
exists, `discoveries` hangs directly off `cvProfile` now:

```ts
const cvProfiles = await prisma.cvProfile.findMany({
  where: { userId },
  orderBy: { createdAt: "desc" },
  include: {
    discoveries: { include: { vacancy: true } },
    matches: true,
  },
});
```

Replace the `groups = cvProfiles.map(...)` body's vacancy-collection loop —
drop the `for (const config of profile.searchConfigs) { if (!config.active) continue; ... }`
indirection entirely, since there's no more per-config `active` flag to hide
behind:

```ts
const groups = cvProfiles.map((profile) => {
  const vacancyById = new Map<string, Vacancy>();
  for (const discovery of profile.discoveries) {
    vacancyById.set(discovery.vacancy.id, discovery.vacancy);
  }
  // ...rest of the function (scoreByVacancyId, matchIdByVacancyId,
  // hiddenVacancyIds, sorting, pagination) is unchanged.
```

Everything below that (score maps, hidden-vacancy filtering by match
status/score, sorting, pagination) stays exactly as it is today — it never
depended on `SearchConfig`.

**Step 2: Verify**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

All three should be clean now — this is the last file referencing the old
shape.

**Step 3: Commit**

```bash
git add src/app/vacancies/page.tsx
git commit -m "Simplify vacancies query for the direct VacancyDiscovery link"
```

---

### Task 16: Delete obsolete files

**Files:**
- Delete: `src/lib/defense-keywords.ts`
- Delete: `src/components/other-search-overlay.tsx`
- Delete: `src/components/source-checkboxes.tsx`
- Delete: `src/components/run-task-button.tsx`
- Delete: `src/components/task-status.tsx`
- Modify: `src/app/layout.tsx` (remove `TaskStatusProvider`)

**Step 1: Confirm nothing still imports them**

```bash
grep -rn "defense-keywords\|other-search-overlay\|source-checkboxes\|run-task-button\|task-status" src --include="*.ts" --include="*.tsx"
```

Expect only the `import { TaskStatusProvider } from "@/components/task-status"` lines in `layout.tsx` (removed in Step 3 below) — everything
else should already be gone from Tasks 4–14. If anything else shows up,
stop and fix that reference first instead of deleting its target.

**Step 2: Delete the files**

```bash
rm src/lib/defense-keywords.ts
rm src/components/other-search-overlay.tsx
rm src/components/source-checkboxes.tsx
rm src/components/run-task-button.tsx
rm src/components/task-status.tsx
```

**Step 3: Remove `TaskStatusProvider` from `src/app/layout.tsx`**

It was only ever used by `RunTaskButton` (confirmed earlier in this
session's investigation — no other component reads `useTaskStatus`). Remove
the import and unwrap the `<TaskStatusProvider>...</TaskStatusProvider>`
tags around `<main>`, leaving `<main>` as a direct child of the layout's
JSX where the provider used to wrap it.

**Step 4: Verify**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add -A
git commit -m "Remove obsolete SearchConfig-era files and TaskStatusProvider"
```

---

### Task 17: Manual QA pass

No test framework exists, so this is the real verification step. Start the
dev server and, per project convention, exercise the actual UI in a
browser rather than just trusting the build:

```bash
npm run dev
```

Checklist:
1. **Upload a CV** → confirm `searchTerms` populate (visible on the new
   Settings card line from Task 14) without a manual keyword step.
2. **Top-level "Шукати вакансії" button** → open modal, pick a single CV,
   scope = "Тільки DOU", leave reservation off → run → confirm the status
   line updates through DOU scanning, then explicitly shows something like
   "Оцінюю відповідність…" before "Готово" — the scoring loader must be
   visible, not skipped.
3. **Run it again immediately** with the same CV/scope → confirm the
   vacancy count on `/vacancies` does not drop and no duplicates appear
   (same vacancies, not doubled).
4. **Per-CV button** on a specific CV card → confirm it defaults to that CV
   but the dropdown can still be changed to "Всі" or another CV.
5. **"Всі" scope run across multiple CVs** (if more than one CV exists) →
   confirm each CV's status messages appear in sequence, and that one CV's
   simulated failure (e.g. temporarily break a query) doesn't stop the
   others from being scored — check via `/vacancies` that unaffected CVs
   still got new matches.
6. **Reservation toggle on** → spot-check that DOU/Djinni results plausibly
   mention "бронювання" and the "everywhere" prompt still functions with it
   on and off.
7. **Schedule suggestion** appears after a successful search (until you
   check "Більше не пропонувати") → confirm checking it and choosing "Ні"
   still prevents future prompts (verify no follow-up appears on the next
   run).
8. **Standalone "Запланувати автоматичне виконання"** on Settings → create a
   job, confirm it appears in the header "Заплановані пошуки" button/badge
   count.
9. **Scheduled-jobs modal** → edit a job (change interval), pause it,
   confirm the paused badge shows, then delete it.
10. **Cron evaluator locally**:
    ```bash
    curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-scan
    ```
    Manually set a `ScheduledSearch.nextRunAt` to the past first (via
    `npx prisma studio` or a one-off query) to confirm it actually gets
    picked up, runs, and its `nextRunAt`/`lastRunAt` update afterward.
11. **`/vacancies`** → confirm nothing from before this rewrite disappeared
    (old vacancies still listed), and that a vacancy discovered by two
    different CVs' searches shows up correctly under each CV's section.

Report back with pass/fail per item — do not consider this feature done
without walking this checklist for real, per this project's own standard
for UI changes.

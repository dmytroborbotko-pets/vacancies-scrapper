import type { SearchScope } from "@/generated/prisma/client";

// Deliberately a plain module with NO `use client` / `use server` directive.
//
// This is standard React Server Components client-boundary semantics: every
// export of a `use client` module is replaced with a client-reference stub
// whenever that module is imported into server-only code (a Route Handler, a
// `use server` action) — not just when it's used as a JSX prop. A Server
// Component passing such an export through JSX props to a Client Component
// still works, because the RSC flight protocol knows how to serialize a
// client reference back into the real value on the client. But a plain
// imperative import (`import { X } from "...use-client-file"`) in a Route
// Handler or Server Action receives the raw stub object (observed at runtime
// as `[Function (anonymous)]`) instead of the real value, so `x === X` is
// always false there.
//
// The constants below are consumed from both client components and
// server-only code (Route Handlers / Server Actions), so they must live in a
// file with no client/server directive at all. Every consumer — client or
// server — should import them from here rather than from a `use client`
// component file.
//
// ALL_CV_PROFILES is compared for equality in both a Route Handler
// (src/app/api/search/route.ts) and a Server Action
// (src/app/settings/schedule-actions.ts).
export const ALL_CV_PROFILES = "all";

// Re-exported as `Scope` so callers don't hand-roll this union themselves
// (that previously drifted out of sync with the Prisma enum). Importing
// straight from the generated client avoids an extra hop through ingest.ts's
// re-export and doesn't depend on that re-export surviving.
export type Scope = SearchScope;

export const SCOPE_LABELS: Record<Scope, string> = {
  DOU: "Тільки DOU",
  DJINNI: "Тільки Djinni",
  BOTH: "DOU + Djinni",
  EVERYWHERE: "По всьому інтернету",
};

// Deliberately a plain module with NO "use client" / "use server" directive.
//
// This Next.js build replaces every export of a "use client" file with a
// client-reference stub whenever that module is imported into server-only
// code (a Route Handler, a "use server" action) — not just when it's used as
// a JSX prop. A Server Component passing such an export through JSX props to
// a Client Component still works, because the RSC flight protocol knows how
// to serialize a client reference back into the real value on the client.
// But a plain imperative import (`import { X } from "...use-client-file"`)
// in a Route Handler or Server Action receives the raw stub object — a
// function, not the value — so `x === X` is always false there.
//
// ALL_CV_PROFILES is compared for equality in both a Route Handler
// (src/app/api/search/route.ts) and a Server Action
// (src/app/settings/schedule-actions.ts), so it must live in a file with no
// client/server directive at all, and every consumer — client or server —
// should import it from here rather than from search-params-fields.tsx.
export const ALL_CV_PROFILES = "all";

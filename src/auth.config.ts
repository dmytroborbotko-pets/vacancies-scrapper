import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no providers (those need bcrypt + Prisma, which need
// the Node runtime) — imported by both middleware (edge) and auth.ts
// (Node), per Auth.js v5's recommended split.
export default {
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      // Vercel Cron authenticates via its own CRON_SECRET header, not a
      // user session — never gate it behind login.
      if (pathname.startsWith("/api/cron")) return true;

      const isAuthPage =
        pathname.startsWith("/login") || pathname.startsWith("/register");
      if (isAuthPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;

/**
 * Path: apps/landing/src/app/page.tsx
 * Purpose: Landing page STUB (Phase 11 delivers the real page + docs MDX +
 *          Vercel deploy). Brand statement only.
 * Dependencies: none
 */
export default function Page(): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <span aria-hidden className="h-10 w-10 rounded-lg bg-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.5)]" />
      <h1 className="text-4xl font-semibold tracking-tight">
        Tagent Office
      </h1>
      <p className="max-w-md text-zinc-400">
        Your AI team, in your browser. Manager plans, workers build, QA checks — you steer.
      </p>
      <p className="text-xs text-zinc-600">
        Self-hosted · MIT · landing page ships in Phase 11 — repo: github.com/asysurya/tagent-office
      </p>
    </main>
  );
}

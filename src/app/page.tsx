import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booth Under Construction",
};

export default function Home() {
  return (
    <div className="theme-ledgerai flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <main className="max-w-xl">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
          L
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          LedgerAI
        </h1>
        <p className="mt-3 text-muted">
          Financial intelligence for small businesses. Landing experience
          arriving in an upcoming phase.
        </p>
      </main>
    </div>
  );
}

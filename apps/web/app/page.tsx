export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-bold">BisnisMu</h1>
      <p className="max-w-md text-neutral-600">
        POS universal untuk UMKM Indonesia — retail, F&amp;B, jasa, dan grosir dalam satu sistem.
      </p>
      <p className="text-sm text-neutral-400">
        Frontend belum terhubung ke API. Backend berjalan di{" "}
        <code className="rounded bg-neutral-200 px-1.5 py-0.5">
          {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}
        </code>
        .
      </p>
    </main>
  );
}

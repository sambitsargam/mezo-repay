import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-3xl text-ink">Page not found</h1>
      <p className="mt-2 text-ink-muted">That page doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary mt-6">Back to home</Link>
    </main>
  );
}

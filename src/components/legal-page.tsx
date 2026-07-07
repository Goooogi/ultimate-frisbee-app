// Shared prose wrapper for the legal pages (/terms, /privacy).
// Server component — plain typography over site tokens, no interactivity.

import { AppRail } from '@/components/app-rail';
import { SiteFooter } from '@/components/site-footer';
import type { ReactNode } from 'react';

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <AppRail />
      <main className="flex-1 px-5 lg:px-12 py-8 lg:py-12">
        <article className="max-w-[720px] mx-auto">
          <header className="mb-8">
            <h1 className="font-display italic font-bold text-[32px] lg:text-[40px] leading-[0.95] tracking-[-0.03em] text-ink">
              {title}
            </h1>
            <p className="mt-3 text-[12px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
              Last updated: {lastUpdated}
            </p>
          </header>
          <div className="legal-prose flex flex-col gap-5 text-[14px] leading-relaxed text-muted">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Numbered section with a consistent heading treatment. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[15px] font-bold text-ink font-tight tracking-[-0.01em] mt-3">
        {heading}
      </h2>
      {children}
    </section>
  );
}

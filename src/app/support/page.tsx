// /support — Support / contact page. Static prose, server component.
//
// This is the public support URL required by the App Store and Google Play
// listings. Keep the contact email current — store review checks it works.

import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Support · The Layout',
  description: 'Get help with The Layout — contact, account questions, and common fixes.',
};

const CONTACT_EMAIL = 'support@thelayout.app';

export default function SupportPage() {
  return (
    <LegalPage title="Support" lastUpdated="August 7, 2026">
      <p>
        Need a hand with The Layout? The fastest way to reach us is email — we read everything
        and typically respond within a couple of business days.
      </p>

      <LegalSection heading="Contact us">
        <p>
          Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>{' '}
          with as much detail as you can: what you were doing, what you expected, and what
          happened instead. Screenshots help. If it&rsquo;s account-related, send the email from
          the address on your account so we can verify it&rsquo;s you.
        </p>
      </LegalSection>

      <LegalSection heading="Common questions">
        <p>
          <strong className="text-ink">Signing in.</strong> The mobile app and thelayout.app use
          the same account. If you signed up with Apple or Google, use that same button each
          time — it links to one account. Forgot your password? Use the reset link on the
          sign-in screen.
        </p>
        <p>
          <strong className="text-ink">Scores look stale.</strong> Live scores sync on game days
          (Thursday, Friday, and Sunday). Pull to refresh in the app; if a specific game stays
          wrong, email us the matchup and we&rsquo;ll look at the feed.
        </p>
        <p>
          <strong className="text-ink">Wrong or missing player data.</strong> Rosters and stats
          come from public league sources. If something about you is inaccurate, email us and
          we&rsquo;ll correct it.
        </p>
        <p>
          <strong className="text-ink">Deleting your account.</strong> You can delete your
          account in the app (Settings &rarr; Delete account) or from the web — see{' '}
          <Link href="/delete-account" className="text-ink underline underline-offset-2">
            Delete your account
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Policies">
        <p>
          <Link href="/privacy" className="text-ink underline underline-offset-2">
            Privacy Policy
          </Link>{' '}
          &middot;{' '}
          <Link href="/terms" className="text-ink underline underline-offset-2">
            Terms &amp; Conditions
          </Link>{' '}
          &middot;{' '}
          <Link href="/delete-account" className="text-ink underline underline-offset-2">
            Account &amp; data deletion
          </Link>
        </p>
      </LegalSection>
    </LegalPage>
  );
}

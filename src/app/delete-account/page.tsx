// /delete-account — account & data deletion. Static prose, server component.
//
// Google Play requires a web URL where users can request account deletion
// WITHOUT the app installed (in addition to the in-app Settings flow). This
// page is that URL — enter it in Play Console's Data Safety form. Apple's
// listing links here too via /support.

import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Delete Your Account · The Layout',
  description: 'How to delete your The Layout account and data, in the app or by request.',
};

const CONTACT_EMAIL = 'support@thelayout.app';

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete Your Account" lastUpdated="August 7, 2026">
      <p>
        You can delete your The Layout account at any time. Deletion is permanent — it removes
        your profile and the content tied to your account, and it cannot be undone.
      </p>

      <LegalSection heading="Delete in the app">
        <p>
          Open the app and go to <strong className="text-ink">Settings &rarr; Delete
          account</strong>. Confirm, and your account and associated data are deleted
          immediately. If you own a Playbook team, you&rsquo;ll be asked to transfer ownership
          first so your teammates don&rsquo;t lose their plays.
        </p>
      </LegalSection>

      <LegalSection heading="Delete without the app">
        <p>
          Don&rsquo;t have the app installed? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>{' '}
          with the subject &ldquo;Delete my account&rdquo; from the email address on your
          account. We verify the request against that address and complete the deletion within
          30 days, then confirm by reply.
        </p>
      </LegalSection>

      <LegalSection heading="What gets deleted">
        <p>
          Your account credentials, profile (display name, handle, avatar), fantasy rosters and
          entries, favorites, and any Playbook content you solely own. Data we&rsquo;re required
          to keep for legal or security reasons may be retained in de-identified form, as
          described in our{' '}
          <Link href="/privacy" className="text-ink underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          Public sports statistics (game results, rosters, and stats published by leagues) are
          not part of your account and are unaffected by account deletion.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

// /privacy — Privacy Policy. Static prose, server component.
//
// ⚠️ DRAFT LEGAL COPY — written in-house, tailored to the site's actual data
// practices (Supabase auth/storage, Resend transactional email, no ads, no
// sale of data, public sports statistics). Have a licensed attorney review
// before treating this as final.

import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy · The Layout',
  description: 'How The Layout collects, uses, and protects your information.',
};

const CONTACT_EMAIL = 'invites@thelayout.app';

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="July 6, 2026">
      <p>
        This Privacy Policy explains how The Layout (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;) collects, uses, and shares information when you use thelayout.app and
        its related features (the &ldquo;Service&rdquo;). It should be read together with our{' '}
        <Link href="/terms" className="text-ink underline underline-offset-2">
          Terms &amp; Conditions
        </Link>
        .
      </p>

      <LegalSection heading="1. Information We Collect">
        <p>
          <strong className="text-ink">Account information.</strong> When you create an account
          we collect your email address and authentication credentials. Passwords are handled by
          our authentication provider and stored only in hashed form — we never see or store
          your plain-text password.
        </p>
        <p>
          <strong className="text-ink">Content you provide.</strong> Playbook plays, Fantasy
          teams and entries, and any media (images, video, links) you submit for player pages.
          Player-media submissions are reviewed by a moderator before they are shown publicly.
        </p>
        <p>
          <strong className="text-ink">Automatically collected information.</strong> Like most
          websites, our infrastructure logs technical data such as IP address, browser and
          device type, pages requested, and timestamps, used for security, debugging, and
          capacity planning.
        </p>
        <p>
          <strong className="text-ink">Stored on your device.</strong> We use browser storage for
          your session (so you stay signed in) and your theme preference. We do not use
          third-party advertising cookies or cross-site trackers.
        </p>
      </LegalSection>

      <LegalSection heading="2. Public Sports Data">
        <p>
          The Service displays names, rosters, statistics, and results of players and teams in
          organized ultimate frisbee competitions. This information is drawn from publicly
          available league and event sources and is presented as a record of public sporting
          competition. If you are a player and have a concern about information shown about you
          — including corrections or removal requests — contact us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>{' '}
          and we will review it promptly.
        </p>
      </LegalSection>

      <LegalSection heading="3. How We Use Information">
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>to provide, maintain, and improve the Service and its features;</li>
          <li>to authenticate you and keep your account secure;</li>
          <li>to review and moderate submitted content;</li>
          <li>
            to send transactional email (for example, sign-in, invitations, and account
            notices) — we do not send marketing email without your consent;
          </li>
          <li>to monitor for abuse, fraud, and technical issues; and</li>
          <li>to comply with legal obligations.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. How We Share Information">
        <p>
          <strong className="text-ink">We do not sell your personal information</strong>, and we
          do not share it for cross-context behavioral advertising. We share information only
          with:
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>
            <strong className="text-ink">Service providers</strong> that process data on our
            behalf under contractual safeguards — currently our database, authentication, and
            file-storage provider (Supabase), our hosting/CDN infrastructure, and our
            transactional email provider (Resend);
          </li>
          <li>
            <strong className="text-ink">Other users / the public</strong>, for content that is
            public by design (for example, your Fantasy team name on the leaderboard, or
            approved player media);
          </li>
          <li>
            <strong className="text-ink">Authorities</strong>, if required by law or to protect
            the rights, safety, or property of the Service, our users, or the public; and
          </li>
          <li>
            <strong className="text-ink">A successor</strong>, in connection with a merger,
            acquisition, or sale of assets, in which case this Policy continues to apply to your
            information.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Data Retention">
        <p>
          We keep account information and your content for as long as your account exists.
          Technical logs are retained for a limited period appropriate to security and
          operations. When you delete your account (or ask us to), we delete or de-identify your
          personal information within a reasonable period, except where retention is required by
          law or for legitimate security purposes.
        </p>
      </LegalSection>

      <LegalSection heading="6. Security">
        <p>
          We use industry-standard safeguards — encrypted connections (HTTPS), hashed
          credentials, row-level access controls on our database, and least-privilege access to
          production systems. No method of transmission or storage is 100% secure, so we cannot
          guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your Rights &amp; Choices">
        <p>
          Depending on where you live, you may have rights to access, correct, delete, or
          receive a copy of your personal information, and to object to or restrict certain
          processing. You can exercise these rights — including full account deletion — by
          emailing{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          . We will not discriminate against you for exercising any privacy right.
        </p>
      </LegalSection>

      <LegalSection heading="8. Children">
        <p>
          The Service is not directed to children under 13, and we do not knowingly collect
          personal information from them. If you believe a child under 13 has provided us
          personal information, contact us and we will delete it. (Names and statistics of
          minors that appear in public league records — for example, youth division results —
          are public sporting records published by the leagues; see Section 2 for correction and
          removal requests.)
        </p>
      </LegalSection>

      <LegalSection heading="9. International Users">
        <p>
          The Service is operated from the United States, and information is processed and
          stored there. If you use the Service from outside the U.S., you understand your
          information will be transferred to and processed in the U.S.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to This Policy">
        <p>
          We may update this Policy from time to time. We will update the &ldquo;Last
          updated&rdquo; date above and, for material changes, provide additional notice on the
          Service. Continued use after changes take effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Privacy questions or requests:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}

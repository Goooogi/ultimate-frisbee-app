// /terms — Terms & Conditions. Static prose, server component.
//
// ⚠️ DRAFT LEGAL COPY — written in-house, tailored to what the site actually
// does (league data aggregation, accounts, playbook/fantasy content, media
// uploads with moderation). Have a licensed attorney review before treating
// this as final, and set the governing-law state in §16.

import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Terms & Conditions · The Layout',
  description: 'The terms that govern your use of The Layout.',
};

const CONTACT_EMAIL = 'invites@thelayout.app';

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" lastUpdated="July 6, 2026">
      <p>
        These Terms &amp; Conditions (the &ldquo;Terms&rdquo;) govern your access to and use of
        thelayout.app and its related pages, features, and applications (collectively, the
        &ldquo;Service&rdquo;), operated by The Layout (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;). By accessing or using the Service, you agree to be bound by these
        Terms and by our <Link href="/privacy" className="text-ink underline underline-offset-2">Privacy Policy</Link>.
        If you do not agree, do not use the Service.
      </p>

      <LegalSection heading="1. Eligibility">
        <p>
          You must be at least 13 years old to use the Service. If you are under the age of
          majority where you live, you may use the Service only with the consent of a parent or
          legal guardian who agrees to these Terms on your behalf.
        </p>
      </LegalSection>

      <LegalSection heading="2. What the Service Is — and Isn't">
        <p>
          The Layout aggregates and displays scores, schedules, standings, rosters, and
          statistics for professional and organized ultimate frisbee, drawn from publicly
          available sources, together with tools such as the Playbook, the 12-0 game, and
          Fantasy.
        </p>
        <p>
          <strong className="text-ink">The Layout is an independent product.</strong> We are not
          affiliated with, sponsored by, or endorsed by the Ultimate Frisbee Association (UFA),
          USA Ultimate (USAU), the Premier Ultimate League (PUL), the Western Ultimate League
          (WUL), the World Flying Disc Federation (WFDF), or any team or event organizer whose
          information appears on the Service. League, team, and event names and logos are the
          property of their respective owners and are used solely to identify the competitions
          and teams they refer to.
        </p>
      </LegalSection>

      <LegalSection heading="3. Accuracy of Sports Data">
        <p>
          Scores, schedules, statistics, rosters, rankings, and derived ratings are aggregated
          from third-party sources, may lag live play, and may contain errors or omissions. They
          are provided for informational and entertainment purposes only. Do not rely on the
          Service for wagering or for any purpose that requires certified or official records —
          official records belong to the leagues themselves.
        </p>
      </LegalSection>

      <LegalSection heading="4. Accounts">
        <p>
          Some features (for example, saving Playbook plays or creating a Fantasy team) require
          an account. You agree to provide accurate information, keep your credentials secure,
          and accept responsibility for activity under your account. We may suspend or terminate
          accounts that violate these Terms, at our discretion, with or without notice.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your Content">
        <p>
          You may be able to submit content to the Service — Playbook plays, Fantasy entries,
          and player media such as images, video, and links (&ldquo;User Content&rdquo;). You
          retain ownership of your User Content. By submitting it, you grant us a worldwide,
          non-exclusive, royalty-free license to host, store, reproduce, adapt (for technical
          display purposes), and display that content in connection with operating and promoting
          the Service.
        </p>
        <p>
          You represent that you own or have the necessary rights to everything you submit, and
          that it does not infringe anyone&rsquo;s intellectual-property, privacy, or publicity
          rights. Content must not be unlawful, defamatory, harassing, hateful, sexually
          explicit, or misleading. Player-media submissions are reviewed before public display,
          and we may remove or decline any User Content at any time for any reason.
        </p>
      </LegalSection>

      <LegalSection heading="6. Copyright Complaints (DMCA)">
        <p>
          If you believe content on the Service infringes your copyright, send a notice to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>{' '}
          including: (a) identification of the work claimed to be infringed; (b) the URL or
          location of the allegedly infringing material; (c) your contact information; (d) a
          statement of good-faith belief that the use is unauthorized; and (e) a statement,
          under penalty of perjury, that the information in your notice is accurate and that you
          are the owner or authorized to act for the owner. We will respond to valid notices,
          including removing material where appropriate, and may terminate repeat infringers.
        </p>
      </LegalSection>

      <LegalSection heading="7. Fantasy, 12-0 &amp; Other Games">
        <p>
          Fantasy, 12-0, and any similar features are free games offered for entertainment
          only. They involve no entry fee, no wagering, and no prizes of monetary value.
          Scoring rules, ratings, records, and leaderboards are ours to define and may be
          adjusted, recalculated, or reset at any time, including retroactively (for example,
          when upstream statistics are corrected).
        </p>
      </LegalSection>

      <LegalSection heading="8. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>use the Service for any unlawful purpose or in violation of these Terms;</li>
          <li>
            access the Service by automated means (scraping, crawling, bulk downloading) beyond
            ordinary personal use of the site and its pages;
          </li>
          <li>
            interfere with or disrupt the Service, probe or circumvent its security or access
            controls, or burden its infrastructure;
          </li>
          <li>impersonate any person, team, or league, or misrepresent an affiliation; or</li>
          <li>resell, sublicense, or commercially redistribute the Service or its data.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="9. Our Intellectual Property">
        <p>
          The Service&rsquo;s software, design, branding, and original content (excluding User
          Content and third-party materials) are owned by us or our licensors and are protected
          by law. If you send us feedback or suggestions, you grant us a perpetual, irrevocable,
          royalty-free right to use them without obligation to you.
        </p>
      </LegalSection>

      <LegalSection heading="10. Third-Party Links &amp; Services">
        <p>
          The Service links to third-party sites and services (for example, league websites,
          streaming providers, and social platforms). We are not responsible for their content
          or practices; your use of them is governed by their own terms.
        </p>
      </LegalSection>

      <LegalSection heading="11. Disclaimer of Warranties">
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT
          WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT. WE DO NOT WARRANT
          THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT DATA DISPLAYED WILL BE
          ACCURATE OR COMPLETE.
        </p>
      </LegalSection>

      <LegalSection heading="12. Limitation of Liability">
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, WE WILL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA,
          OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL AGGREGATE
          LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF FIFTY
          U.S. DOLLARS (US$50) OR THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS
          BEFORE THE CLAIM AROSE. SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS, SO SOME
          OF THE ABOVE MAY NOT APPLY TO YOU.
        </p>
      </LegalSection>

      <LegalSection heading="13. Indemnification">
        <p>
          You agree to indemnify and hold us harmless from claims, damages, and expenses
          (including reasonable attorneys&rsquo; fees) arising from your User Content, your use
          of the Service, or your violation of these Terms or of any third party&rsquo;s rights.
        </p>
      </LegalSection>

      <LegalSection heading="14. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate your access at
          any time, with or without cause or notice. Sections that by their nature should
          survive termination (including 5, 6, and 9 through 13) survive.
        </p>
      </LegalSection>

      <LegalSection heading="15. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Material changes will be reflected by
          updating the &ldquo;Last updated&rdquo; date above, and where practical we will
          provide additional notice on the Service. Your continued use after changes take effect
          constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="16. Governing Law">
        <p>
          These Terms are governed by the laws of the State of [STATE], United States, without
          regard to conflict-of-laws principles, and any dispute will be brought exclusively in
          the state or federal courts located in [COUNTY, STATE], except where prohibited by
          applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="17. Miscellaneous">
        <p>
          If any provision of these Terms is found unenforceable, the remainder stays in effect.
          Our failure to enforce a provision is not a waiver. You may not assign these Terms
          without our consent; we may assign them in connection with a merger, acquisition, or
          sale of assets. These Terms, together with the Privacy Policy, are the entire
          agreement between you and us regarding the Service.
        </p>
      </LegalSection>

      <LegalSection heading="18. Contact">
        <p>
          Questions about these Terms:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}

import { redirect } from 'next/navigation';

// The roster now lives inline on the Team landing page (Hunter, 2026-09-09 —
// ported from mobile). Kept as a redirect for old links.
export default function PlaybookRosterPage() {
  redirect('/playbook/teams');
}

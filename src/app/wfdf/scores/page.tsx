// /wfdf/scores — DELETED 2026-08-05 (Hunter): it was a second event grid whose
// cards linked to the same /wfdf/events/[slug] detail pages as /wfdf/events. A
// Worlds event is a fixed bracket rather than a rolling fixture list, so the
// event page already carries both results and schedule. Kept as a redirect so
// old links and the mobile app's nav don't 404 — same treatment as /euf/scores.

import { redirect } from 'next/navigation';

export default function WfdfScoresPage() {
  redirect('/wfdf/events');
}

// /euf/schedule — DELETED 2026-08-05 (Hunter): it showed one event's games
// grouped by day, which /euf/events/[slug] already does (grouped by round, with
// a day split inside each). Kept as a redirect so old links, shared URLs and the
// mobile app's nav don't 404 — same treatment as /euf/scores before it.
//
// The old ?event= param is intentionally dropped: /euf/events is the picker now.

import { redirect } from 'next/navigation';

export default function EufSchedulePage() {
  redirect('/euf/events');
}

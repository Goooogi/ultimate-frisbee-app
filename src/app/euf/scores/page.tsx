// /euf/scores — DELETED 2026-08-04 (Hunter): it listed the same year-grouped
// event cards as /euf/events. Kept as a redirect so old links and the mobile
// app's nav don't 404.

import { redirect } from 'next/navigation';

export default function EufScoresPage() {
  redirect('/euf/events');
}

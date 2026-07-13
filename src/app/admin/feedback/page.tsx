// The feedback inbox was merged into the unified admin page (/admin/content).
// This route is kept only as a redirect so old links/bookmarks don't 404.

import { redirect } from 'next/navigation';

export default function AdminFeedbackRedirect() {
  redirect('/admin/content');
}

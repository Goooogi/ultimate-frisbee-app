// /euf → the events browser is the league's landing page.

import { redirect } from 'next/navigation';

export default function EufIndexPage() {
  redirect('/euf/events');
}

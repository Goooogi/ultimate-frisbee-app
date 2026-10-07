import type { Metadata } from 'next';
import { JoinByCodeClient } from './client';

export const metadata: Metadata = {
  title: 'Join league · Fantasy',
  robots: { index: false, follow: false },
  referrer: 'same-origin',
};

export default function JoinByCodePage({ params }: { params: { code: string } }) {
  return <JoinByCodeClient code={params.code} />;
}

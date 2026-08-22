// WFDF's outbound "view on the source site" link. The markup moved to the
// shared <SourceLink> when USAU adopted the same treatment (2026-08-22); this
// stays as WFDF's named entry point so its three call sites keep their default
// label without repeating it.

import { SourceLink } from '@/components/source-link';

export function WfdfSourceLink({
  href,
  label = 'View on WFDF',
}: {
  href: string | null;
  label?: string;
}) {
  return <SourceLink href={href} label={label} />;
}

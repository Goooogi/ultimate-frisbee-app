// LeagueLogo — the mark for a fantasy league header/row. Web port of the
// mobile app's LeagueLogo.tsx (altiusapps/mobileapp-thelayout ·
// src/components/fantasy/LeagueLogo.tsx). Precedence: a picked team logo/flag
// (logoIcon, resolved via the same avatar-icon resolver the profile picker
// uses) → an uploaded photo (logoUrl) → the game's bundled brand mark
// (logoSrc) → an initials monogram.

import Image from 'next/image';
import { resolveAvatarIcon } from '@/lib/profile/avatar-icon';
import { WfdfFlag } from '@/components/wfdf/wfdf-flag';

interface LeagueLogoProps {
  name: string;
  logoUrl?: string | null;
  logoIcon?: string | null;
  /** Bundled game brand mark (GameDef.logoSrc), e.g. '/UFA-red.png'. */
  logoSrc?: string | null;
  size?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase() || '?';
}

export function LeagueLogo({ name, logoUrl, logoIcon, logoSrc, size = 32 }: LeagueLogoProps) {
  const radius = Math.round(size * 0.28);
  const resolved = logoIcon ? resolveAvatarIcon(logoIcon) : null;

  if (resolved?.kind === 'logo') {
    return (
      <span
        className="inline-flex flex-shrink-0 items-center justify-center bg-white"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- team logo srcs come from mixed static/CDN sources */}
        <img src={resolved.src} alt="" className="object-contain" style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.72) }} />
      </span>
    );
  }

  if (resolved?.kind === 'flag') {
    return (
      <span
        className="inline-flex flex-shrink-0 items-center justify-center bg-ink/[0.04]"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <WfdfFlag countryCode={resolved.countryCode} size={Math.round(size * 0.72)} />
      </span>
    );
  }

  if (resolved?.kind === 'emoji') {
    return (
      <span
        className="inline-flex flex-shrink-0 items-center justify-center bg-ink/[0.04]"
        style={{ width: size, height: size, borderRadius: radius }}
        aria-hidden="true"
      >
        <span style={{ fontSize: Math.round(size * 0.5) }}>{resolved.emoji}</span>
      </span>
    );
  }

  if (logoUrl) {
    return (
      <span
        className="inline-flex flex-shrink-0 overflow-hidden bg-surface-hi"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded URL, not a static asset */}
        <img src={logoUrl} alt="" className="w-full h-full object-cover" />
      </span>
    );
  }

  if (logoSrc) {
    return (
      <span
        className="inline-flex flex-shrink-0 items-center justify-center bg-white"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <Image
          src={logoSrc}
          alt=""
          width={Math.round(size * 0.72)}
          height={Math.round(size * 0.72)}
          className="object-contain"
        />
      </span>
    );
  }

  return (
    <span
      className="inline-flex flex-shrink-0 items-center justify-center bg-accent/[0.12]"
      style={{ width: size, height: size, borderRadius: radius }}
      aria-hidden="true"
    >
      <span
        className="font-display italic font-bold text-accent"
        style={{ fontSize: Math.round(size * 0.38) }}
      >
        {initials(name)}
      </span>
    </span>
  );
}

export default LeagueLogo;

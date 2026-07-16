// Parse a YouTube or Vimeo URL into a normalized embed URL.
// Returns null when the URL isn't from a supported host or can't be parsed —
// the upload UI uses this to validate the link client-side before submit, and
// the player profile / admin queue both use it to render an iframe.
//
// We deliberately keep the surface area tiny (no API calls, no oEmbed) so
// this can run on server or client without extra deps.

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

const VIMEO_HOSTS = new Set([
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
]);

export interface EmbedInfo {
  provider: 'youtube' | 'vimeo';
  /** Iframe-ready URL (https://www.youtube-nocookie.com/embed/{id}). */
  embedUrl: string;
  /** Canonical watch URL. */
  watchUrl: string;
  /** Provider video id. */
  videoId: string;
}

/**
 * Poster/thumbnail image for a video link, so a gallery tile shows a preview
 * frame instead of a black box. Only YouTube exposes a stable no-API thumbnail
 * URL (i.ytimg.com/vi/{id}/hqdefault.jpg — always present for a valid video).
 * Vimeo requires an oEmbed call for its poster, so we return null there and the
 * caller keeps its generic play-badge fallback.
 *
 * hqdefault.jpg (480×360) is the safe universal choice — maxresdefault.jpg only
 * exists for HD uploads and 404s otherwise. Pass the raw external_url (what we
 * store); it's re-parsed so callers don't need the videoId on hand.
 */
export function videoThumbnailUrl(raw: string): string | null {
  const info = parseEmbed(raw);
  if (!info || info.provider !== 'youtube') return null;
  return `https://i.ytimg.com/vi/${info.videoId}/hqdefault.jpg`;
}

export function parseEmbed(raw: string): EmbedInfo | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const id = extractYoutubeId(url);
    if (!id) return null;
    return {
      provider: 'youtube',
      videoId: id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = extractVimeoId(url);
    if (!id) return null;
    return {
      provider: 'vimeo',
      videoId: id,
      embedUrl: `https://player.vimeo.com/video/${id}`,
      watchUrl: `https://vimeo.com/${id}`,
    };
  }

  return null;
}

// YouTube video IDs are exactly 11 chars of [A-Za-z0-9_-]. Validating the shape
// guards against a crafted path segment ending up interpolated into the embed
// URL (defense-in-depth; not exploitable as XSS in an iframe src, but keeps junk
// out of the DB and out of any future non-React rendering context).
function validYoutubeId(id: string | null): string | null {
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function extractYoutubeId(url: URL): string | null {
  if (url.hostname.endsWith('youtu.be')) {
    const id = url.pathname.replace(/^\//, '').split('/')[0];
    return validYoutubeId(id || null);
  }
  if (url.pathname === '/watch') {
    return validYoutubeId(url.searchParams.get('v'));
  }
  // /embed/{id}, /shorts/{id}, /live/{id}
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(segments[0])) {
    return validYoutubeId(segments[1] || null);
  }
  return null;
}

function extractVimeoId(url: URL): string | null {
  // vimeo.com/{id} or vimeo.com/channels/{name}/{id} or player.vimeo.com/video/{id}
  const segments = url.pathname.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(segments[i])) return segments[i];
  }
  return null;
}

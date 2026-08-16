'use server';

// Server actions for fantasy leagues: invite email delivery via Resend +
// cache revalidation after league/contest writes.
//
// Security model mirrors src/app/playbook/teams/actions.ts exactly:
//   1. Authenticate (getUser), then re-verify permission server-side — the
//      caller must be a COMMISSIONER of the target league (an authenticated
//      user must not be able to POST arbitrary { leagueId, email } spam).
//   2. Re-verify the token belongs to this (league, email) and is unexpired.
//   3. Rolling-hour rate limit + per-invite resend cooldown.
//   4. RESEND_API and SEND_EMAIL never appear outside server actions.

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// fantasy_league_* tables aren't in database.types.ts (wul_*/pul_* convention —
// don't regenerate). Same loosened-.from() cast as src/lib/fantasy/server.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = { from: (table: string) => any };

// ─── revalidation ────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bust the public caches for fantasy league pages after a write. Public
 *  'use server' action — only revalidates, reveals/writes nothing. */
export async function revalidateFantasyLeague(leagueId?: string, contestId?: string) {
  revalidatePath('/fantasy');
  revalidatePath('/fantasy/leagues');
  if (leagueId && UUID_RE.test(leagueId)) revalidatePath(`/fantasy/leagues/${leagueId}`);
  if (contestId && UUID_RE.test(contestId)) revalidatePath(`/fantasy/contests/${contestId}`);
}

// ─── invite email ────────────────────────────────────────────────────────────

export interface SendLeagueInviteEmailParams {
  leagueId: string;
  email: string;
  token: string;
}

export interface SendLeagueInviteEmailResult {
  ok: true;
}

const INVITE_RATE_LIMIT_PER_HOUR = 20;
const RESEND_COOLDOWN_MS = 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function assertCommissioner(leagueId: string) {
  const supabase = createClient();
  const db = supabase as unknown as AnyQuery;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: membership, error: memberError } = await db
    .from('fantasy_league_members')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .eq('role', 'commissioner')
    .maybeSingle();
  if (memberError) throw new Error('Could not verify league access.');
  if (!membership) throw new Error('Not authorized');

  const { data: league, error: leagueError } = await supabase
    .from('fantasy_leagues')
    .select('name')
    .eq('id', leagueId)
    .maybeSingle();
  if (leagueError) throw new Error('Could not load league.');
  if (!league) throw new Error('League not found');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    db,
    user,
    leagueName: league.name as string,
    inviterName: (profile?.display_name as string | null) ?? null,
  };
}

function deriveBaseUrl(): string {
  // NEVER trust the incoming Host header for links in outbound email.
  const configured = process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = headers().get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${host}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripNewlines(str: string): string {
  return str.replace(/[\r\n]+/g, ' ');
}

function buildEmailHtml(params: {
  inviterName: string | null;
  leagueName: string;
  acceptUrl: string;
}): string {
  const { inviterName, leagueName, acceptUrl } = params;
  const senderLabel = inviterName ? inviterName : 'A league commissioner';
  const safeUrl = escapeHtml(acceptUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fantasy league invite</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:0 24px;">

          <!-- Wordmark -->
          <tr>
            <td style="padding-bottom:32px;">
              <span style="font-size:18px;font-weight:800;letter-spacing:-0.03em;color:#0d0d0d;">The Layout</span>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding-bottom:16px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#0d0d0d;line-height:1.2;">
                You're invited to the fantasy league<br />${escapeHtml(leagueName)}
              </h1>
            </td>
          </tr>

          <!-- Body copy -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#444444;">
                ${escapeHtml(senderLabel)} invited you to join
                <strong style="color:#0d0d0d;">${escapeHtml(leagueName)}</strong>,
                a fantasy ultimate league on The Layout.
              </p>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#666666;">
                This invite expires in 14 days. Sign in with this email address to accept it.
              </p>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td style="padding-bottom:40px;">
              <a href="${safeUrl}"
                 style="display:inline-block;background:#FF3D00;color:#ffffff;text-decoration:none;
                        font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
                        padding:14px 28px;border-radius:6px;line-height:1;">
                Join the league
              </a>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                Button not working? Copy and paste this link into your browser:<br />
                <a href="${safeUrl}" style="color:#FF3D00;word-break:break-all;">${safeUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer rule -->
          <tr>
            <td style="border-top:1px solid #eeeeee;padding-top:24px;">
              <p style="margin:0;font-size:11px;color:#bbbbbb;line-height:1.5;">
                You received this because someone invited you to a fantasy league on The Layout.
                If you weren't expecting this, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailText(params: {
  inviterName: string | null;
  leagueName: string;
  acceptUrl: string;
}): string {
  const { inviterName, leagueName, acceptUrl } = params;
  const safeLeague = stripNewlines(leagueName);
  const senderLabel = stripNewlines(inviterName ? inviterName : 'A league commissioner');
  return [
    `You're invited to the fantasy league ${safeLeague} on The Layout`,
    '',
    `${senderLabel} invited you to join ${safeLeague}, a fantasy ultimate league on The Layout.`,
    '',
    'Join here:',
    acceptUrl,
    '',
    'This invite expires in 14 days. Sign in with this email address to accept it.',
    '',
    "If you weren't expecting this, you can safely ignore this email.",
  ].join('\n');
}

export async function sendLeagueInviteEmail({
  leagueId,
  email,
  token,
}: SendLeagueInviteEmailParams): Promise<SendLeagueInviteEmailResult> {
  // 1. Env fast-fail.
  if (!process.env.RESEND_API || !process.env.SEND_EMAIL) {
    throw new Error('Email not configured (missing RESEND_API or SEND_EMAIL env vars).');
  }

  // 2. Validate input.
  if (!EMAIL_RE.test(email)) throw new Error('Invalid email address.');

  // 3. Authenticate + authorize.
  const { db, user, leagueName, inviterName } = await assertCommissioner(leagueId);

  // 4. Re-verify the token belongs to THIS league + email and is still valid —
  //    the client supplies it, we never trust it (commissioner-scoped SELECT).
  const { data: invite, error: inviteError } = await db
    .from('fantasy_league_invites')
    .select('id')
    .eq('token', token)
    .eq('league_id', leagueId)
    .eq('email', email.toLowerCase())
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (inviteError) throw new Error('Could not verify the invite.');
  if (!invite) throw new Error('Invite not found, already used, or expired.');

  // 4b. Per-invite resend cooldown (durable, stored on the row).
  const { data: sentRow } = await db
    .from('fantasy_league_invites')
    .select('last_sent_at')
    .eq('id', invite.id as string)
    .maybeSingle();
  if (sentRow?.last_sent_at) {
    const elapsedMs = Date.now() - new Date(sentRow.last_sent_at as string).getTime();
    if (elapsedMs < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000);
      throw new Error(`Please wait ${waitSec}s before resending this invite.`);
    }
  }

  // 5. Rolling-hour rate limit per inviter.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from('fantasy_league_invites')
    .select('id', { count: 'exact', head: true })
    .eq('invited_by', user.id)
    .gte('created_at', oneHourAgo);
  if (countError) throw new Error('Could not verify invite rate limit.');
  if ((count ?? 0) > INVITE_RATE_LIMIT_PER_HOUR) {
    throw new Error('Too many invites sent recently. Please try again later.');
  }

  // 6. Accept link from the CONFIGURED base URL.
  const baseUrl = deriveBaseUrl();
  const acceptUrl = `${baseUrl}/fantasy/invite/${token}`;

  // 7. Send via Resend (dynamic import keeps it out of client bundles).
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API);

  const fromAddress = `The Layout <${process.env.SEND_EMAIL}>`;
  const subject = `You're invited to ${stripNewlines(leagueName)} on The Layout`;

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject,
    html: buildEmailHtml({ inviterName, leagueName, acceptUrl }),
    text: buildEmailText({ inviterName, leagueName, acceptUrl }),
  });
  if (error) throw new Error(`Email delivery failed: ${error.message}`);

  // Stamp the send for the cooldown. Best-effort.
  await db
    .from('fantasy_league_invites')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('id', invite.id as string);

  return { ok: true };
}

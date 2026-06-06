'use server';

// Server action: send a team invite email via Resend.
//
// Security model — mirroring src/app/admin/content/actions.ts:
//   1. Verify the caller is authenticated (getUser, throw if not).
//   2. Re-verify permission server-side: the caller must be an owner or coach
//      of the target team. The client already blocks non-editors from seeing
//      the Invite button, but we enforce it here so an authenticated user
//      cannot POST arbitrary { teamId, email } pairs to send spam.
//   3. Validate inputs (email format, role enum) before touching Resend.
//   4. RESEND_API and SEND_EMAIL are never exposed to client code — this file
//      is the only place they appear.

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

// ─── types ──────────────────────────────────────────────────────────────────

export interface SendInviteEmailParams {
  teamId: string;
  email: string;
  role: 'coach' | 'member';
  token: string;
}

export interface SendInviteEmailResult {
  ok: true;
}

// ─── auth helper (mirrors assertAdmin shape) ────────────────────────────────

async function assertTeamEditor(teamId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // One query: confirm membership row exists with owner/coach role AND fetch
  // the team name. Two separate selects would be fine too, but this is atomic.
  const { data: membership, error: memberError } = await supabase
    .from('pb_team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .in('role', ['owner', 'coach'])
    .maybeSingle();

  if (memberError) throw new Error('Could not verify team access.');
  if (!membership) throw new Error('Not authorized');

  // Fetch team name for use in the email body.
  const { data: team, error: teamError } = await supabase
    .from('pb_teams')
    .select('name')
    .eq('id', teamId)
    .maybeSingle();

  if (teamError) throw new Error('Could not load team.');
  if (!team) throw new Error('Team not found');

  // Fetch the inviter's display name for a friendlier email greeting.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    teamName: team.name as string,
    inviterName: (profile?.display_name as string | null) ?? null,
  };
}

// ─── input validation ────────────────────────────────────────────────────────

// Max invites a single user may create per rolling hour. The count below
// includes the just-created row, so the (N+1)th send in an hour is blocked.
const INVITE_RATE_LIMIT_PER_HOUR = 20;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInputs(email: string, role: string): void {
  if (!EMAIL_RE.test(email)) throw new Error('Invalid email address.');
  if (role !== 'coach' && role !== 'member') throw new Error('Invalid role.');
}

// ─── base URL derivation ─────────────────────────────────────────────────────

function deriveBaseUrl(): string {
  // Prefer a configured, trusted base URL — NEVER trust the incoming Host
  // header for links embedded in outbound email (host-header injection would
  // let a forged Host point the accept link at an attacker domain).
  const configured = process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  // Local-dev fallback only: derive from host. In prod SITE_URL must be set.
  const host = headers().get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${host}`;
}

// ─── email template ──────────────────────────────────────────────────────────

function buildEmailHtml(params: {
  inviterName: string | null;
  teamName: string;
  role: 'coach' | 'member';
  acceptUrl: string;
}): string {
  const { inviterName, teamName, role, acceptUrl } = params;
  const senderLabel = inviterName ? inviterName : 'A team owner';
  const roleLabel = role === 'coach' ? 'coach' : 'player';
  // Escape the URL too — it's interpolated into href attributes and visible
  // text. With SITE_URL configured it's a clean constant, but escape defensively.
  const safeUrl = escapeHtml(acceptUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Team invite</title>
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
                You're invited to join<br />${escapeHtml(teamName)}
              </h1>
            </td>
          </tr>

          <!-- Body copy -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#444444;">
                ${escapeHtml(senderLabel)} invited you to join
                <strong style="color:#0d0d0d;">${escapeHtml(teamName)}</strong> on
                The Layout as a <strong style="color:#0d0d0d;">${roleLabel}</strong>.
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
                Accept invite
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
                You received this because someone invited you to a team on The Layout.
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
  teamName: string;
  role: 'coach' | 'member';
  acceptUrl: string;
}): string {
  const { inviterName, teamName, role, acceptUrl } = params;
  // Strip CR/LF from owner-controlled values dropped into the plain-text body.
  const safeTeam = stripNewlines(teamName);
  const senderLabel = stripNewlines(inviterName ? inviterName : 'A team owner');
  const roleLabel = role === 'coach' ? 'coach' : 'player';
  return [
    `You're invited to join ${safeTeam} on The Layout`,
    '',
    `${senderLabel} invited you to join ${safeTeam} as a ${roleLabel}.`,
    '',
    'Accept your invite here:',
    acceptUrl,
    '',
    'This invite expires in 14 days. Sign in with this email address to accept it.',
    '',
    "If you weren't expecting this, you can safely ignore this email.",
  ].join('\n');
}

/** Minimal HTML escaping — only what's needed for text dropped into HTML attributes / content. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Collapse CR/LF to spaces — for values placed in the Subject header or the
 *  plain-text body, where a newline would be injection. */
function stripNewlines(str: string): string {
  return str.replace(/[\r\n]+/g, ' ');
}

// ─── main action ─────────────────────────────────────────────────────────────

export async function sendInviteEmail({
  teamId,
  email,
  role,
  token,
}: SendInviteEmailParams): Promise<SendInviteEmailResult> {
  // 1. Validate env first — fast-fail before any DB work.
  if (!process.env.RESEND_API || !process.env.SEND_EMAIL) {
    throw new Error('Email not configured (missing RESEND_API or SEND_EMAIL env vars).');
  }

  // 2. Validate inputs.
  validateInputs(email, role);

  // 3. Authenticate + authorize — throws 'Not signed in' / 'Not authorized'.
  const { supabase, user, teamName, inviterName } = await assertTeamEditor(teamId);

  // 4. Re-verify the token actually belongs to THIS team + email and is still
  //    valid. The client supplies the token; we never trust it. Without this,
  //    a caller could send a link containing some other invite's token. (Defense
  //    in depth: the accept RPC also binds to the invited email, but we don't
  //    rely on that staying in place.)
  const { data: invite, error: inviteError } = await supabase
    .from('pb_team_invites')
    .select('id')
    .eq('token', token)
    .eq('team_id', teamId)
    .eq('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (inviteError) throw new Error('Could not verify the invite.');
  if (!invite) throw new Error('Invite not found, already used, or expired.');

  // 5. Rate limit: cap how many invites one user can send per rolling hour so a
  //    compromised/abusive owner account can't spam arbitrary addresses from
  //    our verified domain (Resend cost + sender-reputation protection).
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from('pb_team_invites')
    .select('id', { count: 'exact', head: true })
    .eq('invited_by', user.id)
    .gte('created_at', oneHourAgo);
  if (countError) throw new Error('Could not verify invite rate limit.');
  if ((count ?? 0) > INVITE_RATE_LIMIT_PER_HOUR) {
    throw new Error('Too many invites sent recently. Please try again later.');
  }

  // 6. Build the accept link from a CONFIGURED base URL (never the raw Host).
  const baseUrl = deriveBaseUrl();
  const acceptUrl = `${baseUrl}/playbook/invite/${token}`;

  // 7. Send via Resend.
  //    Dynamic import keeps the Resend constructor out of client bundles — the
  //    'use server' directive already enforces server-only, but the dynamic
  //    import is a secondary safety net that makes it structurally impossible
  //    for the Resend client to end up in a client chunk.
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API);

  const fromAddress = `The Layout <${process.env.SEND_EMAIL}>`;
  // Strip CR/LF from the team name before it goes in the Subject HEADER — a
  // newline there would be header injection. (teamName is owner-controlled.)
  const subject = `You're invited to ${stripNewlines(teamName)} on The Layout`;

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject,
    html: buildEmailHtml({ inviterName, teamName, role, acceptUrl }),
    text: buildEmailText({ inviterName, teamName, role, acceptUrl }),
  });

  if (error) {
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  return { ok: true };
}

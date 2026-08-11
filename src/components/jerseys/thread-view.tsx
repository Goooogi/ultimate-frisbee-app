'use client';

// ThreadView — one conversation. Private to the two participants.
//
// Marks read on mount and subscribes to realtime inserts so an open thread
// updates live. Both sides can report the thread, which is the only way an
// admin can ever read it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PosterByline } from '@/components/jerseys/poster-byline';
import { ReportButton } from '@/components/jerseys/report-button';
import { BlockButton } from '@/components/jerseys/block-button';
import { sendMessage, markThreadRead, subscribeToThread } from '@/lib/jerseys/messages';
import { MAX_MESSAGE, type JerseyThread, type JerseyMessage } from '@/lib/jerseys/types';

export function ThreadView({
  thread,
  initialMessages,
  otherBlocked = false,
}: {
  thread: JerseyThread;
  initialMessages: JerseyMessage[];
  /** True when the viewer has blocked the other participant — the composer is
   *  hidden and the thread becomes read-only (the DB enforces this too). */
  otherBlocked?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Keep local state in sync when the server re-renders (e.g. after refresh).
  useEffect(() => setMessages(initialMessages), [initialMessages]);

  useEffect(() => {
    void markThreadRead(thread.id);
  }, [thread.id]);

  useEffect(() => {
    const unsub = subscribeToThread(thread.id, () => router.refresh());
    return unsub;
  }, [thread.id, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const submit = useCallback(async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const err = await sendMessage(thread.id, text);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setBody('');
    router.refresh();
  }, [body, thread.id, router]);

  const backHref = thread.listingId
    ? `/jerseys/${thread.listingId}`
    : thread.wantId
      ? `/jerseys/wanted/${thread.wantId}`
      : '/jerseys';

  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      {/* Who + what this is about */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-card bg-surface shadow-card">
        <div className="flex flex-col gap-1 min-w-0">
          <PosterByline poster={thread.otherParty} size={28} />
          <Link
            href={backHref}
            className="text-[11.5px] text-muted hover:text-ink font-tight truncate motion-safe:transition-colors"
          >
            About: {thread.subject}
          </Link>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <ReportButton
            threadId={thread.id}
            reportedUserId={thread.otherParty?.id ?? null}
            signedIn
            label=""
          />
          {thread.otherParty && (
            <BlockButton
              userId={thread.otherParty.id}
              displayName={thread.otherParty.displayName}
              initiallyBlocked={otherBlocked}
              signedIn
            />
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-col gap-2 min-h-[240px]">
        {messages.length === 0 ? (
          <p className="text-[13px] text-muted font-tight text-center py-8">
            Say hello — ask if it&rsquo;s still available, or offer a trade.
          </p>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="text-[12px] text-accent font-tight" role="alert">
          {error}
        </p>
      )}

      {/* Composer — hidden while blocked. The DB rejects the insert anyway, so
          showing an input that always errors would just be a worse way to say
          the same thing. */}
      {otherBlocked ? (
        <div className="flex flex-col gap-1.5 p-3.5 rounded-card bg-surface shadow-card">
          <span className="text-[12.5px] font-semibold text-ink font-tight">
            You blocked {thread.otherParty?.displayName ?? 'this person'}.
          </span>
          <span className="text-[11.5px] text-muted font-tight">
            Neither of you can send messages here. The history stays visible to you. Unblock above
            to reopen the conversation.
          </span>
        </div>
      ) : (
      <div className="flex items-end gap-2 sticky bottom-[calc(env(safe-area-inset-bottom)+88px)] sm:static bg-bg pt-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          maxLength={MAX_MESSAGE}
          placeholder="Write a message…"
          className="flex-1 px-3 py-2.5 rounded-card bg-surface shadow-card text-[13.5px] text-ink font-tight placeholder:text-faint resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !body.trim()}
          className={[
            'inline-flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            busy || !body.trim()
              ? 'bg-surface text-faint cursor-not-allowed'
              : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
          ].join(' ')}
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2 9h13M9 3l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      )}

      <p className="text-[10.5px] text-faint font-tight leading-snug">
        Meet somewhere public — a tournament you&rsquo;re both at is ideal. The Layout doesn&rsquo;t
        handle payment or shipping.
      </p>
    </div>
  );
}

function Bubble({ message }: { message: JerseyMessage }) {
  return (
    <div className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[80%] px-3.5 py-2.5 rounded-card',
          'text-[13.5px] font-tight leading-snug whitespace-pre-wrap break-words',
          message.mine ? 'bg-accent text-accent-ink' : 'bg-surface text-ink shadow-card',
        ].join(' ')}
      >
        {message.body}
        <span
          className={`block mt-1 text-[9.5px] tabular ${message.mine ? 'text-accent-ink/60' : 'text-faint'}`}
        >
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

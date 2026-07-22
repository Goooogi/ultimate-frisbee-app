'use client';

// Admin Roles list — the user directory with a per-user role selector for beta
// testing. Search by email / display name / username. Role changes go through
// the admin-guarded setUserRole server action (useTransition keeps the row
// responsive across the action + revalidate round-trip). Mirrors the
// AdminFeedbackList control pattern.

import { useMemo, useState, useTransition } from 'react';
import { setUserRole } from '@/app/admin/roles/actions';
import { USER_ROLES, type UserRole } from '@/lib/auth/types';
import type { AdminUserRow } from '@/lib/admin/roles';

const ROLE_STYLE: Record<UserRole, string> = {
  user: 'bg-ink/5 text-muted',
  beta: 'bg-accent/15 text-accent',
  admin: 'bg-ink text-bg',
};

export function AdminRolesList({ users, currentUserId }: { users: AdminUserRow[]; currentUserId: string }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        (u.displayName?.toLowerCase().includes(q) ?? false) ||
        (u.username?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, search, roleFilter]);

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = { user: 0, beta: 0, admin: 0 };
    for (const u of users) c[u.role] = (c[u.role] ?? 0) + 1;
    return c;
  }, [users]);

  return (
    <section aria-label="User roles" className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email, name, or username…"
          className="w-full sm:max-w-xs px-4 py-2.5 rounded-full bg-ink/5 text-[13px] font-tight text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[44px]"
          aria-label="Search users"
        />
        <div className="flex flex-wrap gap-1.5">
          <RoleFilterPill active={roleFilter === 'all'} onClick={() => setRoleFilter('all')} label={`All ${users.length}`} />
          {USER_ROLES.map((r) => (
            <RoleFilterPill
              key={r.value}
              active={roleFilter === r.value}
              onClick={() => setRoleFilter(r.value)}
              label={`${r.label} ${roleCounts[r.value] ?? 0}`}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-muted font-tight py-8 text-center">No users match your search.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function UserRow({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimistic role for instant feedback; reverts on error.
  const [role, setRole] = useState<UserRole>(user.role);

  function changeRole(next: UserRole) {
    if (next === role) return;
    const prev = role;
    setRole(next);
    setError(null);
    startTransition(async () => {
      try {
        await setUserRole(user.id, next);
      } catch (e) {
        setRole(prev);
        setError(e instanceof Error ? e.message : 'Could not change role.');
      }
    });
  }

  const name = user.displayName || user.username || user.email.split('@')[0];

  return (
    <li className="rounded-card bg-surface shadow-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display italic font-bold text-[15px] text-ink truncate">{name}</span>
          <span className={`text-[9px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded-full ${ROLE_STYLE[role]}`}>
            {USER_ROLES.find((r) => r.value === role)?.label ?? role}
          </span>
          {isSelf && (
            <span className="text-[9px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded-full bg-ink/5 text-faint">
              You
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted font-tight truncate mt-0.5">
          {user.email}
          {user.username ? ` · @${user.username}` : ''}
        </p>
        {error && <p className="text-[11px] text-notify font-tight mt-1" role="alert">{error}</p>}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0" role="group" aria-label={`Set role for ${name}`}>
        {USER_ROLES.map((r) => {
          const on = role === r.value;
          // An admin can't demote themselves out of admin (server enforces; we
          // also disable the control so it reads as intentional).
          const disabledSelf = isSelf && user.role === 'admin' && r.value !== 'admin';
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => changeRole(r.value)}
              disabled={pending || disabledSelf}
              aria-pressed={on}
              title={disabledSelf ? "You can't change your own admin role" : undefined}
              className={[
                'px-3 py-2 rounded-full text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight min-h-[40px]',
                'transition-colors duration-150 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                on ? 'bg-ink text-bg' : 'bg-ink/5 text-muted hover:text-ink hover:bg-ink/10',
              ].join(' ')}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}

function RoleFilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex items-center px-3 py-1.5 rounded-full text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight',
        'transition-colors duration-150 min-h-[36px] cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active ? 'bg-ink text-bg' : 'bg-ink/5 text-muted hover:text-ink',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

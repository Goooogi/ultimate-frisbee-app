// Plays are now stored in Supabase (see ./data.ts). This module only owns
// the local-only id generator used for transient state — newly created
// steps/plays get a temporary id until the server-assigned UUID returns.

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}

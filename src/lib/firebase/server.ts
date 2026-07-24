/**
 * Server-side Firebase — NO Firebase SDK imports.
 * Pure fetch() to Firebase REST API + in-memory maps for cache & rate limit.
 */

// ─── Auth ───

export interface VerifiedUser {
  uid: string;
  email: string;
  role: 'user' | 'admin';
}

/** Verify Firebase ID token via REST API */
export async function verifyToken(idToken: string): Promise<VerifiedUser> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('Firebase not configured');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Invalid token');
  const info = data.users?.[0];
  if (!info) throw new Error('User not found');

  const email = info.email || 'unknown@email.com';
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
  const role: 'user' | 'admin' = adminEmails.includes(email.toLowerCase()) ? 'admin' : 'user';

  return { uid: info.localId, email, role };
}

export function isServerReady(): boolean {
  return !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
}

// ─── Rate Limit (in-memory) ───

const rateMap = new Map<string, number>();
const RATE_MS = 20 * 60 * 1000;

export async function checkUserRateLimit(uid: string, role: string): Promise<{ allowed: boolean; reason?: string }> {
  if (role === 'admin') return { allowed: true };
  const now = Date.now();
  const last = rateMap.get(uid);
  if (last && now - last < RATE_MS) {
    const min = Math.ceil((RATE_MS - (now - last)) / 60000);
    return { allowed: false, reason: `Please wait ${min} min before next analysis.` };
  }
  rateMap.set(uid, now);
  return { allowed: true };
}

export async function touchUser(_uid: string) {}

// ─── Cache (in-memory) ───

interface CacheEntry { markdown: string; domain: string; model: string; createdAt: number }
const cacheMap = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

export function urlHash(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) { h = ((h << 5) - h) + url.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

export async function getCache(url: string): Promise<CacheEntry | null> {
  const entry = cacheMap.get(urlHash(url));
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL) { cacheMap.delete(urlHash(url)); return null; }
  return entry;
}

export async function setCache(url: string, entry: CacheEntry) {
  cacheMap.set(urlHash(url), entry);
}

// ─── Log Analysis (no-op, in-memory) ───

export async function logAnalysis(_data: any) {}

// ─── Admin (no-op without Firestore) ───

export interface UserRecord { uid: string; email: string; displayName?: string; role: string; totalAnalyses?: number; lastActive?: number }
export async function getAllUsers(): Promise<UserRecord[]> { return []; }
export async function setUserRole(_uid: string, _role: string) { throw new Error('Firestore not available'); }
export async function getUserAnalyses(_limit?: number): Promise<any[]> { return []; }

import type {
  AdminUsage,
  Caveat,
  CompareListingInput,
  FinalState,
  Insights,
  Itinerary,
  Listing,
  ListingsResponse,
  PipelineResponse,
  User,
  VoteDir,
  VotesMap,
} from '@/types';

/** Error carrying the HTTP status so callers can branch (e.g. 401 → sign in). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  /** Admin key sent as the x-admin-key header (header-only auth on the server). */
  adminKey?: string | null;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.adminKey) headers['x-admin-key'] = opts.adminKey;

  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers,
      // Same-origin in dev (via Vite proxy) and prod; carries the gp_session cookie.
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network error — check your connection and try again.');
  }

  // 204 / empty bodies.
  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : null) ?? `Request failed (HTTP ${res.status}).`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  requestMagicLink: (email: string) =>
    request<{ ok: true }>('/api/auth/request-link', { method: 'POST', body: { email } }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  rename: (name: string) =>
    request<{ user: User }>('/api/auth/me', { method: 'PATCH', body: { name } }),

  // Full-page navigations (NOT fetch) — the server 302-redirects back to `/`.
  googleSignInUrl: '/api/auth/google',

  // ── Listings / votes ───────────────────────────────────────────────────────
  listings: () => request<ListingsResponse>('/api/listings'),
  votes: () => request<VotesMap>('/api/votes'),
  vote: (listing_id: string, vote: VoteDir | null) =>
    request<VotesMap>('/api/votes', { method: 'POST', body: { listing_id, vote } }),
  submitted: () => request<Listing[]>('/api/submitted'),
  submit: (url: string, manual_price?: string | number) =>
    request<Listing>('/api/submit', { method: 'POST', body: { url, manual_price } }),
  pipeline: () => request<PipelineResponse>('/api/pipeline-listings'),

  // ── Itinerary / caveats / insights ─────────────────────────────────────────
  itinerary: () => request<Itinerary>('/api/itinerary'),
  caveats: () => request<Caveat[]>('/api/caveats'),
  postCaveat: (text: string) =>
    request<Caveat[]>('/api/caveats', { method: 'POST', body: { text } }),
  insights: () => request<Insights>('/api/insights'),
  compare: (listings: CompareListingInput[], criteria?: string, mode?: '1v1') =>
    request<{ analysis: string }>('/api/compare-listings', {
      method: 'POST',
      body: { listings, criteria, ...(mode ? { mode } : {}) },
    }),

  // ── Final pick / decision ──────────────────────────────────────────────────
  final: () => request<FinalState>('/api/final'),
  finalVote: (listing_id: string | null) =>
    request<FinalState>('/api/final-vote', { method: 'POST', body: { listing_id } }),

  // ── Admin (x-admin-key header) ─────────────────────────────────────────────
  adminVerify: (adminKey: string) => request<{ ok: true }>('/api/admin/verify', { adminKey }),
  adminUsage: (adminKey: string) => request<AdminUsage>('/api/admin/usage', { adminKey }),
  adminSetItinerary: (text: string, adminKey: string) =>
    request<Itinerary>('/api/admin/itinerary', { method: 'POST', body: { text }, adminKey }),
  adminDecision: (listing_id: string | null, adminKey: string) =>
    request<{ decision: FinalState['decision'] }>('/api/admin/decision', {
      method: 'POST',
      body: { listing_id },
      adminKey,
    }),
  adminDeleteListing: (id: string, adminKey: string) =>
    request<{ ok: true }>(`/api/listings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      adminKey,
    }),
  adminDeleteSubmitted: (id: string, adminKey: string) =>
    request<{ ok: true }>(`/api/submitted/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      adminKey,
    }),
  adminDeleteCaveat: (id: string, adminKey: string) =>
    request<Caveat[]>(`/api/caveats/${encodeURIComponent(id)}`, { method: 'DELETE', adminKey }),
  adminRunPipeline: (adminKey: string) =>
    request<{ ok: true; message: string }>('/api/admin/run-pipeline', {
      method: 'POST',
      adminKey,
    }),
};

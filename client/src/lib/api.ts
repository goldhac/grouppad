import type {
  AdminTripRow,
  AdminUsage,
  Caveat,
  CompareListingInput,
  ScoutVerdict,
  CreateTripInput,
  Experience,
  ExpVotesMap,
  ExpPlan,
  ExpDaysMap,
  FinalState,
  Insights,
  Itinerary,
  Listing,
  ListingReviews,
  ListingsResponse,
  ListingTour,
  NotifPrefs,
  PipelineResponse,
  TripMember,
  TripPulse,
  TripView,
  User,
  VoteDir,
  VotesMap,
} from '@/types';

/** Error carrying the HTTP status so callers can branch (e.g. 401 → sign in). */
export class ApiError extends Error {
  status: number;
  /** Server set { needsJoin: true } on a 403 — caller should nudge to join, not dead-end. */
  needsJoin: boolean;
  constructor(status: number, message: string, needsJoin = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.needsJoin = needsJoin;
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  /** Super-admin key sent as x-admin-key (platform usage view only). */
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
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network error — check your connection and try again.');
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : null) ?? `Request failed (HTTP ${res.status}).`;
    const needsJoin = !!(data && typeof data === 'object' && 'needsJoin' in data && data.needsJoin);
    throw new ApiError(res.status, msg, needsJoin);
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

/** Base path for a trip's entity routes. */
const t = (tripId: string) => `/api/trips/${encodeURIComponent(tripId)}`;

export const api = {
  // ── Auth (global) ──────────────────────────────────────────────────────────
  me: () => request<{ user: User | null }>('/api/auth/me'),
  requestMagicLink: (email: string) =>
    request<{ ok: true }>('/api/auth/request-link', { method: 'POST', body: { email } }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  rename: (name: string) =>
    request<{ user: User }>('/api/auth/me', { method: 'PATCH', body: { name } }),
  setAvatar: (avatar: string | null) =>
    request<{ user: User }>('/api/auth/me', { method: 'PATCH', body: { avatar } }),
  googleSignInUrl: '/api/auth/google',

  // ── Trips (global) ─────────────────────────────────────────────────────────
  myTrips: () => request<{ trips: TripView[] }>('/api/me/trips'),
  createTrip: (input: CreateTripInput) =>
    request<TripView>('/api/trips', { method: 'POST', body: input }),
  getTrip: (tripId: string) => request<TripView>(t(tripId)),
  joinTrip: (tripId: string, join_code?: string) =>
    request<TripView>(`${t(tripId)}/join`, { method: 'POST', body: { join_code } }),
  leaveTrip: (tripId: string) =>
    request<{ ok: true }>(`${t(tripId)}/leave`, { method: 'POST' }),
  deleteTrip: (tripId: string) =>
    request<{ ok: true }>(t(tripId), { method: 'DELETE' }),
  tripPulse: (tripId: string) => request<TripPulse>(`${t(tripId)}/pulse`),
  invite: (tripId: string, emails: string) =>
    request<{ sent: number; attempted: number }>(`${t(tripId)}/invite`, { method: 'POST', body: { emails } }),
  members: (tripId: string) => request<{ members: TripMember[]; canManageOrganizers: boolean }>(`${t(tripId)}/members`),
  makeOrganizer: (tripId: string, userId: string) =>
    request<TripView>(`${t(tripId)}/organizers`, { method: 'POST', body: { userId } }),
  removeOrganizer: (tripId: string, userId: string) =>
    request<TripView>(`${t(tripId)}/organizers/remove`, { method: 'POST', body: { userId } }),
  patchTrip: (tripId: string, patch: Partial<CreateTripInput> & { voting_closed?: boolean }) =>
    request<TripView>(t(tripId), { method: 'PATCH', body: patch }),
  transferOrganizer: (tripId: string, userId: string) =>
    request<TripView>(`${t(tripId)}/transfer`, { method: 'POST', body: { userId } }),
  removeMember: (tripId: string, userId: string) =>
    request<{ ok: true }>(`${t(tripId)}/members/remove`, { method: 'POST', body: { userId } }),
  notifPrefs: () => request<NotifPrefs>('/api/me/notifications'),
  setNotifPrefs: (prefs: Partial<NotifPrefs>) =>
    request<NotifPrefs>('/api/me/notifications', { method: 'POST', body: prefs }),
  runSearch: (tripId: string, max = 10) =>
    request<{ ok: true }>(`${t(tripId)}/run-search`, { method: 'POST', body: { max } }),
  refreshListings: (tripId: string) =>
    request<{ ok: true }>(`${t(tripId)}/refresh`, { method: 'POST' }),
  searchStatus: (tripId: string) =>
    request<{ searching: boolean; count: number; configured: boolean }>(`${t(tripId)}/search-status`),

  // ── Trip-scoped entities ───────────────────────────────────────────────────
  listings: (tripId: string) => request<ListingsResponse>(`${t(tripId)}/listings`),
  votes: (tripId: string) => request<VotesMap>(`${t(tripId)}/votes`),
  vote: (tripId: string, listing_id: string, vote: VoteDir | null) =>
    request<VotesMap>(`${t(tripId)}/votes`, { method: 'POST', body: { listing_id, vote } }),
  submitted: (tripId: string) => request<Listing[]>(`${t(tripId)}/submitted`),
  submit: (tripId: string, url: string, manual_price?: string | number) =>
    request<Listing>(`${t(tripId)}/submit`, { method: 'POST', body: { url, manual_price } }),
  deleteListing: (tripId: string, id: string) =>
    request<{ ok: true }>(`${t(tripId)}/listings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  deleteSubmitted: (tripId: string, id: string) =>
    request<{ ok: true }>(`${t(tripId)}/submitted/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  pipeline: (tripId: string) => request<PipelineResponse>(`${t(tripId)}/pipeline-listings`),

  itinerary: (tripId: string) => request<Itinerary>(`${t(tripId)}/itinerary`),
  setItinerary: (tripId: string, text: string) =>
    request<Itinerary>(`${t(tripId)}/itinerary`, { method: 'POST', body: { text } }),
  /** Pull the text out of an itinerary PDF. Returns it for REVIEW — it does not
   *  save anything, because replacing a trip's canonical plan is a human's call. */
  extractItinerary: async (tripId: string, file: File) => {
    let res: Response;
    try {
      res = await fetch(`${t(tripId)}/itinerary/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        credentials: 'include',
        body: file,
      });
    } catch {
      throw new ApiError(0, 'Network error — check your connection and try again.');
    }
    const raw = await res.text();
    const data = raw ? safeJson(raw) : null;
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error || 'Could not read that PDF.');
    return data as { text: string; raw: string; pages: number; chars: number; tidied: boolean; truncated: boolean };
  },
  caveats: (tripId: string) => request<Caveat[]>(`${t(tripId)}/caveats`),
  postCaveat: (tripId: string, text: string) =>
    request<Caveat[]>(`${t(tripId)}/caveats`, { method: 'POST', body: { text } }),
  deleteCaveat: (tripId: string, id: string) =>
    request<Caveat[]>(`${t(tripId)}/caveats/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  approveCaveat: (tripId: string, id: string) =>
    request<Caveat[]>(`${t(tripId)}/caveats/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  insights: (tripId: string) => request<Insights>(`${t(tripId)}/insights`),
  compare: (tripId: string, listings: CompareListingInput[], criteria?: string, mode?: '1v1') =>
    request<{ analysis: string; verdict?: ScoutVerdict | null }>(`${t(tripId)}/compare-listings`, {
      method: 'POST',
      body: { listings, criteria, ...(mode ? { mode } : {}) },
    }),
  /** A member's personal question about the shortlist — not cached, not shared. */
  askScout: (tripId: string, listings: CompareListingInput[], question: string) =>
    request<{ answer: string }>(`${t(tripId)}/ask-scout`, {
      method: 'POST',
      body: { listings, question },
    }),
  aiRank: (tripId: string, listings: Partial<Listing>[]) =>
    request<{ order: { id: string; why: string | null }[]; ranked_at: string | null; fallback?: boolean; cached?: boolean }>(
      `${t(tripId)}/ai-rank`,
      { method: 'POST', body: { listings } },
    ),

  reviews: (tripId: string) => request<Record<string, ListingReviews>>(`${t(tripId)}/reviews`),
  fetchReviews: (tripId: string, source: string, id: string, url: string, force?: boolean) =>
    request<ListingReviews>(`${t(tripId)}/reviews/fetch`, { method: 'POST', body: { source, id, url, force } }),
  refreshReviews: (tripId: string, force?: boolean) =>
    request<{ fetched: number; skipped: number; total: number }>(`${t(tripId)}/reviews/refresh-all`, { method: 'POST', body: { force } }),
  tours: (tripId: string) => request<Record<string, ListingTour>>(`${t(tripId)}/tours`),
  generateTour: (tripId: string, listingId: string, force?: boolean) =>
    request<ListingTour>(`${t(tripId)}/tours/${encodeURIComponent(listingId)}/generate`, { method: 'POST', body: { force } }),

  final: (tripId: string) => request<FinalState>(`${t(tripId)}/final`),
  finalVote: (tripId: string, listing_id: string | null) =>
    request<FinalState>(`${t(tripId)}/final-vote`, { method: 'POST', body: { listing_id } }),
  // Experiences ("things to do") — scraped list + its own votes store.
  experiences: (tripId: string) =>
    request<{ experiences: Experience[]; pending: boolean }>(`${t(tripId)}/experiences`),
  refreshExperiences: (tripId: string) =>
    request<{ ok: true; started: boolean }>(`${t(tripId)}/experiences/refresh`, { method: 'POST' }),
  expVotes: (tripId: string) => request<ExpVotesMap>(`${t(tripId)}/exp-votes`),
  expReviews: (tripId: string, experienceId: string) =>
    request<ListingReviews | null>(`${t(tripId)}/experiences/${encodeURIComponent(experienceId)}/reviews`),
  expPlan: (tripId: string) => request<ExpPlan | null>(`${t(tripId)}/exp-plan`),
  tripDays: (tripId: string) => request<{ days: string[] }>(`${t(tripId)}/days`),
  expDays: (tripId: string) => request<ExpDaysMap>(`${t(tripId)}/exp-days`),
  expSaves: (tripId: string) => request<{ ids: string[] }>(`${t(tripId)}/exp-saves`),
  toggleExpSave: (tripId: string, experience_id: string, on?: boolean) =>
    request<{ ids: string[] }>(`${t(tripId)}/exp-saves`, { method: 'POST', body: { experience_id, on } }),
  myPlan: (tripId: string) => request<ExpPlan | null>(`${t(tripId)}/my-plan`),
  buildMyPlan: (tripId: string, ids?: string[]) =>
    request<ExpPlan>(`${t(tripId)}/my-plan`, { method: 'POST', body: { ids } }),
  /** Turn the share link off / back on. "Off" is expiry set to now, so every
   *  path that already handles an expired link keeps working unchanged. */
  revokeMyPlan: (tripId: string) => request<ExpPlan>(`${t(tripId)}/my-plan/revoke`, { method: 'POST' }),
  reshareMyPlan: (tripId: string) => request<ExpPlan>(`${t(tripId)}/my-plan/reshare`, { method: 'POST' }),
  setExpDay: (tripId: string, experience_id: string, day: string | null) =>
    request<ExpDaysMap>(`${t(tripId)}/exp-days`, { method: 'POST', body: { experience_id, day } }),
  /** `isolated` plans on a blank slate instead of working around the trip
   *  itinerary — right when the posted itinerary is stale or aspirational. */
  planExperiences: (tripId: string, force?: boolean, isolated?: boolean) =>
    request<ExpPlan>(`${t(tripId)}/plan-experiences`, { method: 'POST', body: { force, isolated } }),
  expVote: (tripId: string, experience_id: string, vote: VoteDir | null) =>
    request<ExpVotesMap>(`${t(tripId)}/exp-votes`, { method: 'POST', body: { experience_id, vote } }),

  favorites: (tripId: string) => request<{ ids: string[] }>(`${t(tripId)}/favorites`),
  toggleFavorite: (tripId: string, listing_id: string, on?: boolean) =>
    request<{ ids: string[] }>(`${t(tripId)}/favorites`, { method: 'POST', body: { listing_id, on } }),
  decision: (tripId: string, listing_id: string | null) =>
    request<{ decision: FinalState['decision'] }>(`${t(tripId)}/decision`, {
      method: 'POST',
      body: { listing_id },
    }),

  // ── Platform super-admin (usage meter only) ────────────────────────────────
  adminVerify: (adminKey?: string) => request<{ ok: true }>('/api/admin/verify', { adminKey }),
  adminUsage: (adminKey?: string) => request<AdminUsage>('/api/admin/usage', { adminKey }),
  adminTrips: (adminKey?: string) => request<{ trips: AdminTripRow[] }>('/api/admin/trips', { adminKey }),
  adminRunPipeline: (adminKey?: string) =>
    request<{ ok: true; message: string }>('/api/admin/run-pipeline', { method: 'POST', adminKey }),
};

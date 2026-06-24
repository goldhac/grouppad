// Domain types mirrored 1:1 from the Express API contract (server.js).
// Three different response envelopes exist — keep them distinct.

export type YesNoUnknown = 'yes' | 'no' | 'unknown';
export type BudgetTier = 'under' | 'marginal' | 'over' | 'unknown';
export type VoteDir = 'up' | 'down';

export interface User {
  id: string;
  email: string;
  name: string;
  /** Chosen avatar id (see AVATARS), or null/undefined → initials circle. */
  avatar?: string | null;
  /** Platform super-admin (by email) — gets the admin dashboard without a key. */
  isSuperAdmin?: boolean;
}

export interface Trip {
  id?: string;
  name?: string;
  destination: string;
  checkin: string; // YYYY-MM-DD
  checkout_5n: string;
  checkout_4n?: string;
  adults: number;
  budget: number;
  bedrooms?: number | null;
  home_type?: string;
  /** How many days the group can shift each side of the dates (0 = exact). */
  flex_days?: number;
  tax_rate?: number;
  cleaning_placeholder?: number;
  refreshed_at?: string | null;
  /** Organizer froze likes/top-choices. */
  voting_closed?: boolean;
}

/** A trip plus the calling user's membership flags (from GET /api/trips/:id). */
export interface TripView extends Trip {
  id: string;
  name: string;
  isOwner: boolean;
  /** The original creator: can delete the trip and manage organizers. */
  isCreator?: boolean;
  isMember: boolean;
  memberCount: number;
  /** Organizer's first name, for the invite welcome ("Gold invited you"). */
  owner_name?: string | null;
  /** The trip's UI theme (organizer-set default); 'classic' when unset. */
  skin?: string;
  created_at?: string;
  /** Cover photo from the trip's top-voted home; null for new trips (client falls back to an editorial image). */
  coverPhoto?: string | null;
  // organizer-only fields
  join_code?: string;
  members?: string[];
  organizers?: string[];
  owner_id?: string;
}

export interface CreateTripInput {
  name?: string;
  destination: string;
  checkin: string;
  checkout_5n: string;
  adults: number;
  budget: number;
  bedrooms?: number | null;
  home_type?: string;
  flex_days?: number;
  itinerary?: string;
  /** Optional UI theme picked at create time → the trip's default skin. */
  skin?: string;
}

export interface TripMember {
  id: string;
  name: string;
  /** Organizer-only; omitted for regular members viewing the roster. */
  email?: string;
  avatar?: string | null;
  role: 'organizer' | 'member';
  /** The original creator (cannot be demoted or removed). */
  isCreator?: boolean;
  isYou: boolean;
}

export interface TripPulse {
  members: number;
  votes: number;
  picks: number;
  submissions: number;
  decisionLocked: boolean;
  listings: number;
}

/** Per-user email notification preferences. */
export interface NotifPrefs {
  digest: boolean;
  instant: boolean;
}

/** A single scraped guest review. */
export interface ReviewSnippet {
  text: string;
  rating: number | null;
  date: string | null;
  author: string;
}

/** Cached review snippets for one listing — split by sentiment (stars). */
export interface ListingReviews {
  pos: ReviewSnippet[];
  neg: ReviewSnippet[];
  total: number;
  fetched_at: string;
}

/** One AI-generated clip in a listing's walkthrough tour. */
export interface TourClip {
  photo: string;
  feature: string;
  videoUrl: string | null;
}
/** A listing's walkthrough tour (clips of its best spaces). */
export interface ListingTour {
  listing_id: string;
  name: string | null;
  status: 'generating' | 'ready';
  clips: TourClip[];
  created_at: string;
}

/**
 * A rental listing. The backend has three sources (curated `listings.json`,
 * the scraped pipeline, and community submissions) whose shapes overlap but
 * differ in a few fields — all optional fields below capture that variance.
 * `id` is always a string. `source` casing differs by origin (curated/submitted
 * are capitalized e.g. "Airbnb"; pipeline is lowercase e.g. "airbnb").
 */
export interface Listing {
  id: string;
  name: string;
  url: string;
  source: string;
  area?: string;
  lat?: number | null;
  lng?: number | null;
  distance_mi?: number | null;
  /** Distance + drive-time chips to the trip's reference points. */
  distances?: { icon: string; kind?: string; label: string; mi: number; min: number }[];
  bd?: number | null;
  ba?: number | null;
  sleeps?: number | null;
  pool?: YesNoUnknown;
  parking?: YesNoUnknown;
  hot_tub?: YesNoUnknown;
  rating?: number | null;
  reviews?: number | null;
  superhost?: boolean;
  /** Freshly pulled in the latest listings refresh — shows a "New" badge. */
  is_new?: boolean;
  budget?: BudgetTier;
  /** Availability for the trip dates: true/false when the scrape could tell, else undefined. */
  available?: boolean | null;
  check_manual?: boolean;
  displayed_5n?: number | null;
  est_5n?: number | null;
  est_4n?: number | null;
  note?: string;
  photos?: string[];
  amenities?: string[];
  // curated only
  rank?: number;
  // submitted only
  submitted_by?: string;
  submitted_at?: string;
  // pipeline only
  last_seen?: string;
  enriched?: boolean;
}

export interface ListingsResponse {
  trip: Trip;
  listings: Listing[];
}

export interface PipelineResponse {
  listings: Listing[];
  count: number;
  note?: string;
}

/** votes: { [listingId]: { [userId]: 'up' | 'down' } } */
export type VotesMap = Record<string, Record<string, VoteDir>>;

export interface Itinerary {
  text: string;
  updated_at: string | null;
}

export interface Caveat {
  id: string;
  user_id: string;
  name: string;
  text: string;
  status?: 'pending' | 'approved';
  created_at: string;
}

/** Structured Scout comparison verdict (server returns this alongside markdown). */
export interface ScoutVerdict {
  summary?: string;
  winner?: { n?: number; name: string; why?: string } | null;
  ranked?: { n?: number; name: string; fit: 'best' | 'good' | 'skip'; reason: string }[];
  table?: { n?: number; name: string; bedsSleeps?: string; allIn?: string; distance?: string; poolHotTub?: string; standout?: string }[];
  redFlags?: { n?: number; name: string; severity?: 'high' | 'medium'; note: string }[];
  picks?: { n?: number; name: string; line: string }[];
}

export interface Insights {
  analysis: string;
  verdict?: ScoutVerdict | null;
  count?: number;
  ids?: string[];
  /** Set when the group's approved criteria changed after this was computed. */
  stale?: boolean;
  created_at: string | null;
}

export interface Decision {
  listing_id: string;
  locked_at: string;
}

export interface FinalState {
  counts: Record<string, number>;
  total: number;
  myPick: string | null;
  decision: Decision | null;
  /** Who top-picked each home (listingId → userIds). Members only; absent for guests. */
  pickers?: Record<string, string[]>;
}

// ── Admin usage dashboard ────────────────────────────────────────────────────
export interface GeminiUsage {
  configured: boolean;
  model: string;
  calls: number;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  estCostUsd: number;
  rates: { inputPerM: number; outputPerM: number };
}

export interface FirecrawlUsage {
  configured: boolean;
  callsThisMonth: number;
  remainingCredits: number | null;
  planCredits: number | null;
}

export interface ApifyRun {
  startedAt: string;
  status: string;
  costUsd: number | null;
  actId?: string;
}

export interface ApifyUsage {
  configured: boolean;
  spentUsd: number | null;
  limitUsd: number | null;
  recent: ApifyRun[];
}

export interface FalUsage {
  configured: boolean;
  model: string;
  clips: number;
  seconds: number;
  estCostUsd: number;
  ratePerSec: number;
}

export interface GroupPulse {
  members: number;
  trips?: number;
  votes: number;
  picks: number;
  submissions: number;
  decisionLocked: boolean;
  refreshedAt: string | null;
}

export interface AdminTripRow {
  id: string;
  name: string;
  members: number;
  homes: number;
  votes: number;
  locked: boolean;
  state: 'locked' | 'active' | 'idle';
  created_at: string | null;
}

export interface AdminUsage {
  month: string;
  gemini: GeminiUsage;
  firecrawl: FirecrawlUsage;
  apify: ApifyUsage;
  fal: FalUsage;
  group: GroupPulse;
}

/** Minimal listing payload sent to POST /api/compare-listings. */
export interface CompareListingInput {
  id: string;
  name: string;
  bd?: number | null;
  ba?: number | null;
  sleeps?: number | null;
  area?: string;
  distance_mi?: number | null;
  est_5n?: number | null;
  displayed_5n?: number | null;
  pool?: YesNoUnknown;
  hot_tub?: YesNoUnknown;
  parking?: YesNoUnknown;
  rating?: number | null;
  reviews?: number | null;
  url: string;
  amenities?: string[];
}

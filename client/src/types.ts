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

/** A named coordinate the trip measures distances from (server tripRefPoints). */
export interface RefPoint {
  name: string;
  lat: number;
  lng: number;
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
  /** The trip's dates have passed — archived into "Previous trips"; stops refreshing. */
  past?: boolean;
  /** The group locked an official pick — stops refreshing and notifying. */
  settled?: boolean;
  /** Cover photo from the trip's top-voted home; null for new trips (client falls back to an editorial image). */
  coverPhoto?: string | null;
  /** Distance reference points for "X mi from …" math; null when the trip has none. */
  ref_points?: { downtown?: RefPoint; airport?: RefPoint; attraction?: RefPoint } | null;
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
  /** Experiences only: the page's overall aggregate (avg + count). */
  summary?: { ratingAverage: number | null; ratingCount: number | null } | null;
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

/** An Airbnb Experience ("thing to do") scraped for the trip's destination. */
export interface Experience {
  /** NAMESPACED: `airbnb:3951041`, `osm:node/123`. Keys five separate stores, so
   *  a bare provider id would collide across sources. */
  id: string;
  /** Which provider this row came from. */
  source?: 'airbnb' | 'osm' | 'viator' | string;
  title: string;
  category: string | null;
  price: number | null;
  currency: string | null;
  /** Pre-discount rate when on sale (else null) — show as strikethrough + "Save $X". */
  originalPrice?: number | null;
  /** 'guest' or 'group' — group-priced experiences divide by the whole party. */
  priceUnit?: 'guest' | 'group' | null;
  rating: number | null;
  reviews: number | null;
  url: string;
  photo: string | null;
  lat: number | null;
  lng: number | null;
  /** Duration in minutes. */
  duration: number | null;
  /** The one line a group reads before deciding. Providers rarely ship one (OSM
   *  never does), so Scout writes it — see docs/specs/scout.md §2 "Describe". */
  description?: string | null;
  /** 'scout' = model-written, so the UI must attribute it; 'template' = a
   *  deterministic restatement of fields we already hold, which needs no label. */
  descriptionBy?: 'scout' | 'template';
}
/** experienceId → userId → vote. Separate store from home votes. */
export type ExpVotesMap = Record<string, Record<string, VoteDir>>;

/** experienceId → 'YYYY-MM-DD'. The group pinning an activity to a day (Phase 4).
 *  A human pin always beats Scout's suggested day. */
export type ExpDaysMap = Record<string, string>;

/** One row of a routed day: a stop, the travel leg between two stops, or a
 *  named gap. Stops and legs alternate down the spine. */
export type RouteRow =
  | { k: 'anchor' | 'stop'; t: string; id?: string; n: string; tag?: 'voted' | 'pinned' | null; facts?: string[]; why?: string | null }
  | { leg: 'drive' | 'walk'; dur: string; mi: string; tight?: boolean; why?: string | null }
  | { gap: string };

/** A day rendered as a journey rather than a list. Computed by the server at
 *  READ time (votes, pins and the decided home all move under a saved plan).
 *  Every number here is calculated; only `why` comes from Scout. */
export interface DayRoute {
  /** "9:30a – 6:15p" */
  win: string;
  /** Time out of the house, e.g. "8 hr 45 min". */
  out: string;
  /** Time driving, or null when nothing could be measured. */
  drive: string | null;
  /** 3h+ behind the wheel — that's a road trip, not a day out. */
  heavy?: boolean;
  /** Per-person cost of the day's priced items. */
  pp: number | null;
  /** How many stops had no price at all. */
  unpriced: number;
  rows: RouteRow[];
}

/** Scout's day-by-day plan built from the group's up-voted experiences.
 *  See docs/specs/scout.md §2 (the "Plan" job). */
export interface ExpPlan {
  hash: string;
  days: {
    day: string | null;
    items: { id: string; why: string | null }[];
    /** Absent when the day has no usable stops — the flat list still renders. */
    route?: DayRoute | null;
  }[];
  planned_at: string;
  /** Shared plan links stop working a week after the plan was last generated —
   *  the URL is the secret, so it shouldn't be a permanent key. Re-planning
   *  restarts the clock. Absent on the group's plan, which isn't shared by URL. */
  expires_at?: string;
  /** True when built without Gemini (cap hit / key missing) — still useful. */
  fallback?: boolean;
}

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

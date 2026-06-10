import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '@/lib/api';
import { netVotes } from '@/lib/utils';
import type {
  Caveat,
  CompareListingInput,
  CreateTripInput,
  FinalState,
  Insights,
  Itinerary,
  Listing,
  ListingReviews,
  ListingTour,
  TripView,
  User,
  VoteDir,
  VotesMap,
} from '@/types';

const ADMIN_KEY_LS = 'admin_key';
const ONBOARDED_LS = 'gp_onboarded';

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface AuthModalState {
  open: boolean;
  reason?: string;
}

interface AppState {
  // global account
  user: User | null;
  myTrips: TripView[];
  accountLoading: boolean;

  // active trip
  trip: TripView | null;
  tripId: string | null;
  isOwner: boolean;
  tripLoading: boolean;
  tripError: string | null;

  // active-trip data
  listings: Listing[];
  votes: VotesMap;
  submitted: Listing[];
  pipeline: Listing[];
  itinerary: Itinerary;
  caveats: Caveat[];
  insights: Insights | null;
  final: FinalState;
  reviewsMap: Record<string, ListingReviews>;
  toursMap: Record<string, ListingTour>;

  // ui / local
  adminKey: string | null;
  split: number;
  selected: ReadonlySet<string>;
  toasts: Toast[];
  authModal: AuthModalState;
  onboardingOpen: boolean;
  detailId: string | null;

  // derived
  shortlistIds: ReadonlySet<string>;
  // AI ranking
  aiOrder: string[];
  aiWhy: Record<string, string>;
  aiRankIndex: ReadonlyMap<string, number>;
  aiRankLoading: boolean;
  // Cross-pool recommendation set + suppressed duplicate ids
  recommendedPool: Listing[];
  suppressedIds: ReadonlySet<string>;
  /** All distinct homes across community + live + curated (deduped). */
  pooledListings: Listing[];
}

interface AppActions {
  loadAccount: () => Promise<void>;
  refreshMyTrips: () => Promise<void>;
  enterTrip: (tripId: string) => Promise<void>;
  refreshListings: () => Promise<void>;
  createTrip: (input: CreateTripInput) => Promise<TripView>;
  joinTrip: (tripId: string, code?: string) => Promise<void>;
  deleteTrip: (tripId: string) => Promise<void>;
  // auth
  signOut: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  setAvatar: (avatar: string | null) => Promise<void>;
  requireSignIn: (action?: string) => boolean;
  openAuth: (reason?: string) => void;
  closeAuth: () => void;
  // onboarding
  startOnboarding: (force: boolean) => void;
  endOnboarding: () => void;
  // detail modal
  openDetail: (id: string) => void;
  closeDetail: () => void;
  findListing: (id: string) => Listing | undefined;
  // votes / picks
  castVote: (listingId: string, dir: VoteDir) => Promise<void>;
  toggleFinalPick: (listingId: string) => Promise<void>;
  favoriteIds: ReadonlySet<string>;
  toggleFavorite: (listingId: string) => Promise<void>;
  setDecision: (listingId: string | null) => Promise<void>;
  // submissions / caveats
  submitListing: (url: string, price?: string) => Promise<Listing>;
  postCaveat: (text: string) => Promise<void>;
  deleteCaveat: (id: string) => Promise<void>;
  approveCaveat: (id: string) => Promise<void>;
  deleteListing: (id: string, isSubmitted: boolean) => Promise<void>;
  // compare / itinerary
  runCompare: (items: CompareListingInput[], criteria: string, mode?: '1v1') => Promise<string>;
  saveItinerary: (text: string) => Promise<void>;
  // reviews
  loadReviewsFor: (listing: Listing) => Promise<void>;
  refreshAllReviews: (force?: boolean) => Promise<{ fetched: number; skipped: number; total: number }>;
  // tours
  generateTour: (listingId: string, force?: boolean) => Promise<void>;
  // platform admin key
  setAdminKey: (key: string) => Promise<boolean>;
  clearAdminKey: () => void;
  runPipeline: () => Promise<void>;
  // selection / misc
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setSplit: (n: number) => void;
  toast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: number) => void;
}

type AppContextValue = AppState & AppActions;

const AppContext = createContext<AppContextValue | null>(null);
const EMPTY_FINAL: FinalState = { counts: {}, total: 0, myPick: null, decision: null };
let toastSeq = 0;

// Auto-generated platform names ("Home in Encino", "Villa near Malibu") aren't
// distinctive, so we never cross-merge them — only the listing id dedups those.
const GENERIC_NAME = /^(a\s+)?(home|villa|place|condo|cabin|guesthouse|casa(\s+particular)?|apartment|rental|room|cottage|townhouse|bungalow|loft|house|stay|entire)\b.*\b(in|near|by)\b/i;
/** A stable property key: distinctive names merge the same villa across sources
 *  (e.g. Via Vallarta on villaway + maimongroup); generic names stay per-id. */
function propKey(l: Listing): string {
  const raw = (l.name || '').trim();
  if (!raw || GENERIC_NAME.test(raw)) return `id:${l.source}:${l.id}`;
  return `nm:${raw.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32)}`;
}
const dataScore = (l: Listing) => (l.est_5n ? 4 : 0) + ((l.photos?.length ?? 0) ? 2 : 0) + ((l.distances?.length ?? 0) ? 1 : 0);
// eslint-disable-next-line react-refresh/only-export-components
export const isDeadListing = (l: Listing) => /\b(delisted|de-listed|test listing|placeholder|example)\b/i.test(l.name || '');

export function AppProvider({ children }: { children: ReactNode }) {
  // global account
  const [user, setUser] = useState<User | null>(null);
  const [myTrips, setMyTrips] = useState<TripView[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);

  // active trip
  const [trip, setTrip] = useState<TripView | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);

  // active-trip data
  const [listings, setListings] = useState<Listing[]>([]);
  const [votes, setVotes] = useState<VotesMap>({});
  const [submitted, setSubmitted] = useState<Listing[]>([]);
  const [pipeline, setPipeline] = useState<Listing[]>([]);
  const [itinerary, setItinerary] = useState<Itinerary>({ text: '', updated_at: null });
  const [caveats, setCaveats] = useState<Caveat[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [final, setFinal] = useState<FinalState>(EMPTY_FINAL);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const favRef = useRef<Set<string>>(new Set());
  const [reviewsMap, setReviewsMap] = useState<Record<string, ListingReviews>>({});
  const [toursMap, setToursMap] = useState<Record<string, ListingTour>>({});

  // AI ranking — order (ids best-first) + per-home "why", computed server-side
  const [aiOrder, setAiOrder] = useState<string[]>([]);
  const [aiWhy, setAiWhy] = useState<Record<string, string>>({});
  const [aiRankLoading, setAiRankLoading] = useState(false);

  // ui
  const [adminKey, setAdminKeyState] = useState<string | null>(() => localStorage.getItem(ADMIN_KEY_LS));
  const [split, setSplit] = useState(14);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [authModal, setAuthModal] = useState<AuthModalState>({ open: false });
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const userRef = useRef(user);
  userRef.current = user;
  const tripIdRef = useRef(tripId);
  tripIdRef.current = tripId;
  const loadTokenRef = useRef(0);

  // ── Toasts ───────────────────────────────────────────────────────────────────
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const toast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      const id = ++toastSeq;
      setToasts((t) => [...t, { id, message, type }]);
      window.setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  // ── Account (global) ─────────────────────────────────────────────────────────
  const refreshMyTrips = useCallback(async () => {
    if (!userRef.current) {
      setMyTrips([]);
      return;
    }
    try {
      setMyTrips((await api.myTrips()).trips);
    } catch {
      /* ignore */
    }
  }, []);

  const loadAccount = useCallback(async () => {
    setAccountLoading(true);
    try {
      const me = (await api.me()).user;
      setUser(me);
      userRef.current = me;
      if (me) {
        setMyTrips((await api.myTrips()).trips);
        // First sign-in → auto-show the welcome tour once (gated by gp_onboarded,
        // which the tour sets when finished or skipped). Returning users skip it.
        if (!localStorage.getItem(ONBOARDED_LS)) setOnboardingOpen(true);
      }
    } catch {
      /* leave signed out */
    } finally {
      setAccountLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  // ── Enter a trip: load its meta + all entity data ────────────────────────────
  const enterTrip = useCallback(async (id: string) => {
    if (tripIdRef.current === id) return; // already active
    const token = ++loadTokenRef.current;
    setTripId(id);
    tripIdRef.current = id;
    setTripLoading(true);
    setTripError(null);
    setSelected(new Set());
    setAiOrder([]); setAiWhy({});
    setFavoriteIds(new Set()); favRef.current = new Set();
    try {
      const loadAll = () => Promise.all([
        api.getTrip(id),
        api.listings(id),
        api.votes(id),
        api.submitted(id),
        api.pipeline(id),
        api.itinerary(id),
        api.caveats(id),
        api.insights(id),
        api.final(id),
        api.favorites(id).catch(() => ({ ids: [] as string[] })),
        api.reviews(id).catch(() => ({})),
        api.tours(id).catch(() => ({})),
      ]);
      // One-shot retry: 404/403 are definitive, but a transient blip (network /
      // 5xx) shouldn't dead-end on "Could not load this trip" — retry once.
      let bundle;
      try {
        bundle = await loadAll();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) throw e;
        await new Promise((r) => setTimeout(r, 700));
        if (token !== loadTokenRef.current) return;
        bundle = await loadAll();
      }
      const [tripView, listRes, votesRes, subRes, pipeRes, itinRes, cavRes, insRes, finalRes, favRes, revRes, tourRes] = bundle;
      if (token !== loadTokenRef.current) return; // a newer enterTrip superseded us
      setTrip(tripView);
      setListings(listRes.listings);
      setVotes(votesRes);
      setSubmitted(subRes);
      setPipeline(pipeRes.listings);
      setItinerary(itinRes);
      setCaveats(cavRes);
      setInsights(insRes.analysis ? insRes : null);
      setFinal(finalRes);
      { const fset = new Set(favRes.ids); setFavoriteIds(fset); favRef.current = fset; }
      setReviewsMap(revRes);
      setToursMap(tourRes as Record<string, ListingTour>);
    } catch (e) {
      if (token !== loadTokenRef.current) return;
      setTripError(e instanceof ApiError && e.status === 404 ? 'Trip not found.' : 'Could not load this trip.');
    } finally {
      if (token === loadTokenRef.current) setTripLoading(false);
    }
  }, []);

  const refreshListings = useCallback(async () => {
    const id = tripIdRef.current;
    if (!id) return;
    try {
      setListings((await api.listings(id)).listings);
    } catch {
      /* ignore */
    }
  }, []);

  // ── 8s poll: refresh active trip's votes + final ─────────────────────────────
  const votesRef = useRef(votes);
  votesRef.current = votes;
  const finalRef = useRef(final);
  finalRef.current = final;
  const reviewsRef = useRef(reviewsMap);
  reviewsRef.current = reviewsMap;

  // Lazily fetch (and cache) review snippets for one listing — on detail-open.
  // Members only, so a view-by-link visitor can never trigger Apify spend.
  const loadReviewsFor = useCallback(async (l: Listing) => {
    const id = tripIdRef.current;
    const key = `${l?.source}:${l?.id}`;
    if (!id || !l?.url || !userRef.current || reviewsRef.current[key]) return;
    try {
      const r = await api.fetchReviews(id, String(l.source), String(l.id), String(l.url));
      if (tripIdRef.current === id) setReviewsMap((m) => ({ ...m, [key]: r }));
    } catch {
      /* leave uncached — e.g. unsupported source or guard paused */
    }
  }, []);

  // Organizer: fetch reviews for every listing still missing them.
  const refreshAllReviews = useCallback(async (force?: boolean) => {
    const id = tripIdRef.current;
    if (!id) return { fetched: 0, skipped: 0, total: 0 };
    const r = await api.refreshReviews(id, force);
    if (tripIdRef.current === id) {
      try { setReviewsMap(await api.reviews(id)); } catch { /* ignore */ }
    }
    return r;
  }, []);

  // Organizer: generate (or re-generate) a walkthrough tour for a listing.
  const generateTour = useCallback(async (listingId: string, force?: boolean) => {
    const id = tripIdRef.current;
    if (!id) return;
    const tour = await api.generateTour(id, listingId, force);
    if (tripIdRef.current === id) setToursMap((m) => ({ ...m, [listingId]: tour }));
  }, []);
  const toursRef = useRef(toursMap);
  toursRef.current = toursMap;
  useEffect(() => {
    const h = window.setInterval(async () => {
      const id = tripIdRef.current;
      if (!id) return;
      try {
        const [v, f] = await Promise.all([api.votes(id), api.final(id)]);
        if (tripIdRef.current !== id) return;
        if (JSON.stringify(v) !== JSON.stringify(votesRef.current)) setVotes(v);
        if (JSON.stringify(f) !== JSON.stringify(finalRef.current)) setFinal(f);
        // While any tour is still rendering, refresh the map so it flips to ready.
        if (Object.values(toursRef.current).some((t) => t.status !== 'ready')) {
          const tr = await api.tours(id);
          if (tripIdRef.current === id && JSON.stringify(tr) !== JSON.stringify(toursRef.current)) setToursMap(tr);
        }
      } catch {
        /* transient */
      }
    }, 8000);
    return () => window.clearInterval(h);
  }, []);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const openAuth = useCallback((reason?: string) => setAuthModal({ open: true, reason }), []);
  const closeAuth = useCallback(() => setAuthModal({ open: false }), []);
  const requireSignIn = useCallback(
    (action?: string) => {
      if (userRef.current) return true;
      openAuth(action);
      return false;
    },
    [openAuth],
  );
  const signOut = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setUser(null);
    userRef.current = null;
    setMyTrips([]);
    toast('Signed out.', 'info');
  }, [toast]);
  const rename = useCallback(
    async (name: string) => {
      const res = await api.rename(name);
      setUser(res.user);
      toast('Name updated.', 'success');
    },
    [toast],
  );

  const setAvatar = useCallback(
    async (avatar: string | null) => {
      try { const res = await api.setAvatar(avatar); setUser(res.user); }
      catch (e) { toast(e instanceof Error ? e.message : 'Could not update avatar.', 'error'); }
    },
    [toast],
  );

  // ── Trips ────────────────────────────────────────────────────────────────────
  const createTrip = useCallback(async (input: CreateTripInput) => {
    const created = await api.createTrip(input);
    setMyTrips((t) => [created, ...t.filter((x) => x.id !== created.id)]);
    return created;
  }, []);
  const joinTrip = useCallback(
    async (id: string, code?: string) => {
      try {
        const updated = await api.joinTrip(id, code);
        setTrip((cur) => (cur && cur.id === id ? updated : cur));
        await refreshMyTrips();
        toast('You joined the trip.', 'success');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not join.', 'error');
      }
    },
    [refreshMyTrips, toast],
  );

  const deleteTrip = useCallback(async (id: string) => {
    await api.deleteTrip(id);
    setMyTrips((t) => t.filter((x) => x.id !== id));
    if (tripIdRef.current === id) {
      setTrip(null);
      setTripId(null);
      tripIdRef.current = null;
    }
  }, []);

  // ── Onboarding ───────────────────────────────────────────────────────────────
  const startOnboarding = useCallback((force: boolean) => {
    if (!force && localStorage.getItem(ONBOARDED_LS)) return;
    setOnboardingOpen(true);
  }, []);
  const endOnboarding = useCallback(() => {
    setOnboardingOpen(false);
    localStorage.setItem(ONBOARDED_LS, '1');
  }, []);

  // ── Detail modal ─────────────────────────────────────────────────────────────
  const openDetail = useCallback((id: string) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);

  // Pool every candidate (community + live + curated) and dedupe at the property
  // level — the same villa from two sources collapses to one card (we keep the
  // richest copy). `aliasToCanon` maps every dropped duplicate's id to the kept
  // copy's id, so votes/picks/links cast on either copy land on the merged card.
  const { pooledListings, suppressedIds, aliasToCanon } = useMemo(() => {
    const union = [...submitted, ...pipeline, ...listings];
    const best = new Map<string, Listing>();
    const keyOf = new Map<string, string>();
    // Same distinctive name in two DIFFERENT areas = two different homes — never
    // merge those (guards against false merges like two "Sunset Retreat"s).
    const areaTok = (l: Listing) => (l.area || '').split(/[·,]/)[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    for (const l of union) {
      let k = propKey(l);
      const cur = best.get(k);
      if (cur && k.startsWith('nm:')) {
        const a = areaTok(cur), b = areaTok(l);
        if (a && b && a !== b) k = `id:${l.source}:${l.id}`;
      }
      keyOf.set(l.id, k);
      const champ = best.get(k);
      if (!champ || dataScore(l) > dataScore(champ)) best.set(k, l);
    }
    const alias = new Map<string, string>();
    for (const l of union) {
      const kept = best.get(keyOf.get(l.id)!)!;
      if (kept.id !== l.id) alias.set(l.id, kept.id);
    }
    return { pooledListings: [...best.values()], suppressedIds: new Set(alias.keys()), aliasToCanon: alias };
  }, [submitted, pipeline, listings]);

  const findListing = useCallback(
    (id: string): Listing | undefined => {
      const lookup = (x: string) => {
        // A listing can appear in more than one pool (e.g. curated + live pipeline);
        // prefer the copy that carries the distance chips, else the first match.
        const matches = [
          submitted.find((l) => l.id === x),
          pipeline.find((l) => l.id === x),
          listings.find((l) => l.id === x),
        ].filter(Boolean) as Listing[];
        return matches.find((l) => l.distances?.length) ?? matches[0];
      };
      // Resolve a suppressed duplicate's id to the displayed (canonical) copy,
      // so deep links / old votes still open the merged card.
      return lookup(aliasToCanon.get(id) ?? id) ?? lookup(id);
    },
    [submitted, pipeline, listings, aliasToCanon],
  );

  // ── Votes / picks ────────────────────────────────────────────────────────────
  const castVote = useCallback(
    async (listingId: string, dir: VoteDir) => {
      const id = tripIdRef.current;
      if (!id || !requireSignIn('vote on homes')) return;
      const current = userRef.current ? votesRef.current[listingId]?.[userRef.current.id] : null;
      const next = current === dir ? null : dir;
      try {
        setVotes(await api.vote(id, listingId, next));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { setUser(null); openAuth('vote on homes'); }
        else toast(e instanceof Error ? e.message : 'Could not save your vote.', 'error');
      }
    },
    [requireSignIn, openAuth, toast],
  );

  const toggleFinalPick = useCallback(
    async (listingId: string) => {
      const id = tripIdRef.current;
      if (!id || !requireSignIn('cast your top choice')) return;
      const next = finalRef.current.myPick === listingId ? null : listingId;
      try {
        setFinal(await api.finalVote(id, next));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { setUser(null); openAuth('cast your top choice'); }
        else toast(e instanceof Error ? e.message : 'Could not save your pick.', 'error');
      }
    },
    [requireSignIn, openAuth, toast],
  );

  const toggleFavorite = useCallback(
    async (listingId: string) => {
      const id = tripIdRef.current;
      if (!id || !requireSignIn('save this home')) return;
      const cur = favRef.current;
      const on = !cur.has(listingId);
      const next = new Set(cur);
      on ? next.add(listingId) : next.delete(listingId);
      favRef.current = next; setFavoriteIds(next); // optimistic
      try {
        const res = await api.toggleFavorite(id, listingId, on);
        const set = new Set(res.ids); favRef.current = set; setFavoriteIds(set);
      } catch (e) {
        favRef.current = cur; setFavoriteIds(cur); // revert
        if (e instanceof ApiError && e.status === 401) { setUser(null); openAuth('save this home'); }
        else toast(e instanceof Error ? e.message : 'Could not save this home.', 'error');
      }
    },
    [requireSignIn, openAuth, toast],
  );

  const setDecision = useCallback(
    async (listingId: string | null) => {
      const id = tripIdRef.current;
      if (!id) return;
      try {
        const res = await api.decision(id, listingId);
        setFinal((f) => ({ ...f, decision: res.decision }));
        toast(listingId ? 'Official pick locked.' : 'Official pick unlocked.', 'success');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not update the decision.', 'error');
      }
    },
    [toast],
  );

  // ── Submissions / caveats ────────────────────────────────────────────────────
  const submitListing = useCallback(async (url: string, price?: string) => {
    const id = tripIdRef.current;
    if (!id) throw new ApiError(0, 'No active trip.');
    const created = await api.submit(id, url, price);
    setSubmitted((s) => [...s, created]);
    return created;
  }, []);

  const postCaveat = useCallback(
    async (text: string) => {
      const id = tripIdRef.current;
      if (!id || !requireSignIn('post a caveat')) return;
      try {
        setCaveats(await api.postCaveat(id, text));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { setUser(null); openAuth('post a caveat'); }
        else toast(e instanceof Error ? e.message : 'Could not post.', 'error');
      }
    },
    [requireSignIn, openAuth, toast],
  );

  const deleteCaveat = useCallback(
    async (cid: string) => {
      const id = tripIdRef.current;
      if (!id) return;
      try { setCaveats(await api.deleteCaveat(id, cid)); setInsights((i) => (i ? { ...i, stale: true } : i)); }
      catch (e) { toast(e instanceof Error ? e.message : 'Could not delete.', 'error'); }
    },
    [toast],
  );

  const approveCaveat = useCallback(
    async (cid: string) => {
      const id = tripIdRef.current;
      if (!id) return;
      try {
        setCaveats(await api.approveCaveat(id, cid));
        setInsights((i) => (i ? { ...i, stale: true } : i)); // Scout's context changed
        toast('Criterion approved — re-ask Scout to weigh it.', 'success');
      } catch (e) { toast(e instanceof Error ? e.message : 'Could not approve.', 'error'); }
    },
    [toast],
  );

  const deleteListing = useCallback(
    async (lid: string, isSubmitted: boolean) => {
      const id = tripIdRef.current;
      if (!id) return;
      try {
        if (isSubmitted) { await api.deleteSubmitted(id, lid); setSubmitted((s) => s.filter((l) => l.id !== lid)); }
        else { await api.deleteListing(id, lid); setListings((s) => s.filter((l) => l.id !== lid)); }
        toast('Listing removed.', 'success');
      } catch (e) { toast(e instanceof Error ? e.message : 'Could not remove.', 'error'); }
    },
    [toast],
  );

  // ── Compare / itinerary ──────────────────────────────────────────────────────
  const runCompare = useCallback(
    async (items: CompareListingInput[], criteria: string, mode?: '1v1') => {
      const id = tripIdRef.current;
      if (!id) throw new ApiError(0, 'No active trip.');
      const res = await api.compare(id, items, criteria, mode);
      if (mode !== '1v1') setInsights({ analysis: res.analysis, created_at: new Date().toISOString() });
      return res.analysis;
    },
    [],
  );

  const saveItinerary = useCallback(
    async (text: string) => {
      const id = tripIdRef.current;
      if (!id) return;
      setItinerary(await api.setItinerary(id, text));
      toast(text ? 'Itinerary saved.' : 'Itinerary cleared.', 'success');
    },
    [toast],
  );

  // ── Platform admin key ───────────────────────────────────────────────────────
  const setAdminKey = useCallback(
    async (key: string): Promise<boolean> => {
      try {
        await api.adminVerify(key);
        localStorage.setItem(ADMIN_KEY_LS, key);
        setAdminKeyState(key);
        toast('Platform admin on.', 'success');
        return true;
      } catch {
        toast('Wrong admin key.', 'error');
        return false;
      }
    },
    [toast],
  );
  const clearAdminKey = useCallback(() => {
    localStorage.removeItem(ADMIN_KEY_LS);
    setAdminKeyState(null);
  }, []);
  const runPipeline = useCallback(async () => {
    const key = adminKey;
    if (!key && !userRef.current?.isSuperAdmin) return; // need a key or a super-admin session
    try { toast((await api.adminRunPipeline(key || undefined)).message || 'Pipeline started.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not start pipeline.', 'error'); }
  }, [adminKey, toast]);

  // ── Selection ────────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Votes/picks/favorites are stored server-side under whichever copy's id the
  // member happened to act on. Fold every alias onto the displayed (canonical)
  // copy so a vote on the villaway copy still counts on the merged card.
  const canonVotes = useMemo(() => {
    if (!aliasToCanon.size) return votes;
    const out: VotesMap = {};
    for (const [lid, users] of Object.entries(votes)) {
      const cid = aliasToCanon.get(lid) ?? lid;
      // a vote cast directly on the canonical id wins a per-user collision
      out[cid] = lid === cid ? { ...(out[cid] ?? {}), ...users } : { ...users, ...(out[cid] ?? {}) };
    }
    return out;
  }, [votes, aliasToCanon]);

  const canonFinal = useMemo(() => {
    if (!aliasToCanon.size) return final;
    const counts: Record<string, number> = {};
    for (const [lid, n] of Object.entries(final.counts ?? {})) {
      const cid = aliasToCanon.get(lid) ?? lid;
      counts[cid] = (counts[cid] ?? 0) + n;
    }
    return {
      ...final,
      counts,
      myPick: final.myPick ? aliasToCanon.get(final.myPick) ?? final.myPick : final.myPick,
      decision: final.decision
        ? { ...final.decision, listing_id: aliasToCanon.get(final.decision.listing_id) ?? final.decision.listing_id }
        : final.decision,
    };
  }, [final, aliasToCanon]);

  const canonFavoriteIds = useMemo(() => {
    if (!aliasToCanon.size) return favoriteIds;
    const s = new Set<string>();
    for (const id of favoriteIds) s.add(aliasToCanon.get(id) ?? id);
    return s;
  }, [favoriteIds, aliasToCanon]);

  // Liked homes — computed over the deduped pool with merged votes, so a
  // suppressed duplicate can never re-enter the shortlist under its own id.
  const shortlistIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of pooledListings) if (netVotes(canonVotes, l.id) >= 1) ids.add(l.id);
    return ids;
  }, [pooledListings, canonVotes]);

  // Rank index for O(1) "where does this home sit in the AI order" lookups.
  const aiRankIndex = useMemo(() => {
    const m = new Map<string, number>();
    aiOrder.forEach((id, i) => m.set(id, i));
    return m;
  }, [aiOrder]);

  // The "Recommended" pool: distinct homes across all three sources whose price
  // is CONFIRMED within (or within ~10% of) budget — only 'under'/'marginal'.
  // Over-budget, unknown-price (can't confirm it's affordable), and dead/test
  // listings can never be recommended. Ordered by Scout's ranking.
  const recommendedPool = useMemo(() => {
    const BIG = Number.MAX_SAFE_INTEGER;
    const decided = canonFinal.decision?.listing_id;
    return pooledListings
      .filter((l) => (l.budget === 'under' || l.budget === 'marginal') && !isDeadListing(l) && l.id !== decided)
      .map((l, i) => ({ l, i, r: aiRankIndex.get(l.id) ?? BIG }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pooledListings, aiRankIndex, canonFinal.decision]);

  // Fetch the AI ranking whenever the candidate set (or itinerary/caveats) changes.
  // Server caches by content hash, so repeat loads are free; only a real change
  // triggers a fresh Gemini spend. Debounced to coalesce the initial bursts.
  const aiSig = useMemo(
    () => `${pooledListings.map((l) => l.id).sort().join(',')}::${itinerary.updated_at ?? ''}::${caveats.filter((c) => (c.status ?? 'approved') === 'approved').length}`,
    [pooledListings, itinerary.updated_at, caveats],
  );
  useEffect(() => {
    const id = tripIdRef.current;
    if (!id || pooledListings.length < 2) { setAiOrder([]); setAiWhy({}); setAiRankLoading(false); return; }
    let cancelled = false;
    setAiRankLoading(true);
    // Project to just the fields the ranker reads — full Listing objects carry
    // 16-photo URL arrays that can blow past the server's JSON body cap.
    const compact = pooledListings.map((l) => ({
      id: l.id, name: l.name, source: l.source, bd: l.bd, ba: l.ba, sleeps: l.sleeps,
      area: l.area, distance_mi: l.distance_mi, est_5n: l.est_5n, budget: l.budget,
      pool: l.pool, hot_tub: l.hot_tub, parking: l.parking, rating: l.rating,
      reviews: l.reviews, submitted_by: l.submitted_by,
    }));
    const handle = setTimeout(() => {
      api.aiRank(id, compact)
        .then((res) => {
          if (cancelled || tripIdRef.current !== id) return;
          setAiOrder(res.order.map((o) => o.id));
          const why: Record<string, string> = {};
          for (const o of res.order) if (o.why) why[o.id] = o.why;
          setAiWhy(why);
        })
        .catch(() => { /* keep prior order; UI falls back to vote sort */ })
        .finally(() => { if (!cancelled) setAiRankLoading(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSig]);

  const value: AppContextValue = useMemo(
    () => ({
      user, myTrips, accountLoading,
      trip, tripId, isOwner: !!trip?.isOwner, tripLoading, tripError,
      // Expose the CANONICAL votes/final/favorites — alias ids merged onto the
      // displayed copy — so every consumer reads merged tallies automatically.
      listings, votes: canonVotes, submitted, pipeline, itinerary, caveats, insights, final: canonFinal, reviewsMap, toursMap,
      adminKey, split, selected, toasts, authModal, onboardingOpen, detailId, shortlistIds,
      aiOrder, aiWhy, aiRankIndex, aiRankLoading, recommendedPool, suppressedIds, pooledListings,
      favoriteIds: canonFavoriteIds, toggleFavorite,
      loadAccount, refreshMyTrips, enterTrip, refreshListings, createTrip, joinTrip, deleteTrip,
      signOut, rename, setAvatar, requireSignIn, openAuth, closeAuth,
      startOnboarding, endOnboarding, openDetail, closeDetail, findListing,
      castVote, toggleFinalPick, setDecision, submitListing, postCaveat, deleteCaveat, approveCaveat, deleteListing,
      runCompare, saveItinerary, loadReviewsFor, refreshAllReviews, generateTour, setAdminKey, clearAdminKey, runPipeline,
      toggleSelect, clearSelection, setSplit, toast, dismissToast,
    }),
    [
      user, myTrips, accountLoading, trip, tripId, tripLoading, tripError,
      listings, canonVotes, submitted, pipeline, itinerary, caveats, insights, canonFinal, reviewsMap, toursMap,
      adminKey, split, selected, toasts, authModal, onboardingOpen, detailId, shortlistIds,
      aiOrder, aiWhy, aiRankIndex, aiRankLoading, recommendedPool, suppressedIds, pooledListings,
      canonFavoriteIds, toggleFavorite,
      loadAccount, refreshMyTrips, enterTrip, refreshListings, createTrip, joinTrip, deleteTrip,
      signOut, rename, setAvatar, requireSignIn, openAuth, closeAuth,
      startOnboarding, endOnboarding, openDetail, closeDetail, findListing,
      castVote, toggleFinalPick, setDecision, submitListing, postCaveat, deleteCaveat, approveCaveat, deleteListing,
      runCompare, saveItinerary, loadReviewsFor, refreshAllReviews, generateTour, setAdminKey, clearAdminKey, runPipeline,
      toggleSelect, clearSelection, toast, dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

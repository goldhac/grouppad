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
  FinalState,
  Insights,
  Itinerary,
  Listing,
  Trip,
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
  // data
  user: User | null;
  trip: Trip | null;
  listings: Listing[];
  votes: VotesMap;
  submitted: Listing[];
  pipeline: Listing[];
  itinerary: Itinerary;
  caveats: Caveat[];
  insights: Insights | null;
  final: FinalState;

  // ui / local
  adminKey: string | null;
  split: number;
  selected: ReadonlySet<string>;
  loading: boolean;
  loadError: string | null;
  toasts: Toast[];

  // overlays
  authModal: AuthModalState;
  onboardingOpen: boolean;
  detailId: string | null;

  // derived
  shortlistIds: ReadonlySet<string>;
}

interface AppActions {
  reload: () => Promise<void>;
  // auth
  signOut: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  requireSignIn: (action?: string) => boolean;
  openAuth: (reason?: string) => void;
  closeAuth: () => void;
  // onboarding
  startOnboarding: (force: boolean) => void;
  endOnboarding: () => void;
  // detail modal
  openDetail: (id: string) => void;
  closeDetail: () => void;
  // listing resolution
  findListing: (id: string) => Listing | undefined;
  // votes / picks
  castVote: (listingId: string, dir: VoteDir) => Promise<void>;
  toggleFinalPick: (listingId: string) => Promise<void>;
  setDecision: (listingId: string | null) => Promise<void>;
  // submissions / caveats
  submitListing: (url: string, price?: string) => Promise<Listing>;
  postCaveat: (text: string) => Promise<void>;
  deleteCaveat: (id: string) => Promise<void>;
  deleteListing: (id: string, isSubmitted: boolean) => Promise<void>;
  // compare
  runCompare: (
    items: CompareListingInput[],
    criteria: string,
    mode?: '1v1',
  ) => Promise<string>;
  // itinerary
  saveItinerary: (text: string) => Promise<void>;
  // admin key
  setAdminKey: (key: string) => Promise<boolean>;
  clearAdminKey: () => void;
  runPipeline: () => Promise<void>;
  // selection
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setSplit: (n: number) => void;
  // toasts
  toast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: number) => void;
}

type AppContextValue = AppState & AppActions;

const AppContext = createContext<AppContextValue | null>(null);

const EMPTY_FINAL: FinalState = { counts: {}, total: 0, myPick: null, decision: null };

let toastSeq = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [votes, setVotes] = useState<VotesMap>({});
  const [submitted, setSubmitted] = useState<Listing[]>([]);
  const [pipeline, setPipeline] = useState<Listing[]>([]);
  const [itinerary, setItinerary] = useState<Itinerary>({ text: '', updated_at: null });
  const [caveats, setCaveats] = useState<Caveat[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [final, setFinal] = useState<FinalState>(EMPTY_FINAL);

  const [adminKey, setAdminKeyState] = useState<string | null>(
    () => localStorage.getItem(ADMIN_KEY_LS),
  );
  const [split, setSplit] = useState(14);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [authModal, setAuthModal] = useState<AuthModalState>({ open: false });
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Keep latest values available to stable callbacks / the poll without
  // re-subscribing the interval on every change.
  const adminKeyRef = useRef(adminKey);
  adminKeyRef.current = adminKey;
  const userRef = useRef(user);
  userRef.current = user;

  // ── Toasts ─────────────────────────────────────────────────────────────────
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

  // ── Initial load ─────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [meRes, listRes, votesRes, subRes, pipeRes, itinRes, cavRes, insRes, finalRes] =
        await Promise.all([
          api.me(),
          api.listings(),
          api.votes(),
          api.submitted(),
          api.pipeline(),
          api.itinerary(),
          api.caveats(),
          api.insights(),
          api.final(),
        ]);
      setUser(meRes.user);
      setTrip(listRes.trip);
      setListings(listRes.listings);
      setVotes(votesRes);
      setSubmitted(subRes);
      setPipeline(pipeRes.listings);
      setItinerary(itinRes);
      setCaveats(cavRes);
      setInsights(insRes.analysis ? insRes : null);
      setFinal(finalRes);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load GroupPad.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ── 8s poll: refresh votes + final, re-render only on change ─────────────────
  const votesRef = useRef(votes);
  votesRef.current = votes;
  const finalRef = useRef(final);
  finalRef.current = final;
  useEffect(() => {
    const t = window.setInterval(async () => {
      try {
        const [v, f] = await Promise.all([api.votes(), api.final()]);
        if (JSON.stringify(v) !== JSON.stringify(votesRef.current)) setVotes(v);
        if (JSON.stringify(f) !== JSON.stringify(finalRef.current)) setFinal(f);
      } catch {
        /* transient — ignore, next tick retries */
      }
    }, 8000);
    return () => window.clearInterval(t);
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
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setUser(null);
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

  // ── Onboarding ───────────────────────────────────────────────────────────────
  const startOnboarding = useCallback((force: boolean) => {
    if (!force && localStorage.getItem(ONBOARDED_LS)) return;
    setOnboardingOpen(true);
  }, []);
  const endOnboarding = useCallback(() => {
    setOnboardingOpen(false);
    localStorage.setItem(ONBOARDED_LS, '1');
  }, []);
  // Auto-show once for signed-out first-time visitors after load settles.
  const autoOnboardDone = useRef(false);
  useEffect(() => {
    if (loading || autoOnboardDone.current) return;
    autoOnboardDone.current = true;
    if (!userRef.current) startOnboarding(false);
  }, [loading, startOnboarding]);

  // ── Detail modal ─────────────────────────────────────────────────────────────
  const openDetail = useCallback((id: string) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);

  // ── Listing resolution (submitted/pipeline take precedence on dup ids) ───────
  const findListing = useCallback(
    (id: string): Listing | undefined =>
      submitted.find((l) => l.id === id) ??
      pipeline.find((l) => l.id === id) ??
      listings.find((l) => l.id === id),
    [submitted, pipeline, listings],
  );

  // ── Votes / picks ────────────────────────────────────────────────────────────
  const castVote = useCallback(
    async (listingId: string, dir: VoteDir) => {
      if (!requireSignIn('vote on homes')) return;
      const current = userRef.current ? votesRef.current[listingId]?.[userRef.current.id] : null;
      const next = current === dir ? null : dir; // toggle off if same
      try {
        const updated = await api.vote(listingId, next);
        setVotes(updated);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setUser(null);
          openAuth('vote on homes');
        } else {
          toast(e instanceof Error ? e.message : 'Could not save your vote.', 'error');
        }
      }
    },
    [requireSignIn, openAuth, toast],
  );

  const toggleFinalPick = useCallback(
    async (listingId: string) => {
      if (!requireSignIn('cast your top choice')) return;
      const next = finalRef.current.myPick === listingId ? null : listingId;
      try {
        setFinal(await api.finalVote(next));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setUser(null);
          openAuth('cast your top choice');
        } else {
          toast(e instanceof Error ? e.message : 'Could not save your pick.', 'error');
        }
      }
    },
    [requireSignIn, openAuth, toast],
  );

  const setDecision = useCallback(
    async (listingId: string | null) => {
      const key = adminKeyRef.current;
      if (!key) return;
      try {
        const res = await api.adminDecision(listingId, key);
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
    const created = await api.submit(url, price);
    setSubmitted((s) => [...s, created]);
    return created;
  }, []);

  const postCaveat = useCallback(
    async (text: string) => {
      if (!requireSignIn('post a caveat')) return;
      try {
        setCaveats(await api.postCaveat(text));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setUser(null);
          openAuth('post a caveat');
        } else {
          toast(e instanceof Error ? e.message : 'Could not post.', 'error');
        }
      }
    },
    [requireSignIn, openAuth, toast],
  );

  const deleteCaveat = useCallback(
    async (id: string) => {
      const key = adminKeyRef.current;
      if (!key) return;
      try {
        setCaveats(await api.adminDeleteCaveat(id, key));
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not delete.', 'error');
      }
    },
    [toast],
  );

  const deleteListing = useCallback(
    async (id: string, isSubmitted: boolean) => {
      const key = adminKeyRef.current;
      if (!key) return;
      try {
        if (isSubmitted) {
          await api.adminDeleteSubmitted(id, key);
          setSubmitted((s) => s.filter((l) => l.id !== id));
        } else {
          await api.adminDeleteListing(id, key);
          setListings((s) => s.filter((l) => l.id !== id));
        }
        toast('Listing removed.', 'success');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not remove.', 'error');
      }
    },
    [toast],
  );

  // ── Compare ──────────────────────────────────────────────────────────────────
  const runCompare = useCallback(
    async (items: CompareListingInput[], criteria: string, mode?: '1v1') => {
      const res = await api.compare(items, criteria, mode);
      if (mode !== '1v1') {
        setInsights({ analysis: res.analysis, created_at: new Date().toISOString() });
      }
      return res.analysis;
    },
    [],
  );

  // ── Itinerary ────────────────────────────────────────────────────────────────
  const saveItinerary = useCallback(
    async (text: string) => {
      const key = adminKeyRef.current;
      if (!key) return;
      const res = await api.adminSetItinerary(text, key);
      setItinerary(res);
      toast(text ? 'Itinerary saved.' : 'Itinerary cleared.', 'success');
    },
    [toast],
  );

  // ── Admin key ────────────────────────────────────────────────────────────────
  const setAdminKey = useCallback(
    async (key: string): Promise<boolean> => {
      try {
        await api.adminVerify(key);
        localStorage.setItem(ADMIN_KEY_LS, key);
        setAdminKeyState(key);
        toast('Admin mode on.', 'success');
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
    toast('Admin mode off.', 'info');
  }, [toast]);
  const runPipeline = useCallback(async () => {
    const key = adminKeyRef.current;
    if (!key) return;
    try {
      const res = await api.adminRunPipeline(key);
      toast(res.message || 'Pipeline started.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start pipeline.', 'error');
    }
  }, [toast]);

  // ── Selection ────────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // ── Derived: shortlist ids (net votes >= 1, across all pools) ────────────────
  const shortlistIds = useMemo(() => {
    const ids = new Set<string>();
    const pools = [submitted, pipeline, listings];
    for (const pool of pools) {
      for (const l of pool) {
        if (!ids.has(l.id) && netVotes(votes, l.id) >= 1) ids.add(l.id);
      }
    }
    return ids;
  }, [submitted, pipeline, listings, votes]);

  const value: AppContextValue = useMemo(
    () => ({
      user,
      trip,
      listings,
      votes,
      submitted,
      pipeline,
      itinerary,
      caveats,
      insights,
      final,
      adminKey,
      split,
      selected,
      loading,
      loadError,
      toasts,
      authModal,
      onboardingOpen,
      detailId,
      shortlistIds,
      reload,
      signOut,
      rename,
      requireSignIn,
      openAuth,
      closeAuth,
      startOnboarding,
      endOnboarding,
      openDetail,
      closeDetail,
      findListing,
      castVote,
      toggleFinalPick,
      setDecision,
      submitListing,
      postCaveat,
      deleteCaveat,
      deleteListing,
      runCompare,
      saveItinerary,
      setAdminKey,
      clearAdminKey,
      runPipeline,
      toggleSelect,
      clearSelection,
      setSplit,
      toast,
      dismissToast,
    }),
    [
      user, trip, listings, votes, submitted, pipeline, itinerary, caveats, insights, final,
      adminKey, split, selected, loading, loadError, toasts, authModal, onboardingOpen, detailId,
      shortlistIds, reload, signOut, rename, requireSignIn, openAuth, closeAuth, startOnboarding,
      endOnboarding, openDetail, closeDetail, findListing, castVote, toggleFinalPick, setDecision,
      submitListing, postCaveat, deleteCaveat, deleteListing, runCompare, saveItinerary,
      setAdminKey, clearAdminKey, runPipeline, toggleSelect, clearSelection, toast, dismissToast,
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

export function isAdmin(adminKey: string | null): boolean {
  return !!adminKey;
}

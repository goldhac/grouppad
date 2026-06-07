import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Crown, Settings, Bookmark, Moon, Sun, Star,
  SlidersHorizontal, Check, Image as ImageIcon, Home,
  BadgeCheck, MessageSquare, Plus, Sparkles, Swords, Users,
  HelpCircle, Minus, TrendingUp, Send, Lock, X, Info, Scale,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { useCompare } from '@/hooks/useCompare';
import { ComparisonModal } from '@/components/modals/ComparisonModal';
import { Icon } from '@/components/ui/Icon';
import { fmt, netVotes } from '@/lib/utils';
import { cn } from '@/lib/cn';
import type { Listing } from '@/types';

type View = 'home' | 'shortlist' | 'decision' | 'chat' | 'saved';

const B_SHORT: Record<string, string> = { under: 'Under', marginal: 'Marginal', over: 'Over', unknown: 'TBD' };

function rangeLabel(a?: string, b?: string) {
  if (!a) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  try {
    const da = new Date(a + 'T00:00:00'), db = b ? new Date(b + 'T00:00:00') : null;
    const sa = da.toLocaleDateString('en-US', opts);
    if (!db) return sa;
    const sb = db.toLocaleDateString('en-US', { day: 'numeric' });
    return `${sa} – ${sb}, ${db.getFullYear()}`;
  } catch { return ''; }
}

export function MobileBoard() {
  const {
    trip, listings, submitted, pipeline, votes, final, caveats, isOwner, split,
    favoriteIds, shortlistIds, itinerary, aiRankIndex, aiWhy, aiRankLoading,
    toggleFavorite, toggleFinalPick, setDecision, openDetail, requireSignIn, postCaveat,
    submitListing, toast, selected, toggleSelect, clearSelection, setSplit, startOnboarding,
  } = useApp();
  const compare = useCompare();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('home');
  const [filters, setFilters] = useState({ under: false, pool: false, parking: false, manual: true });
  const [sheet, setSheet] = useState<'add' | 'filter' | null>(null);
  const [addUrl, setAddUrl] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [adding, setAdding] = useState(false);

  const openAdd = () => { if (requireSignIn('add a home')) setSheet('add'); };
  const addHome = async () => {
    if (!addUrl.trim()) { toast('Paste a listing URL first.', 'error'); return; }
    setAdding(true);
    try { await submitListing(addUrl.trim(), addPrice.trim() || undefined); toast('Added to your group’s board.', 'success'); setSheet(null); setAddUrl(''); setAddPrice(''); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not add that link.', 'error'); }
    finally { setAdding(false); }
  };
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');

  const ppOf = (l: Listing) => (l.est_5n ? fmt(Math.ceil(l.est_5n / Math.max(1, split))) : null);
  const netOf = (l: Listing) => netVotes(votes, l.id);
  const shortName = (n: string) => n.split(/[·,]/)[0].trim().split(' ').slice(0, 4).join(' ');
  const areaShort = (a?: string) => (a ? a.split('·')[0].trim() : '');

  const passes = (l: Listing) => {
    if (filters.under && !(l.budget === 'under' || l.budget === 'marginal')) return false;
    if (filters.pool && l.pool !== 'yes') return false;
    if (filters.parking && l.parking !== 'yes') return false;
    if (!filters.manual && l.budget === 'unknown') return false;
    return true;
  };
  const visible = useMemo(() => {
    const rows = listings.filter((l) => !shortlistIds.has(l.id) && passes(l));
    if (aiRankIndex.size) {
      const BIG = Number.MAX_SAFE_INTEGER;
      return rows
        .map((l, i) => ({ l, i, r: aiRankIndex.get(l.id) ?? BIG }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map((x) => x.l);
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, shortlistIds, filters, aiRankIndex]);
  const shortlist = useMemo(() => [...listings, ...submitted].filter((l) => shortlistIds.has(l.id)), [listings, submitted, shortlistIds]);
  const savedItems = useMemo(() => [...listings, ...submitted, ...pipeline].filter((l) => favoriteIds.has(l.id)), [listings, submitted, pipeline, favoriteIds]);

  const groupTotal = trip?.adults || trip?.memberCount || 14;
  const votedCount = useMemo(() => {
    const s = new Set<string>();
    for (const lid of Object.keys(votes || {})) for (const u of Object.keys((votes as any)[lid] || {})) s.add(u);
    return s.size;
  }, [votes]);
  const leader = useMemo(() => {
    const pool = shortlist.length ? shortlist : listings;
    return pool.slice().sort((a, b) => ((final.counts?.[b.id] || 0) - (final.counts?.[a.id] || 0)) || (netOf(b) - netOf(a)))[0];
  }, [shortlist, listings, final.counts, votes]);
  const official = final.decision?.listing_id ? listings.find((l) => l.id === final.decision!.listing_id) : null;
  const pct = Math.round((votedCount / Math.max(1, groupTotal)) * 100);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('gp_theme', next); } catch { /* ignore */ }
    setTheme(next);
  };
  // ---- pieces ----
  const ring = (
    <div className="ring">
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--surface-sunken)" strokeWidth="4" />
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={(2 * Math.PI * 18).toFixed(1)} strokeDashoffset={(2 * Math.PI * 18 * (1 - pct / 100)).toFixed(1)} />
      </svg>
      <span className="pct tnum">{pct}%</span>
    </div>
  );

  const pulse = official ? (
    <div className="pulse locked" onClick={() => setView('decision')}>
      <div className="seal"><Icon icon={BadgeCheck} className="ico" /></div>
      <div className="who">
        <div className="k"><Icon icon={BadgeCheck} className="ico" /> Official pick · locked</div>
        <div className="nm">{shortName(official.name)}</div>
        <div className="sub"><b>{fmt(official.est_5n)}</b> all-in · <b>{ppOf(official)}</b>/person</div>
      </div>
      <span className="go"><Icon icon={ChevronRight} className="ico" /></span>
    </div>
  ) : leader ? (
    <div className="pulse" onClick={() => setView('decision')}>
      {ring}
      <div className="who">
        <div className="k"><Icon icon={Star} className="ico" /> Current leader · {votedCount}/{groupTotal} voted</div>
        <div className="nm">{shortName(leader.name)}</div>
        <div className="sub"><b>{final.counts?.[leader.id] || 0} top votes</b> · {ppOf(leader) || '—'}/person</div>
      </div>
      <span className="go"><Icon icon={ChevronRight} className="ico" /></span>
    </div>
  ) : null;

  const fchip = (k: 'under' | 'pool' | 'parking', t: string) => (
    <button className={cn('fchip', filters[k] && 'on')} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}>
      {filters[k] && <Icon icon={Check} className="ico" />}{t}
    </button>
  );
  const activeFilters = (filters.under ? 1 : 0) + (filters.pool ? 1 : 0) + (filters.parking ? 1 : 0) + (!filters.manual ? 1 : 0);

  function mcard(l: Listing, opts: { compact?: boolean; by?: boolean } = {}) {
    const isOff = official?.id === l.id;
    const b = l.budget || 'unknown';
    const rt = opts.by ? null : (l.rating
      ? <span className="rt"><Icon icon={Star} className="ico" /> {l.rating}</span>
      : <span className="rt none"><Icon icon={Star} className="ico" /> New</span>);
    return (
      <article key={l.id} className={cn('mcard', opts.compact && 'compact')} onClick={() => openDetail(l.id)} role="button" tabIndex={0}>
        <div className="ph">
          <div className="fb"><Icon icon={ImageIcon} className="ico" /></div>
          {l.photos?.[0] && <img src={l.photos[0]} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
          {isOff
            ? <span className="ribbon"><Icon icon={BadgeCheck} className="ico" /> Official pick</span>
            : <div className="tagL"><span className={`pchip ${b}`}><Icon icon={b === 'under' ? Check : b === 'over' ? TrendingUp : b === 'unknown' ? HelpCircle : Minus} className="ico" /> {B_SHORT[b]}</span></div>}
          <button className={cn('save', selected.has(l.id) && 'on')} style={{ right: 52 }} onClick={(e) => { e.stopPropagation(); toggleSelect(l.id); }} aria-label="Select to compare" title="Compare">
            <Icon icon={Scale} className="ico" />
          </button>
          <button className={cn('save', favoriteIds.has(l.id) && 'on')} onClick={(e) => { e.stopPropagation(); if (requireSignIn('save')) void toggleFavorite(l.id); }} aria-label="Save">
            <Icon icon={Bookmark} className="ico" />
          </button>
          <div className="dots"><i className="act" /><i /><i /><i /></div>
        </div>
        <div className="info">
          <div className="row1"><span className="nm">{shortName(l.name)}</span>{rt}</div>
          <div className="sub">{opts.by ? `${areaShort(l.area)} · sleeps ${l.sleeps ?? '—'}` : `${l.source} · ${areaShort(l.area)} · sleeps ${l.sleeps ?? '—'}`}</div>
          <div className="pr">
            {l.est_5n ? <span className="amt tnum">{fmt(l.est_5n)}</span> : <span className="amt">Price on inquiry</span>}
            {opts.by
              ? <span className="by"><span className="av">{(l.submitted_by || 'G').slice(0, 1)}</span> {l.submitted_by}</span>
              : (l.est_5n ? <>total · <span className={cn('pp', l.budget === 'over' ? 'bad' : 'ok')}>{ppOf(l)}/person</span></> : null)}
          </div>
          {!opts.compact && aiWhy[l.id] && (
            <div className="ai-why"><Icon icon={Sparkles} className="ico" /><span>{aiWhy[l.id]}</span></div>
          )}
        </div>
      </article>
    );
  }

  // ---- views ----
  const homeView = (
    <>
      {pulse}
      <div className="sec">
        <div className="sec-h"><span className="t">Recommended</span><span className="c tnum">{visible.length} homes</span></div>
        <div className="sec-sub">{aiRankLoading ? 'Scout is ranking these for your group…' : aiRankIndex.size ? 'Ranked by Scout for your itinerary · tap any home for the full breakdown' : 'Curated & ranked for your group · tap any home for the full breakdown'}</div>
        {visible.length
          ? <div className="list">{visible.map((l) => mcard(l))}</div>
          : <div className="empty"><div className="ec"><Icon icon={Home} className="ico" /></div><h3>No homes match</h3><p>Loosen the filters to see more.</p><button className="btn btn-ghost" onClick={() => setFilters({ under: false, pool: false, parking: false, manual: true })}>Clear filters</button></div>}
      </div>
      {submitted.length > 0 && (
        <div className="sec">
          <div className="sec-h"><span className="t">From your group</span><span className="c tnum">{submitted.length}</span></div>
          <div className="sec-sub">Member-added · they rise into the shortlist once liked · swipe →</div>
          <div className="hrow">{submitted.map((l) => mcard(l, { compact: true, by: true }))}</div>
        </div>
      )}
      {pipeline.length > 0 && (
        <div className="sec">
          <div className="sec-h"><span className="t">More LA homes</span><span className="c tnum">{pipeline.length}</span></div>
          <div className="sec-sub">Auto-refreshed from Airbnb &amp; VRBO · swipe →</div>
          <div className="hrow">{pipeline.map((l) => mcard(l, { compact: true }))}</div>
        </div>
      )}
    </>
  );

  const aiCard = (
    <div className="ai-card">
      <div className="ah"><div className="sp"><Icon icon={Sparkles} className="ico" /></div><div><div className="at">Compare with Scout</div><div className="as">Ranks the shortlist against your group's criteria</div></div></div>
      {caveats.length > 0 && <div className="crit">{caveats.slice(0, 6).map((c) => <span key={c.id} className="c">{c.text}</span>)}</div>}
      <div className="acts">
        <button className="btn btn-primary btn-sm" onClick={() => { if (requireSignIn('compare with Scout')) void compare.runWhole(shortlist); }} disabled={!shortlist.length || compare.running}><Icon icon={Sparkles} className="ico" /> {compare.running ? 'Thinking…' : `Ask Scout (${shortlist.length})`}</button>
        {selected.size >= 2
          ? <button className="btn btn-ghost btn-sm" onClick={() => void compare.runSelected(selected.size === 2 ? '1v1' : 'multi')} disabled={compare.running}><Icon icon={Swords} className="ico" /> Compare {selected.size}</button>
          : <button className="btn btn-ghost btn-sm" disabled><Icon icon={Swords} className="ico" /> 1v1 · pick 2</button>}
      </div>
    </div>
  );

  const shortlistView = (
    <div className="sec">
      <div className="sec-h"><span className="t">Group's Shortlist</span><span className="c tnum">{shortlist.length}</span></div>
      <div className="sec-sub">Net-likes ≥ 1 · rises automatically from the group's votes</div>
      {aiCard}
      {shortlist.length
        ? <div className="list" style={{ marginTop: 16 }}>{shortlist.map((l) => mcard(l))}</div>
        : <div className="empty"><div className="ec"><Icon icon={Star} className="ico" /></div><h3>No finalists yet</h3><p>Homes rise here once they reach <b>net +1</b> likes.</p><button className="btn btn-primary" onClick={() => setView('home')}><Icon icon={Home} className="ico" /> Browse homes</button></div>}
    </div>
  );

  const savedView = (
    <div className="sec">
      <div className="sec-h"><span className="t">Saved</span>{savedItems.length > 0 && <span className="c tnum">{savedItems.length}</span>}</div>
      <div className="sec-sub">Private to you — bookmarked homes only you can see</div>
      {savedItems.length >= 2 && (
        <div className="ai-card">
          <div className="ah"><div className="sp"><Icon icon={Sparkles} className="ico" /></div><div><div className="at">Ask Scout — for me</div><div className="as">Ranks your saved homes by your priorities · private, doesn't touch the group</div></div></div>
          <div className="acts">
            <button className="btn btn-primary btn-sm" onClick={() => { if (requireSignIn('rank your saved')) void compare.runWhole(savedItems); }} disabled={compare.running}><Icon icon={Sparkles} className="ico" /> {compare.running ? 'Thinking…' : `Rank my ${savedItems.length} saved`}</button>
            {selected.size >= 2 && <button className="btn btn-ghost btn-sm" onClick={() => void compare.runSelected(selected.size === 2 ? '1v1' : 'multi')} disabled={compare.running}><Icon icon={Swords} className="ico" /> Compare {selected.size}</button>}
          </div>
        </div>
      )}
      {savedItems.length
        ? <div className="list" style={{ marginTop: 8 }}>{savedItems.map((l) => mcard(l))}</div>
        : <div className="empty"><div className="ec"><Icon icon={Bookmark} className="ico" /></div><h3>Nothing saved yet</h3><p>Tap the bookmark on any home to keep your own private shortlist.</p><button className="btn btn-primary" onClick={() => setView('home')}><Icon icon={Home} className="ico" /> Browse homes</button></div>}
    </div>
  );

  const decisionView = (
    <div className="sec">
      <div className="sec-h"><span className="t">Decision</span></div>
      <div className="sec-sub">Where the group is landing — one official pick when you're ready</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
        {official && (
          <div className="official-banner"><div className="seal"><Icon icon={BadgeCheck} className="ico" /></div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="k"><span className="gd" /> Official pick · locked</div>
              <div className="nm">{shortName(official.name)}</div>
              <div className="mt"><span className="tnum">{fmt(official.est_5n)} all-in</span><span className="tnum">{ppOf(official)}/person</span></div></div>
            {isOwner && <button className="btn btn-sm" onClick={() => void setDecision(null)}><Icon icon={Lock} className="ico" /></button>}
          </div>
        )}
        <div className="lb">
          <div className="lb-h"><span className="t">Group decision</span><span className="s">one ⭐ each · private</span></div>
          <div className="lb-prog"><span><Icon icon={Users} className="ico" /> Top-choice votes in</span><b className="tnum">{votedCount} of {groupTotal}</b></div>
          <div className="ptrack"><div className="pfill" style={{ width: `${pct}%` }} /></div>
          <div style={{ marginTop: 6 }}>
            {(shortlist.length ? shortlist : listings.slice(0, 4)).slice(0, 4).sort((a, b) => (final.counts?.[b.id] || 0) - (final.counts?.[a.id] || 0)).map((l, i) => {
              const tv = final.counts?.[l.id] || 0; const max = Math.max(5, ...shortlist.map((x) => final.counts?.[x.id] || 0));
              return (
                <div key={l.id} className={cn('lb-bar', i === 0 && 'lead')}>
                  <span className="rk tnum">{i + 1}</span>
                  <div><div className="nm">{i === 0 && <Icon icon={Star} className="ico" />}{shortName(l.name)}</div><div className="tk"><div className="f" style={{ width: `${Math.max(7, (tv / max) * 100)}%` }} /></div></div>
                  <span className="tl tnum">{tv} <span>votes</span></span>
                </div>
              );
            })}
          </div>
          {leader && (isOwner
            ? <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => void setDecision(leader.id)}><Icon icon={BadgeCheck} className="ico" /> Make “{shortName(leader.name)}” official</button>
            : <button className="btn btn-ghost" style={{ width: '100%', marginTop: 14 }} onClick={() => { if (requireSignIn('cast your top choice')) void toggleFinalPick(leader.id); }}><Icon icon={Star} className="ico" /> Cast my top choice</button>)}
        </div>
        {aiCard}
      </div>
    </div>
  );

  const [draft, setDraft] = useState('');
  const chatView = (
    <div className="sec">
      <div className="sec-h"><span className="t">Discussion</span><span className="c tnum">{caveats.length}</span></div>
      <div className="sec-sub">Must-haves &amp; dealbreakers — these feed Scout's ranking</div>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', margin: '8px 0 4px' }} onClick={() => startOnboarding(true)}><Icon icon={HelpCircle} className="ico" /> Show me around — replay the tour</button>
      <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '4px 15px', marginTop: 4 }}>
        {caveats.map((c) => (
          <div key={c.id} className="cv"><span className="av">{(c.name || '?').slice(0, 1)}</span>
            <div style={{ flex: 1, minWidth: 0 }}><div className="who">{c.name}</div><div className="txt">{c.text}</div></div></div>
        ))}
        {!caveats.length && <div className="txt" style={{ padding: '12px 0', color: 'var(--text-muted)' }}>No criteria yet — add the group's must-haves below.</div>}
      </div>
      <div className="cv-post">
        <input className="field" placeholder="Add a must-have or dealbreaker…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn btn-primary btn-icon" onClick={() => { if (draft.trim() && requireSignIn('post')) { void postCaveat(draft.trim()); setDraft(''); } }}><Icon icon={Send} className="ico" /></button>
      </div>
      {itinerary?.text && (<><div className="sec-h" style={{ marginTop: 24 }}><span className="t">Trip itinerary</span></div><div className="itin"><p style={{ whiteSpace: 'pre-wrap' }}>{itinerary.text}</p></div></>)}
    </div>
  );

  const navItem = (v: View, icon: typeof Home, label: string, pip?: number) => (
    <div className={cn('nav-item', view === v && 'on')} onClick={() => setView(v)}>
      <Icon icon={icon} className="ico" /><span className="lab">{label}</span>{pip != null && pip > 0 && <span className="pip tnum">{pip}</span>}
    </div>
  );

  const cmpBar = selected.size > 0 && (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 50px)', zIndex: 42, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--surface-overlay)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--border)', boxShadow: '0 -6px 16px -8px rgba(0,0,0,0.18)' }}>
      <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{selected.size} to compare</span>
      <span style={{ flex: 1 }} />
      <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
      <button className="btn btn-primary btn-sm" disabled={selected.size < 2 || compare.running} onClick={() => void compare.runSelected(selected.size === 2 ? '1v1' : 'multi')}><Icon icon={Scale} className="ico" /> Compare {selected.size}</button>
    </div>
  );

  return (
    <>
    <div className="gp-mobile">
      <div className="mb">
        <div className="tbar">
          <div className="trip-sw" onClick={() => navigate('/trips')}>
            <span className="backmk"><Icon icon={ChevronLeft} className="ico" /></span>
            <div className="nm"><div className="t">{trip?.name}</div><div className="s">{rangeLabel(trip?.checkin, trip?.checkout_5n)} · {trip?.adults} guests</div></div>
          </div>
          <span className="spacer" />
          {isOwner && <span className="role-pill"><Icon icon={Crown} className="ico" /> Host</span>}
          {isOwner && <button className="iconbtn" onClick={() => trip && navigate(`/t/${trip.id}/manage`)} aria-label="Manage"><Icon icon={Settings} className="ico" /></button>}
          <button className={cn('iconbtn', view === 'saved' && 'on')} onClick={() => setView('saved')} aria-label="Saved"><Icon icon={Bookmark} className="ico" />{favoriteIds.size > 0 && <span className="hbadge tnum">{favoriteIds.size}</span>}</button>
          <button className="iconbtn" onClick={toggleTheme} aria-label="Theme"><Icon icon={theme === 'dark' ? Sun : Moon} className="ico" /></button>
        </div>

        {view === 'home' && (
          <div className="fchips">
            <button className="fbtn" onClick={() => setSheet('filter')}><Icon icon={SlidersHorizontal} className="ico" /> Filters{activeFilters > 0 && <span className="dotn tnum">{activeFilters}</span>}</button>
            {fchip('under', 'Under budget')}{fchip('pool', 'Pool')}{fchip('parking', 'Parking')}
          </div>
        )}

        <div className="mb-scroll">
          {view === 'home' && homeView}
          {view === 'shortlist' && shortlistView}
          {view === 'saved' && savedView}
          {view === 'decision' && decisionView}
          {view === 'chat' && chatView}
        </div>

        {cmpBar}
        <div className="mb-nav">
          {navItem('home', Home, 'Homes')}
          {navItem('shortlist', Star, 'Shortlist', shortlist.length)}
          <div className="nav-add" onClick={openAdd}><div className="fab"><Icon icon={Plus} className="ico" /></div><div className="lab">Add</div></div>
          {navItem('decision', BadgeCheck, 'Decision')}
          {navItem('chat', MessageSquare, 'Chat', caveats.length)}
        </div>
      </div>

      {sheet === 'add' && (
        <>
          <div className="scrim show" onClick={() => setSheet(null)} />
          <div className="sheet show"><div className="grab" />
            <div className="sh-head"><h3>Add a listing</h3><button className="iconbtn x" onClick={() => setSheet(null)} aria-label="Close"><Icon icon={X} className="ico" /></button></div>
            <div className="field-wrap"><label className="field-label">Listing URL</label><input className="field" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="Paste Airbnb / VRBO / Booking URL…" autoComplete="off" /></div>
            <div className="field-wrap" style={{ marginTop: 12 }}><label className="field-label">Nightly all-in (optional)</label><input className="field" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} placeholder="$5,540" inputMode="decimal" /></div>
            <div className="so-hint"><Icon icon={Info} className="ico" /> Adds to <b>your group's submissions</b> — it rises into the shortlist once it reaches net +1 likes.</div>
            <div className="sh-foot"><button className="btn btn-ghost" onClick={() => setSheet(null)}>Cancel</button><button className="btn btn-primary" onClick={() => void addHome()} disabled={adding}><Icon icon={Plus} className="ico" /> {adding ? 'Adding…' : 'Add to board'}</button></div>
          </div>
        </>
      )}

      {sheet === 'filter' && (
        <>
          <div className="scrim show" onClick={() => setSheet(null)} />
          <div className="sheet show"><div className="grab" />
            <div className="sh-head"><h3>Filters &amp; split</h3><button className="iconbtn x" onClick={() => setSheet(null)} aria-label="Close"><Icon icon={X} className="ico" /></button></div>
            <div className="sh-sec"><div className="lbl">Show only</div><div className="chip-list">
              {([['under', 'Under budget'], ['pool', 'Pool required'], ['parking', 'Parking required'], ['manual', 'Include “check manually”']] as const).map(([k, t]) => (
                <label key={k} className={cn('chip-filter', (k === 'manual' ? filters.manual : filters[k]) && 'on')} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}><span className="box"><Icon icon={Check} className="ico" /></span> {t}</label>
              ))}
            </div></div>
            <div className="sh-sec"><div className="lbl">Split cost between</div><div className="split-row"><input type="range" min={2} max={20} value={split} onChange={(e) => setSplit(Number(e.target.value))} /><span className="val tnum">{split} people</span></div></div>
            <div className="sh-foot"><button className="btn btn-ghost" onClick={() => { setFilters({ under: false, pool: false, parking: false, manual: true }); }}>Reset</button><button className="btn btn-primary" onClick={() => setSheet(null)}>Show {visible.length} homes</button></div>
          </div>
        </>
      )}
    </div>
    <ComparisonModal compare={compare} />
    </>
  );
}

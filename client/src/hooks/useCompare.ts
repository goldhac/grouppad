import { useCallback, useState } from 'react';
import { useApp } from '@/store/AppContext';
import type { CompareListingInput, Listing } from '@/types';

export function toInput(l: Listing): CompareListingInput {
  return {
    id: l.id,
    name: l.name,
    bd: l.bd,
    ba: l.ba,
    sleeps: l.sleeps,
    area: l.area,
    distance_mi: l.distance_mi,
    est_5n: l.est_5n,
    displayed_5n: l.displayed_5n,
    pool: l.pool,
    hot_tub: l.hot_tub,
    parking: l.parking,
    rating: l.rating,
    reviews: l.reviews,
    url: l.url,
    amenities: l.amenities,
  };
}

export interface CompareController {
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  criteria: string;
  setCriteria: (v: string) => void;
  /** AI analysis text for the active selection-based comparison (modal). */
  result: string | null;
  /** The listings the active result compares — drives the VS columns. */
  comparedListings: Listing[] | null;
  /** '1v1' shows the head-to-head VS layout; 'multi' shows a column grid. */
  resultMode: '1v1' | 'multi' | null;
  running: boolean;
  error: string | null;
  runWhole: (items: Listing[]) => Promise<void>;
  runSelected: (mode: 'multi' | '1v1') => Promise<void>;
  /** Dismiss the comparison result + clear the selection ("when done it disappears"). */
  dismissResult: () => void;
}

/** Single source of truth for the AI compare panel + selection-based compares. */
export function useCompare(): CompareController {
  const { selected, findListing, runCompare, clearSelection, toast } = useApp();
  const [panelOpen, setPanelOpen] = useState(false);
  const [criteria, setCriteria] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [comparedListings, setComparedListings] = useState<Listing[] | null>(null);
  const [resultMode, setResultMode] = useState<'1v1' | 'multi' | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runWhole = useCallback(
    async (items: Listing[]) => {
      if (items.length < 2) {
        setError('Add at least 2 homes to compare.');
        toast('Add at least 2 homes to compare.', 'error');
        return;
      }
      // Drive the result modal (web + mobile) AND the shared Insights block, so
      // there's immediate feedback everywhere — mobile has no Insights panel.
      setRunning(true);
      setError(null);
      setResult(null);
      setComparedListings(items);
      setResultMode('multi');
      try {
        const analysis = await runCompare(items.map(toInput), criteria);
        setResult(analysis);
        setPanelOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Compare failed.');
        setComparedListings(null);
        setResultMode(null);
        toast('Compare failed.', 'error');
      } finally {
        setRunning(false);
      }
    },
    [criteria, runCompare, toast],
  );

  const runSelected = useCallback(
    async (mode: 'multi' | '1v1') => {
      const items = [...selected].map((id) => findListing(id)).filter(Boolean) as Listing[];
      if (mode === '1v1' && items.length !== 2) {
        setError('Pick exactly 2 homes for a 1v1.');
        return;
      }
      if (items.length < 2) {
        setError('Pick at least 2 homes to compare.');
        return;
      }
      setRunning(true);
      setError(null);
      setResult(null);
      setComparedListings(items);
      setResultMode(mode === '1v1' ? '1v1' : 'multi');
      try {
        const analysis = await runCompare(
          items.map(toInput),
          criteria,
          mode === '1v1' ? '1v1' : undefined,
        );
        setResult(analysis);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Compare failed.');
        setComparedListings(null);
        setResultMode(null);
        toast('Compare failed.', 'error');
      } finally {
        setRunning(false);
      }
    },
    [selected, findListing, runCompare, criteria, toast],
  );

  const dismissResult = useCallback(() => {
    setResult(null);
    setComparedListings(null);
    setResultMode(null);
    setError(null);
    clearSelection();
  }, [clearSelection]);

  return {
    panelOpen,
    setPanelOpen,
    criteria,
    setCriteria,
    result,
    comparedListings,
    resultMode,
    running,
    error,
    runWhole,
    runSelected,
    dismissResult,
  };
}

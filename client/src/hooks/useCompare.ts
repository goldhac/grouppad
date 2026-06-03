import { useCallback, useState } from 'react';
import { useApp } from '@/store/AppContext';
import type { CompareListingInput, Listing } from '@/types';

function toInput(l: Listing): CompareListingInput {
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
  result: string | null;
  running: boolean;
  error: string | null;
  runWhole: (items: Listing[]) => Promise<void>;
  runSelected: (mode: 'multi' | '1v1') => Promise<void>;
}

/** Single source of truth for the AI compare panel + selection-based compares. */
export function useCompare(): CompareController {
  const { selected, findListing, runCompare, toast } = useApp();
  const [panelOpen, setPanelOpen] = useState(false);
  const [criteria, setCriteria] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runWhole = useCallback(
    async (items: Listing[]) => {
      if (items.length < 2) {
        setError('Add at least 2 homes to the shortlist to compare.');
        return;
      }
      setRunning(true);
      setError(null);
      setResult(null);
      try {
        // Whole-shortlist compare populates the shared Insights block (no local result).
        await runCompare(items.map(toInput), criteria);
        setPanelOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Compare failed.');
      } finally {
        setRunning(false);
      }
    },
    [criteria, runCompare],
  );

  const runSelected = useCallback(
    async (mode: 'multi' | '1v1') => {
      const items = [...selected].map((id) => findListing(id)).filter(Boolean) as Listing[];
      if (mode === '1v1' && items.length !== 2) {
        setError('Pick exactly 2 homes for a 1v1.');
        setPanelOpen(true);
        return;
      }
      if (items.length < 2) {
        setError('Pick at least 2 homes to compare.');
        setPanelOpen(true);
        return;
      }
      setPanelOpen(true);
      setRunning(true);
      setError(null);
      setResult(null);
      try {
        const analysis = await runCompare(
          items.map(toInput),
          criteria,
          mode === '1v1' ? '1v1' : undefined,
        );
        setResult(analysis);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Compare failed.');
        toast('Compare failed.', 'error');
      } finally {
        setRunning(false);
      }
    },
    [selected, findListing, runCompare, criteria, toast],
  );

  return {
    panelOpen,
    setPanelOpen,
    criteria,
    setCriteria,
    result,
    running,
    error,
    runWhole,
    runSelected,
  };
}

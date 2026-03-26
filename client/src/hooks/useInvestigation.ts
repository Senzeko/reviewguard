import { useState, useEffect, useCallback } from 'react';
import type { ConsoleInvestigationResponse } from '../types/investigation';
import { fetchInvestigation } from '../api/client';

export function useInvestigation(investigationId: string) {
  const [investigation, setInvestigation] =
    useState<ConsoleInvestigationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchInvestigation(investigationId);
      setInvestigation(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load investigation';
      setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [investigationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => load(true), [load]);

  return { investigation, loading, error, refetch };
}

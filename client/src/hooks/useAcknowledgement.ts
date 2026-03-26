import { useState, useMemo, useCallback } from 'react';

type SectionNum = 1 | 2 | 3 | 4 | 5;

const DEFAULT: Record<SectionNum, boolean> = {
  1: false,
  2: false,
  3: false,
  4: false,
  5: false,
};

export function useAcknowledgement() {
  const [acknowledged, setAcknowledged] =
    useState<Record<SectionNum, boolean>>({ ...DEFAULT });

  const acknowledge = useCallback((section: SectionNum) => {
    setAcknowledged((prev) => ({ ...prev, [section]: true }));
  }, []);

  const allAcknowledged = useMemo(
    () => Object.values(acknowledged).every(Boolean),
    [acknowledged],
  );

  const acknowledgedCount = useMemo(
    () => Object.values(acknowledged).filter(Boolean).length,
    [acknowledged],
  );

  const reset = useCallback(() => {
    setAcknowledged({ ...DEFAULT });
  }, []);

  return { acknowledged, acknowledge, allAcknowledged, acknowledgedCount, reset };
}

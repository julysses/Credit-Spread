'use client';

import { useState, useEffect } from 'react';

export type TickDir = 'up' | 'down' | 'flat';

export function useLiveTick(
  initial: number,
  volatility = 0.0004,
  intervalMs = 1400,
): [number, TickDir] {
  const [value, setValue] = useState(initial);
  const [dir, setDir] = useState<TickDir>('flat');

  useEffect(() => {
    const id = setInterval(() => {
      setValue(prev => {
        const delta = (Math.random() - 0.48) * volatility * prev;
        setDir(delta >= 0 ? 'up' : 'down');
        return prev + delta;
      });
    }, intervalMs + Math.random() * 400);
    return () => clearInterval(id);
  }, [volatility, intervalMs]);

  return [value, dir];
}

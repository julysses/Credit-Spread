'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { TickDir } from '@/lib/hooks/use-live-tick';

interface LiveNumberProps {
  value: number;
  dir: TickDir;
  format: (v: number) => string;
  className?: string;
}

export function LiveNumber({ value, dir, format, className }: LiveNumberProps) {
  const [flash, setFlash] = useState<TickDir | null>(null);

  useEffect(() => {
    setFlash(dir);
    const id = setTimeout(() => setFlash(null), 1100);
    return () => clearTimeout(id);
  }, [value, dir]);

  return (
    <span
      className={cn(
        'slab tabular-nums',
        flash === 'up' ? 'tick-up' : flash === 'down' ? 'tick-down' : '',
        className,
      )}
    >
      {format(value)}
    </span>
  );
}

import { cn } from '@/lib/utils';

interface BarGaugeProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  stops?: number[];
  valueText: React.ReactNode;
  barClass?: string;
  className?: string;
}

export function BarGauge({
  label,
  value,
  min = 0,
  max = 100,
  stops = [],
  valueText,
  barClass = 'bg-blue-500',
  className,
}: BarGaugeProps) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em]">{label}</div>
        <div className="slab text-sm">{valueText}</div>
      </div>
      <div className="relative h-2 bg-sd-muted rounded-full overflow-hidden">
        {stops.map((s, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-sd-line2"
            style={{ left: `${((s - min) / (max - min)) * 100}%` }}
          />
        ))}
        <div
          className={cn('absolute top-0 left-0 bottom-0 rounded-full transition-all', barClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

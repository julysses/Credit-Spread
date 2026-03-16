import { cn } from '@/lib/utils';

interface StatProps {
  label: string;
  value: string | number;
  sub?: string;
  valueClass?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function Stat({ label, value, sub, valueClass, trend }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={cn(
        'text-2xl font-bold font-mono tabular-nums',
        trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-white',
        valueClass
      )}>
        {value}
      </span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

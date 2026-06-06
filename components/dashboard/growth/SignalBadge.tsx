'use client';

type Sentiment = 'bullish' | 'neutral' | 'bearish' | 'strong_bullish' | 'strong_bearish';

interface SignalBadgeProps {
  label: string;
  sentiment?: Sentiment;
  value?: string;
  className?: string;
}

const COLORS: Record<Sentiment, string> = {
  strong_bullish: 'bg-green-500/15 border-green-500/40 text-green-400',
  bullish:        'bg-green-500/10 border-green-500/25 text-green-400',
  neutral:        'bg-gray-500/10 border-gray-500/20 text-gray-400',
  bearish:        'bg-red-500/10  border-red-500/25  text-red-400',
  strong_bearish: 'bg-red-500/15  border-red-500/40  text-red-400',
};

export function SignalBadge({ label, sentiment = 'neutral', value, className = '' }: SignalBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-[0.12em] ${COLORS[sentiment]} ${className}`}
    >
      <span>{label}</span>
      {value && <span className="opacity-80">{value}</span>}
    </span>
  );
}

export function sentimentFromScore(score: number, thresholds = { high: 70, med: 50 }): Sentiment {
  if (score >= thresholds.high + 15) return 'strong_bullish';
  if (score >= thresholds.high)      return 'bullish';
  if (score >= thresholds.med)       return 'neutral';
  if (score >= thresholds.med - 15)  return 'bearish';
  return 'strong_bearish';
}

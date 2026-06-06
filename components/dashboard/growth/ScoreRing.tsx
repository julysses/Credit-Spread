'use client';

interface ScoreRingProps {
  score: number;       // 0–100
  size?: number;       // px
  label?: string;
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 75) return '#22c55e';  // green-500
  if (score >= 60) return '#84cc16';  // lime-500
  if (score >= 45) return '#eab308';  // yellow-500
  if (score >= 30) return '#f97316';  // orange-500
  return '#ef4444';                    // red-500
}

export function ScoreRing({ score, size = 64, label, className = '' }: ScoreRingProps) {
  const clamp    = Math.max(0, Math.min(100, score));
  const r        = (size - 8) / 2;
  const circ     = 2 * Math.PI * r;
  const filled   = (clamp / 100) * circ;
  const color    = getScoreColor(clamp);

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6}
        />
        {/* Fill */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
        {/* Score text */}
        <text
          x={size / 2} y={size / 2 + 1}
          textAnchor="middle" dominantBaseline="middle"
          fill={color}
          fontSize={size < 56 ? 11 : 14}
          fontWeight="700"
          fontFamily="monospace"
        >
          {Math.round(clamp)}
        </text>
      </svg>
      {label && (
        <span className="text-[9px] uppercase tracking-[0.16em] text-gray-500 font-medium">
          {label}
        </span>
      )}
    </div>
  );
}

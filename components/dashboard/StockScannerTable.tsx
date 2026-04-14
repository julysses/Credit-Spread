'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { ScanCandidate } from '@/app/api/stocks/scan/route';

interface StockScannerTableProps {
  candidates: ScanCandidate[];
  onSelectCandidate: (c: ScanCandidate) => void;
  selectedSymbol: string | null;
  loading: boolean;
}

type SortKey = 'symbol' | 'currentPrice' | 'dayChangePct' | 'rvol' | 'rs' | 'score';

const TIER_STYLES: Record<string, string> = {
  A: 'bg-emerald-500/20 text-emerald-300 border-emerald-600/40',
  B: 'bg-blue-500/20 text-blue-300 border-blue-600/40',
  C: 'bg-yellow-500/20 text-yellow-300 border-yellow-600/40',
  PASS: 'bg-gray-800 text-gray-500 border-gray-700',
};

function RvolBadge({ rvol }: { rvol: number }) {
  const color = rvol >= 1.5 ? 'text-emerald-400' : rvol >= 1.0 ? 'text-yellow-400' : 'text-gray-500';
  return <span className={`font-mono text-xs ${color}`}>{rvol.toFixed(1)}×</span>;
}

function RSBadge({ rs }: { rs: number }) {
  const color = rs >= 1.3 ? 'text-emerald-400' : rs <= 0.7 ? 'text-red-400' : 'text-gray-400';
  return <span className={`font-mono text-xs ${color}`}>{rs.toFixed(2)}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 85 ? 'bg-emerald-500' : score >= 75 ? 'bg-blue-500' : score >= 65 ? 'bg-yellow-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-300">{score}</span>
    </div>
  );
}

export function StockScannerTable({
  candidates,
  onSelectCandidate,
  selectedSymbol,
  loading,
}: StockScannerTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...candidates].sort((a, b) => {
    let av = 0, bv = 0;
    switch (sortKey) {
      case 'symbol':       av = a.symbol.charCodeAt(0);      bv = b.symbol.charCodeAt(0); break;
      case 'currentPrice': av = a.currentPrice;               bv = b.currentPrice; break;
      case 'dayChangePct': av = a.dayChangePct;               bv = b.dayChangePct; break;
      case 'rvol':         av = a.features.rvol;              bv = b.features.rvol; break;
      case 'rs':           av = a.features.rs;                bv = b.features.rs; break;
      case 'score':        av = a.bestStrategy.score;         bv = b.bestStrategy.score; break;
    }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const SortHeader = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-300 select-none whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === col
          ? sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
          : <ChevronDown size={11} className="opacity-30" />}
      </span>
    </th>
  );

  if (loading && candidates.length === 0) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-12 bg-gray-800/40 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!loading && candidates.length === 0) {
    return (
      <div className="border border-gray-800 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">No candidates found.</p>
        <p className="text-gray-600 text-xs mt-1">Market may be in NO_TRADE regime, pre-market, or insufficient signal strength.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-800 bg-gray-900/60">
          <tr>
            <SortHeader col="symbol" label="Symbol" />
            <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Type</th>
            <SortHeader col="currentPrice" label="Price" />
            <SortHeader col="dayChangePct" label="Chg%" />
            <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 whitespace-nowrap">VWAP Δ%</th>
            <SortHeader col="rvol" label="RVOL" />
            <SortHeader col="rs" label="RS/SPY" />
            <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Strategy</th>
            <SortHeader col="score" label="Score" />
            <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500">Tier</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => {
            const isSelected = c.symbol === selectedSymbol;
            return (
              <tr
                key={c.symbol}
                onClick={() => onSelectCandidate(c)}
                className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-500/10 border-l-2 border-l-blue-500'
                    : 'hover:bg-gray-800/40'
                }`}
              >
                <td className="py-2.5 pr-3 font-bold text-white">{c.symbol}</td>
                <td className="py-2.5 pr-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                    c.type === 'etf'
                      ? 'bg-purple-500/10 text-purple-400 border-purple-600/30'
                      : 'bg-blue-500/10 text-blue-400 border-blue-600/30'
                  }`}>
                    {c.type.toUpperCase()}
                  </span>
                </td>
                <td className="py-2.5 pr-3 font-mono text-gray-200">${c.currentPrice.toFixed(2)}</td>
                <td className={`py-2.5 pr-3 font-mono text-xs ${c.dayChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {c.dayChangePct >= 0 ? '+' : ''}{c.dayChangePct.toFixed(2)}%
                </td>
                <td className={`py-2.5 pr-3 font-mono text-xs ${c.features.priceVsVwap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {c.features.priceVsVwap >= 0 ? '+' : ''}{c.features.priceVsVwap.toFixed(2)}%
                </td>
                <td className="py-2.5 pr-3"><RvolBadge rvol={c.features.rvol} /></td>
                <td className="py-2.5 pr-3"><RSBadge rs={c.features.rs} /></td>
                <td className="py-2.5 pr-3">
                  <span className="text-xs text-gray-300 whitespace-nowrap">
                    {c.bestStrategy.strategyName.length > 22
                      ? c.bestStrategy.strategyName.slice(0, 22) + '…'
                      : c.bestStrategy.strategyName}
                  </span>
                  <span className={`ml-1.5 text-[10px] font-medium ${
                    c.bestStrategy.direction === 'long' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {c.bestStrategy.direction === 'long' ? '▲' : '▼'}
                  </span>
                </td>
                <td className="py-2.5 pr-3"><ScoreBar score={c.bestStrategy.score} /></td>
                <td className="py-2.5 pr-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-bold ${TIER_STYLES[c.bestStrategy.tier] ?? TIER_STYLES.PASS}`}>
                    {c.bestStrategy.tier}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading && (
        <div className="py-2 text-center text-xs text-gray-600 border-t border-gray-800 bg-gray-900/40">
          Scanning more batches…
        </div>
      )}
    </div>
  );
}

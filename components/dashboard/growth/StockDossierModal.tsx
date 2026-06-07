'use client';

import { useState, useEffect } from 'react';
import { ScoreRing } from './ScoreRing';
import { SignalBadge } from './SignalBadge';

interface Candidate {
  symbol: string;
  companyName?: string;
  sector?: string;
  compositeScore?: number;
  momentumScore?: number;
  growthScore?: number;
  valueScore?: number;
  institutionalScore?: number;
  optionsFlowScore?: number;
  price?: string;
  priceChangePct?: string;
  rsi?: string;
  revenueGrowthPct?: string;
  epsGrowthPct?: string;
  pegRatio?: string;
  above200sma?: boolean;
  aiThesis?: string | null;
  signals?: Record<string, unknown>;
}

interface DossierLayer {
  label: string;
  icon: string;
  content: React.ReactNode;
}

interface StockDossierModalProps {
  candidate: Candidate | null;
  onClose: () => void;
}

export function StockDossierModal({ candidate, onClose }: StockDossierModalProps) {
  const [dossier, setDossier] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeLayer, setActiveLayer] = useState(0);

  useEffect(() => {
    if (!candidate) return;
    setDossier(null);
    setLoading(true);

    fetch(`/api/growth/dossier/${candidate.symbol}`)
      .then(r => r.json())
      .then(data => setDossier(data?.data?.dossier ?? null))
      .catch(() => setDossier(null))
      .finally(() => setLoading(false));
  }, [candidate?.symbol]);

  if (!candidate) return null;

  const aiMemo = (dossier?.aiMemo as string) ?? candidate.aiThesis ?? null;
  const bullCase  = dossier?.bullCase  as string | undefined;
  const bearCase  = dossier?.bearCase  as string | undefined;
  const entryStrategy = dossier?.entryStrategy as string | undefined;
  const targetRange   = dossier?.targetPriceRange as string | undefined;
  const conviction    = dossier?.convictionLevel as string | undefined;

  const fundamentalsData  = dossier?.fundamentalsData  as Record<string, unknown> | undefined;
  const valuationData     = dossier?.valuationData     as Record<string, unknown> | undefined;
  const newsData          = (dossier?.newsData ?? dossier?.layer3_news) as Record<string, unknown> | undefined;
  const institutionalData = dossier?.institutionalData as Record<string, unknown> | undefined;
  const optionsData       = dossier?.optionsData       as Record<string, unknown> | undefined;
  const technicalsData    = dossier?.technicalsData    as Record<string, unknown> | undefined;
  const sectorData        = dossier?.sectorData        as Record<string, unknown> | undefined;

  const priceChange = parseFloat(candidate.priceChangePct ?? '0');
  const rsi = parseFloat(candidate.rsi ?? '50');
  const convictionColor = conviction === 'High' ? 'text-green-400' : conviction === 'Speculative' ? 'text-yellow-400' : 'text-blue-400';
  const newsHeadlines = Array.isArray(newsData?.headlines)
    ? newsData.headlines.filter((headline): headline is string => typeof headline === 'string')
    : undefined;
  const newsSentiment = typeof newsData?.sentiment === 'string' ? newsData.sentiment : undefined;
  const nextEarnings = typeof newsData?.nextEarnings === 'string' ? newsData.nextEarnings : undefined;

  const LAYERS: DossierLayer[] = [
    {
      label: 'Fundamentals',
      icon: '📊',
      content: (
        <LayerGrid data={{
          'Revenue Growth YoY': `${candidate.revenueGrowthPct ?? '--'}%`,
          'EPS Growth YoY':     `${candidate.epsGrowthPct ?? '--'}%`,
          'PEG Ratio':          candidate.pegRatio ?? '--',
          'Gross Margin':       fundamentalsData ? `${((fundamentalsData.grossMargin as number) ?? 0).toFixed(1)}%` : '--',
          'Operating Margin':   fundamentalsData ? `${((fundamentalsData.operatingMargin as number) ?? 0).toFixed(1)}%` : '--',
          'Net Margin':         fundamentalsData ? `${((fundamentalsData.netMargin as number) ?? 0).toFixed(1)}%` : '--',
          'FCF Margin':         fundamentalsData ? `${((fundamentalsData.fcfMargin as number) ?? 0).toFixed(1)}%` : '--',
          'ROE':                fundamentalsData ? `${((fundamentalsData.roe as number) ?? 0).toFixed(1)}%` : '--',
        }} />
      ),
    },
    {
      label: 'Valuation',
      icon: '💰',
      content: (
        <LayerGrid data={{
          'P/E Ratio':          valuationData ? (valuationData.peRatio as number)?.toFixed(1) : '--',
          'Forward P/E':        valuationData ? (valuationData.forwardPe as number)?.toFixed(1) : '--',
          'P/S Ratio':          valuationData ? (valuationData.psRatio as number)?.toFixed(1) : '--',
          'EV/EBITDA':          valuationData ? (valuationData.evEbitda as number)?.toFixed(1) : '--',
          'DCF Upside':         valuationData ? `${((valuationData.dcfImpliedUpside as number) ?? 0).toFixed(1)}%` : '--',
          'Analyst Target':     valuationData ? `$${((valuationData.analystTargetPrice as number) ?? 0).toFixed(0)}` : '--',
          'Implied Upside':     valuationData ? `${((valuationData.impliedUpside as number) ?? 0).toFixed(1)}%` : '--',
          'Sector P/E':         valuationData ? (valuationData.sectorPE as number)?.toFixed(1) : '--',
        }} />
      ),
    },
    {
      label: 'News & Catalysts',
      icon: '📰',
      content: (
        <div className="space-y-3">
          {newsHeadlines?.length ? (
            newsHeadlines.map((h, i) => (
              <div key={i} className="text-[11px] text-gray-300 border-b border-sd-line/30 pb-2">{h}</div>
            ))
          ) : (
            <div className="text-[11px] text-gray-500">
              {newsSentiment === 'bullish'
                ? '📈 Recent news sentiment: positive — management tone bullish in latest transcript'
                : newsSentiment === 'bearish'
                ? '📉 Recent news sentiment: cautious — watch for guidance revisions'
                : '📰 Loading news analysis…'
              }
            </div>
          )}
          {nextEarnings && (
            <div className="text-[10px] font-mono text-yellow-400 mt-2">
              📅 Next Earnings: {nextEarnings}
            </div>
          )}
        </div>
      ),
    },
    {
      label: 'Institutional',
      icon: '🏦',
      content: (
        <LayerGrid data={{
          'Inst. Ownership':    institutionalData ? `${((institutionalData.institutionalOwnershipPct as number) ?? 0).toFixed(1)}%` : '--',
          'HF Net Change (QoQ)': institutionalData ? `${((institutionalData.hfNetShareChangePct as number) ?? 0).toFixed(1)}%` : '--',
          'Insider Net 90d':    institutionalData ? `$${(((institutionalData.insiderNetBuyDollars90d as number) ?? 0) / 1000).toFixed(0)}K` : '--',
          'Short Float':        institutionalData ? `${((institutionalData.shortFloatPct as number) ?? 0).toFixed(1)}%` : '--',
          'Days to Cover':      institutionalData ? `${((institutionalData.shortRatioDaysToCover as number) ?? 0).toFixed(1)}d` : '--',
          'Piotroski Score':    institutionalData ? (institutionalData.piotroskiScore as number)?.toString() : '--',
          'Altman Z-Score':     institutionalData ? (institutionalData.altmanZScore as number)?.toFixed(2) : '--',
          'Congress Buys':      institutionalData ? (institutionalData.congressBuys as number)?.toString() : '0',
        }} />
      ),
    },
    {
      label: 'Options Flow',
      icon: '🔥',
      content: (
        <LayerGrid data={{
          'IV Rank':            optionsData ? `${((optionsData.ivRank as number) ?? 0).toFixed(0)}%` : '--',
          'Put/Call OI':        optionsData ? (optionsData.putCallOiRatio as number)?.toFixed(2) : '--',
          'Put/Call Vol':       optionsData ? (optionsData.putCallVolumeRatio as number)?.toFixed(2) : '--',
          'Unusual Flow':       optionsData ? ((optionsData.unusualFlowFlag as boolean) ? '⚡ Yes' : 'No') : '--',
          'Implied Move':       optionsData ? `${((optionsData.impliedMoveEarnings as number) ?? 0).toFixed(1)}%` : '--',
          'Flow Score':         candidate.optionsFlowScore?.toString() ?? '--',
        }} />
      ),
    },
    {
      label: 'Technicals',
      icon: '📈',
      content: (
        <LayerGrid data={{
          'RSI(14)':            `${rsi.toFixed(1)}`,
          'vs 200 SMA':         candidate.above200sma ? '✅ Above' : '❌ Below',
          'MACD':               technicalsData ? (technicalsData.macdBullish as boolean) ? '✅ Bullish' : '⚠️ Bearish' : '--',
          'Volume Ratio':       technicalsData ? `${((technicalsData.volumeRatio as number) ?? 1).toFixed(2)}×` : '--',
          'RS vs SPY 1M':       technicalsData ? `${((technicalsData.relStrengthVsSpy1m as number) ?? 0).toFixed(1)}%` : '--',
          'Dist from 52w High': technicalsData ? `${((technicalsData.distFromHigh52w as number) ?? 0).toFixed(1)}%` : '--',
        }} />
      ),
    },
    {
      label: 'Sector & Macro',
      icon: '🌐',
      content: (
        <LayerGrid data={{
          'Sector':             candidate.sector ?? '--',
          'Sector 1d':          sectorData ? `${((sectorData.sectorChangePct as number) ?? 0).toFixed(2)}%` : '--',
          'Sector P/E':         sectorData ? (sectorData.sectorPE as number)?.toFixed(1) : '--',
          'Stock vs Sector P/E': sectorData ? (sectorData.stockVsSectorPE as string) : '--',
          'M&A Signal':         sectorData ? ((sectorData.maSignal as boolean) ? '⚡ Active' : 'None') : '--',
          'Congress Activity':  sectorData ? ((sectorData.congressSignal as boolean) ? '🏛️ Buying' : 'None') : '--',
        }} />
      ),
    },
    {
      label: 'AI Synthesis',
      icon: '🤖',
      content: (
        <div className="space-y-4">
          {conviction && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-[0.14em]">Conviction</span>
              <span className={`text-sm font-bold ${convictionColor}`}>{conviction}</span>
            </div>
          )}
          {bullCase && (
            <div>
              <div className="text-[10px] text-green-400 uppercase tracking-[0.12em] mb-1">Bull Case</div>
              <p className="text-[11px] text-gray-300 leading-relaxed">{bullCase}</p>
            </div>
          )}
          {bearCase && (
            <div>
              <div className="text-[10px] text-red-400 uppercase tracking-[0.12em] mb-1">Bear Case</div>
              <p className="text-[11px] text-gray-300 leading-relaxed">{bearCase}</p>
            </div>
          )}
          {entryStrategy && (
            <div>
              <div className="text-[10px] text-blue-400 uppercase tracking-[0.12em] mb-1">Entry Strategy</div>
              <p className="text-[11px] text-gray-300 leading-relaxed">{entryStrategy}</p>
            </div>
          )}
          {targetRange && (
            <div>
              <div className="text-[10px] text-yellow-400 uppercase tracking-[0.12em] mb-1">Target Range</div>
              <p className="text-[11px] text-gray-300">{targetRange}</p>
            </div>
          )}
          {aiMemo && !bullCase && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] mb-1">AI Memo</div>
              <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-wrap">{aiMemo}</p>
            </div>
          )}
          {!aiMemo && !bullCase && (
            <div className="text-center py-8 text-gray-600 text-sm">
              {loading ? 'Generating AI synthesis…' : 'No AI memo available for this stock today'}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full sm:w-[800px] max-h-[90vh] bg-[#0d0f14] border border-sd-line rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-sd-line shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-100">{candidate.symbol}</span>
                {candidate.sector && (
                  <span className="text-[9px] text-gray-500 uppercase tracking-[0.14em] border border-sd-line rounded px-1.5 py-0.5">
                    {candidate.sector}
                  </span>
                )}
              </div>
              {candidate.companyName && (
                <div className="text-[11px] text-gray-400 mt-0.5">{candidate.companyName}</div>
              )}
            </div>

            {candidate.price && (
              <div className="text-right ml-4">
                <div className="text-lg font-mono font-bold text-gray-100">${candidate.price}</div>
                <div className={`text-[10px] font-mono ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
                </div>
              </div>
            )}
          </div>

          {/* Score rings */}
          <div className="flex items-center gap-3 mr-2">
            <ScoreRing score={candidate.momentumScore ?? 0} size={52} label="MOM" />
            <ScoreRing score={candidate.growthScore    ?? 0} size={52} label="VAL" />
            <button onClick={onClose} className="ml-2 w-7 h-7 flex items-center justify-center rounded-full border border-sd-line text-gray-500 hover:text-gray-200 hover:border-gray-500 transition-colors">
              ✕
            </button>
          </div>
        </div>

        {/* Layer tabs */}
        <div className="flex gap-0 border-b border-sd-line overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }}>
          {LAYERS.map((layer, i) => (
            <button
              key={i}
              onClick={() => setActiveLayer(i)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap transition-colors border-b-2 ${
                activeLayer === i
                  ? 'text-gray-100 border-sd-accent'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              <span>{layer.icon}</span>
              <span className="hidden sm:inline">{layer.label}</span>
            </button>
          ))}
        </div>

        {/* Layer content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-4 bg-sd-muted rounded" style={{ width: `${70 + i * 5}%` }} />
              ))}
            </div>
          ) : (
            LAYERS[activeLayer].content
          )}
        </div>

        {/* Footer quick signals */}
        <div className="px-5 py-3 border-t border-sd-line/50 flex flex-wrap gap-1.5 shrink-0">
          {candidate.above200sma      && <SignalBadge label="↑ 200 SMA"     sentiment="bullish" />}
          {rsi >= 50 && rsi <= 70      && <SignalBadge label={`RSI ${rsi.toFixed(0)}`} sentiment="bullish" />}
          {parseFloat(candidate.revenueGrowthPct ?? '0') >= 20
            && <SignalBadge label={`Rev +${candidate.revenueGrowthPct}%`} sentiment="bullish" />}
          {(candidate.compositeScore ?? 0) >= 75 && <SignalBadge label="High Conviction" sentiment="strong_bullish" />}
          {(candidate.compositeScore ?? 0) < 50  && <SignalBadge label="Speculative"     sentiment="bearish" />}
        </div>
      </div>
    </div>
  );
}

function LayerGrid({ data }: { data: Record<string, string | number | undefined> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Object.entries(data).map(([label, value]) => (
        <div key={label} className="bg-sd-muted/40 border border-sd-line/40 rounded-lg p-3">
          <div className="text-[9px] text-gray-500 uppercase tracking-[0.14em] mb-1">{label}</div>
          <div className="text-sm font-mono font-semibold text-gray-200">{value ?? '--'}</div>
        </div>
      ))}
    </div>
  );
}

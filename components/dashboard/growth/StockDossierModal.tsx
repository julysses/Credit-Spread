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

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(num) ? num : undefined;
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

  const aiLayer = asRecord(dossier?.layer8_aiMemo);
  const aiMemo = asString(dossier?.aiMemo) ?? asString(aiLayer?.fullMemo) ?? candidate.aiThesis ?? null;
  const bullCase  = asString(dossier?.bullCase) ?? asString(aiLayer?.bullCase);
  const bearCase  = asString(dossier?.bearCase) ?? asString(aiLayer?.bearCase);
  const entryStrategy = asString(dossier?.entryStrategy) ?? asString(aiLayer?.entryStrategy);
  const targetRange   = asString(dossier?.targetPriceRange) ?? asString(aiLayer?.targetPriceRange);
  const conviction    = asString(dossier?.convictionLevel) ?? asString(aiLayer?.convictionLevel);

  const fundamentalsData  = asRecord(dossier?.fundamentalsData) ?? asRecord(dossier?.layer1_fundamentals);
  const valuationData     = asRecord(dossier?.valuationData) ?? asRecord(dossier?.layer2_valuation);
  const newsData          = asRecord(dossier?.newsData) ?? asRecord(dossier?.layer3_news);
  const institutionalData = asRecord(dossier?.institutionalData) ?? asRecord(dossier?.layer4_institutional);
  const optionsData       = asRecord(dossier?.optionsData) ?? asRecord(dossier?.layer5_options);
  const technicalsData    = asRecord(dossier?.technicalsData) ?? asRecord(dossier?.layer6_technicals);
  const sectorData        = asRecord(dossier?.sectorData) ?? asRecord(dossier?.layer7_sector);

  const priceChange = parseFloat(candidate.priceChangePct ?? '0');
  const rsi = parseFloat(candidate.rsi ?? '50');
  const convictionColor = conviction === 'High' ? 'text-green-400' : conviction === 'Speculative' ? 'text-yellow-400' : 'text-blue-400';
  const rawHeadlines = Array.isArray(newsData?.headlines)
    ? newsData.headlines
    : Array.isArray(newsData?.recentHeadlines)
    ? newsData.recentHeadlines
    : [];
  const newsHeadlines = rawHeadlines
    .map(headline => typeof headline === 'string' ? headline : asString(asRecord(headline)?.headline))
    .filter((headline): headline is string => Boolean(headline));
  const newsSentiment = asString(newsData?.sentiment) ?? asString(newsData?.overallSentiment);
  const nextEarnings = asString(newsData?.nextEarnings) ?? asString(fundamentalsData?.nextEarningsDate);

  const LAYERS: DossierLayer[] = [
    {
      label: 'Fundamentals',
      icon: '📊',
      content: (
        <LayerGrid data={{
          'Revenue Growth YoY': `${candidate.revenueGrowthPct ?? '--'}%`,
          'EPS Growth YoY':     `${candidate.epsGrowthPct ?? '--'}%`,
          'PEG Ratio':          candidate.pegRatio ?? '--',
          'Gross Margin':       fundamentalsData ? `${(asNumber(fundamentalsData.grossMargin) ?? 0).toFixed(1)}%` : '--',
          'Operating Margin':   fundamentalsData ? `${(asNumber(fundamentalsData.operatingMargin) ?? 0).toFixed(1)}%` : '--',
          'Net Margin':         fundamentalsData ? `${(asNumber(fundamentalsData.netMargin) ?? 0).toFixed(1)}%` : '--',
          'FCF Margin':         fundamentalsData ? `${(asNumber(fundamentalsData.fcfMargin) ?? 0).toFixed(1)}%` : '--',
          'ROE':                fundamentalsData ? `${(asNumber(fundamentalsData.roe) ?? 0).toFixed(1)}%` : '--',
        }} />
      ),
    },
    {
      label: 'Valuation',
      icon: '💰',
      content: (
        <LayerGrid data={{
          'P/E Ratio':          valuationData ? asNumber(valuationData.peRatio)?.toFixed(1) : '--',
          'Forward P/E':        valuationData ? asNumber(valuationData.forwardPe)?.toFixed(1) : '--',
          'P/S Ratio':          valuationData ? asNumber(valuationData.psRatio)?.toFixed(1) : '--',
          'EV/EBITDA':          valuationData ? asNumber(valuationData.evEbitda)?.toFixed(1) : '--',
          'DCF Upside':         valuationData ? `${(asNumber(valuationData.dcfImpliedUpside) ?? asNumber(valuationData.impliedUpside) ?? 0).toFixed(1)}%` : '--',
          'Analyst Target':     valuationData ? `$${(asNumber(valuationData.analystTargetPrice) ?? 0).toFixed(0)}` : '--',
          'Implied Upside':     valuationData ? `${(asNumber(valuationData.impliedUpside) ?? 0).toFixed(1)}%` : '--',
          'Sector P/E':         valuationData ? asNumber(valuationData.sectorPE)?.toFixed(1) : '--',
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
          'Inst. Ownership':    institutionalData ? `${(asNumber(institutionalData.institutionalOwnershipPct) ?? 0).toFixed(1)}%` : '--',
          'HF Net Change (QoQ)': institutionalData ? `${(asNumber(institutionalData.hfNetShareChangePct) ?? 0).toFixed(1)}%` : '--',
          'Insider Net 90d':    institutionalData ? `$${((asNumber(institutionalData.insiderNetBuyDollars90d) ?? 0) / 1000).toFixed(0)}K` : '--',
          'Short Float':        institutionalData ? `${(asNumber(institutionalData.shortFloatPct) ?? 0).toFixed(1)}%` : '--',
          'Days to Cover':      institutionalData ? `${(asNumber(institutionalData.shortRatioDaysToCover) ?? 0).toFixed(1)}d` : '--',
          'Piotroski Score':    institutionalData ? asNumber(institutionalData.piotroskiScore)?.toString() : '--',
          'Altman Z-Score':     institutionalData ? asNumber(institutionalData.altmanZScore)?.toFixed(2) : '--',
          'Congress Buys':      institutionalData ? asNumber(institutionalData.congressBuys)?.toString() : '0',
        }} />
      ),
    },
    {
      label: 'Options Flow',
      icon: '🔥',
      content: (
        <LayerGrid data={{
          'IV Rank':            optionsData ? `${(asNumber(optionsData.ivRank) ?? 0).toFixed(0)}%` : '--',
          'Put/Call OI':        optionsData ? asNumber(optionsData.putCallOiRatio)?.toFixed(2) : '--',
          'Put/Call Vol':       optionsData ? asNumber(optionsData.putCallVolumeRatio)?.toFixed(2) : '--',
          'Unusual Flow':       optionsData ? (optionsData.unusualFlowFlag === true || (asNumber(optionsData.unusualCallCount) ?? 0) + (asNumber(optionsData.unusualPutCount) ?? 0) > 0 ? '⚡ Yes' : 'No') : '--',
          'Implied Move':       optionsData ? `${(asNumber(optionsData.impliedMoveEarnings) ?? 0).toFixed(1)}%` : '--',
          'Flow Score':         (asNumber(optionsData?.flowScore) ?? candidate.optionsFlowScore)?.toString() ?? '--',
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
          'MACD':               technicalsData ? asString(technicalsData.macdStatus) ?? (technicalsData.macdBullish === true ? '✅ Bullish' : '⚠️ Bearish') : '--',
          'Volume Ratio':       technicalsData ? `${(asNumber(technicalsData.volumeRatio) ?? 1).toFixed(2)}×` : '--',
          'RS vs SPY 1M':       technicalsData ? `${(asNumber(technicalsData.relStrengthVsSpy1m) ?? 0).toFixed(1)}%` : '--',
          'Dist from 52w High': technicalsData ? `${(asNumber(technicalsData.distFromHigh52w) ?? asNumber(technicalsData.distFrom52wHighPct) ?? 0).toFixed(1)}%` : '--',
        }} />
      ),
    },
    {
      label: 'Sector & Macro',
      icon: '🌐',
      content: (
        <LayerGrid data={{
          'Sector':             asString(sectorData?.sectorName) ?? candidate.sector ?? '--',
          'Sector 1d':          sectorData ? `${(asNumber(sectorData.sectorChangePct) ?? asNumber(sectorData.sectorMomentum1m) ?? 0).toFixed(2)}%` : '--',
          'Sector P/E':         sectorData ? asNumber(sectorData.sectorPE)?.toFixed(1) : '--',
          'Stock vs Sector P/E': sectorData ? asString(sectorData.stockVsSectorPE) ?? '--' : '--',
          'M&A Signal':         sectorData ? (sectorData.maSignal === true ? '⚡ Active' : 'None') : '--',
          'Congress Activity':  sectorData ? (sectorData.congressSignal === true ? '🏛️ Buying' : 'None') : '--',
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

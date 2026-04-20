'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MorningBriefProps {
  brief: {
    date: string;
    executiveSummary: string;
    marketOverview: string;
    volatilityAnalysis: string;
    geopoliticalRisk: string;
    strategyOutlook: string;
    riskWarnings: string;
    fullText: string;
    generatedBy: string;
  };
  tradeabilityScore: number;
  newsItems: Array<{ headline: string; source: string; sentiment: string; riskImpact: string }>;
}

export function MorningBrief({ brief, tradeabilityScore, newsItems }: MorningBriefProps) {
  const scoreColor =
    tradeabilityScore >= 70 ? 'text-green-400' :
    tradeabilityScore >= 50 ? 'text-yellow-400' : 'text-red-400';

  const dateLabel = brief.date
    ? new Date(brief.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Today';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Morning Brief · {dateLabel}</CardTitle>
        <div className="flex items-center gap-2">
          <span className={`slab text-sm ${scoreColor} tabular-nums`}>{tradeabilityScore}/100</span>
          <Badge variant="outline">
            {brief.generatedBy === 'claude' ? 'AI' : brief.generatedBy === 'gpt' ? 'GPT' : 'SYS'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        <p className="text-[12.5px] text-gray-300 leading-relaxed">
          {brief.executiveSummary || brief.fullText?.slice(0, 320)}
        </p>

        {/* Brief sections */}
        <div className="space-y-3">
          {[
            { title: 'Market',    content: brief.marketOverview,      icon: '◈' },
            { title: 'Volatility', content: brief.volatilityAnalysis, icon: '◈' },
            { title: 'Geo Risk',  content: brief.geopoliticalRisk,    icon: '◈' },
            { title: 'Outlook',   content: brief.strategyOutlook,     icon: '◈' },
          ].filter(s => s.content && s.content.length > 5).slice(0, 2).map((s, i) => (
            <div key={i} className="bg-sd-muted/50 border border-sd-line/60 rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-1">{s.title}</div>
              <p className="text-[12px] text-gray-300 leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>

        {/* Risk warnings */}
        {brief.riskWarnings && brief.riskWarnings.length > 10 && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider mb-1">RISK WARNINGS</div>
            <p className="text-[12px] text-orange-200 leading-relaxed">{brief.riskWarnings}</p>
          </div>
        )}

        {/* News headlines as economic calendar */}
        {newsItems.length > 0 && (
          <div className="pt-3 border-t border-sd-line">
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-2">KEY HEADLINES</div>
            <div className="space-y-1.5">
              {newsItems.slice(0, 4).map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[12px]">
                  <span className={`mt-1 shrink-0 text-[8px] ${
                    item.riskImpact === 'high'   ? 'text-red-400' :
                    item.riskImpact === 'medium' ? 'text-yellow-400' : 'text-gray-500'
                  }`}>●</span>
                  <span className="text-gray-300 leading-relaxed flex-1 min-w-0">{item.headline}</span>
                  <span className="text-gray-600 shrink-0 font-mono text-[10px]">{item.source}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

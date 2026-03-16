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
  const scoreColor = tradeabilityScore >= 70 ? 'text-green-400' : tradeabilityScore >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Morning Brief</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Tradeability</span>
            <span className={`text-sm font-bold font-mono ${scoreColor}`}>{tradeabilityScore}/100</span>
            <Badge variant="outline" className="text-xs">
              {brief.generatedBy === 'claude' ? 'AI' : brief.generatedBy === 'gpt' ? 'GPT' : 'System'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Executive Summary */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
          <p className="text-sm text-blue-100 leading-relaxed">{brief.executiveSummary}</p>
        </div>

        {/* Brief Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <BriefSection title="Market Overview" content={brief.marketOverview} icon="📊" />
          <BriefSection title="Volatility" content={brief.volatilityAnalysis} icon="📈" />
          <BriefSection title="Geopolitical Risk" content={brief.geopoliticalRisk} icon="🌍" />
          <BriefSection title="Strategy Outlook" content={brief.strategyOutlook} icon="🎯" />
        </div>

        {/* Risk Warnings */}
        {brief.riskWarnings && brief.riskWarnings.length > 10 && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
            <div className="text-xs text-orange-400 font-semibold uppercase tracking-wider mb-1">Risk Warnings</div>
            <p className="text-sm text-orange-200">{brief.riskWarnings}</p>
          </div>
        )}

        {/* News Items */}
        {newsItems.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Key Headlines</div>
            <div className="space-y-1.5">
              {newsItems.slice(0, 4).map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 text-xs flex-shrink-0 ${
                    item.riskImpact === 'high' ? 'text-red-400' :
                    item.riskImpact === 'medium' ? 'text-yellow-400' : 'text-gray-500'
                  }`}>●</span>
                  <span className="text-gray-300 leading-relaxed">{item.headline}</span>
                  <span className="text-gray-600 flex-shrink-0">— {item.source}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BriefSection({ title, content, icon }: { title: string; content: string; icon: string }) {
  if (!content || content.length < 5) return null;
  return (
    <div className="bg-gray-800/40 rounded-lg p-3">
      <div className="text-xs text-gray-500 font-medium mb-1 flex items-center gap-1">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed">{content}</p>
    </div>
  );
}

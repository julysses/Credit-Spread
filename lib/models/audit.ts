import type { MarketConditions, TradeRecommendation } from './strategy-engine';

export interface RecommendationAuditRecord {
  generatedAt: string;
  decisionStatus: TradeRecommendation['decisionStatus'];
  strategy: TradeRecommendation['strategy'];
  tradeType: TradeRecommendation['tradeType'];
  dataConfidence: TradeRecommendation['dataConfidence'];
  spxPrice: number;
  vix: number;
  marketRegime: MarketConditions['marketRegime'];
  riskLevel: MarketConditions['riskLevel'];
  directionalBias: MarketConditions['directionalBias'];
  credit?: number;
  maxLoss?: number;
  probOfProfit?: number;
  probOfTouch?: number;
  expectedValue?: number;
  creditToWidth?: number;
  warnings: string[];
  rationale: string[];
  exitPlan: TradeRecommendation['exitPlan'];
}

export function buildRecommendationAudit(
  conditions: MarketConditions,
  recommendation: TradeRecommendation,
  rationale: string[]
): RecommendationAuditRecord {
  return {
    generatedAt: new Date().toISOString(),
    decisionStatus: recommendation.decisionStatus,
    strategy: recommendation.strategy,
    tradeType: recommendation.tradeType,
    dataConfidence: recommendation.dataConfidence,
    spxPrice: conditions.spxPrice,
    vix: conditions.vix,
    marketRegime: conditions.marketRegime,
    riskLevel: conditions.riskLevel,
    directionalBias: conditions.directionalBias,
    credit: recommendation.credit,
    maxLoss: recommendation.maxLoss,
    probOfProfit: recommendation.probOfProfit,
    probOfTouch: recommendation.probOfTouch,
    expectedValue: recommendation.expectedValue,
    creditToWidth: recommendation.creditToWidth,
    warnings: recommendation.warnings,
    rationale,
    exitPlan: recommendation.exitPlan,
  };
}

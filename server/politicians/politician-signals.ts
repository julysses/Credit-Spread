import { fetchCongressionalTrades, type CongressTrade } from '@/server/fundamentals';

export interface PoliticianTradeSignal {
  score: number;
  recentBuys: number;
  recentSells: number;
  netFlow: 'positive' | 'negative' | 'neutral';
  largestTradeRange?: string;
  trades: CongressTrade[];
  explanation: string;
}

function amountMidpoint(amount: string): number {
  const nums = amount.match(/[\d,]+/g)?.map(n => Number(n.replace(/,/g, ''))).filter(Number.isFinite) ?? [];
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  if (nums.length === 1) return nums[0];
  return 0;
}

export async function fetchPoliticianSignal(symbol: string): Promise<PoliticianTradeSignal> {
  const trades = await fetchCongressionalTrades(symbol);
  return computePoliticianSignal(trades);
}

export function computePoliticianSignal(trades: CongressTrade[]): PoliticianTradeSignal {
  const recent = trades.filter(t => {
    const d = new Date(t.transactionDate || t.disclosureDate).getTime();
    return Number.isFinite(d) && Date.now() - d <= 120 * 86400000;
  });

  const buys = recent.filter(t => t.type === 'purchase');
  const sells = recent.filter(t => t.type === 'sale');
  const buyDollars = buys.reduce((s, t) => s + amountMidpoint(t.amount), 0);
  const sellDollars = sells.reduce((s, t) => s + amountMidpoint(t.amount), 0);
  const largest = [...recent].sort((a, b) => amountMidpoint(b.amount) - amountMidpoint(a.amount))[0]?.amount;

  let score = 50;
  score += Math.min(20, buys.length * 6);
  score -= Math.min(20, sells.length * 5);
  if (buyDollars > sellDollars * 1.5 && buyDollars > 0) score += 12;
  if (sellDollars > buyDollars * 1.5 && sellDollars > 0) score -= 12;
  if (new Set(buys.map(t => t.name)).size >= 2) score += 8;
  if (buys.some(t => Date.now() - new Date(t.transactionDate || t.disclosureDate).getTime() <= 30 * 86400000)) score += 5;

  const netFlow = buyDollars > sellDollars ? 'positive' : sellDollars > buyDollars ? 'negative' : 'neutral';
  const explanation = recent.length === 0
    ? 'No recent congressional transaction disclosures found.'
    : `${buys.length} recent buy(s), ${sells.length} recent sell(s); estimated disclosed flow is ${netFlow}.`;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    recentBuys: buys.length,
    recentSells: sells.length,
    netFlow,
    largestTradeRange: largest,
    trades: recent.slice(0, 10),
    explanation,
  };
}

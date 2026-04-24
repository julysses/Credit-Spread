import { blackScholes } from './black-scholes';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DefenseLevel = 'HOLD' | 'DEFEND' | 'HEDGE' | 'BAIL';

export interface DefenseRegime {
  level: DefenseLevel;
  color: string;    // tailwind text color class
  bg: string;       // tailwind bg class
  border: string;   // tailwind border class
  description: string;
  actions: string[];
}

export interface SpreadPosition {
  entryCredit: number;   // credit received at open (per contract, in points)
  shortStrike: number;
  longStrike: number;
  optionType: 'put' | 'call';
  dteAtEntry: number;
  contracts: number;
}

export interface LivePnL {
  currentValue: number;   // current cost to close (debit)
  pnlDollar: number;      // positive = profit
  pnlPct: number;         // fraction of max profit captured (positive) or pct of max loss (negative)
  delta: number;
  theta: number;
  gamma: number;
  spreadWidth: number;
  maxProfit: number;
  maxLoss: number;
}

export interface RecoveryPlay {
  id: string;
  name: string;
  trigger: string;
  action: string;
  risk: string;
  reward: string;
  active: boolean;
}

export interface SizingResult {
  contracts: number;
  dollarRisk: number;
  pctOfAccount: number;
  kellySuggestion: number;
}

export interface DecisionNode {
  nodeId: string;
  question: string;
  context: string;
  options: { label: string; nextNode: string; action?: string }[];
  recommendation?: string;
  isTerminal: boolean;
}

// ─── Defense Regime Classifier ───────────────────────────────────────────────

export function classifyDefenseRegime(
  vix: number,
  pnlPct: number,   // fraction: -1 = full loss, 0 = breakeven, 1 = full profit
  dte: number,
): DefenseRegime {
  // BAIL: deep loss (> 80% of max loss hit) or crisis vol
  if (pnlPct < -0.8 || vix > 40) {
    return {
      level: 'BAIL',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      description: 'Position at max loss threshold or crisis volatility — close immediately.',
      actions: ['Close spread at market', 'Do not attempt to roll', 'Wait for vol to normalize before re-entry'],
    };
  }

  // HEDGE: significant loss or elevated vol with time remaining
  if (pnlPct < -0.4 || (vix > 28 && dte > 2)) {
    return {
      level: 'HEDGE',
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
      description: 'Significant unrealized loss or elevated vol — add protection or reduce size.',
      actions: ['Buy protective put/call', 'Roll spread further OTM', 'Reduce contracts by 50%'],
    };
  }

  // DEFEND: moderate loss or rising vol intraday
  if (pnlPct < -0.15 || (vix > 22 && dte > 0)) {
    return {
      level: 'DEFEND',
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      description: 'Position under pressure — monitor closely, prepare defensive actions.',
      actions: ['Set hard stop at -50% of max loss', 'Watch short strike approach', 'Identify roll targets'],
    };
  }

  // HOLD: position healthy
  return {
    level: 'HOLD',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    description: 'Position within acceptable range — hold and manage normally.',
    actions: ['Monitor short strike distance', 'Take profit at 50% of max profit', 'No defensive action needed'],
  };
}

// ─── Live P&L Calculator ─────────────────────────────────────────────────────

export function calcSpreadPnL(
  position: SpreadPosition,
  currentSpx: number,
  iv: number,
  currentDte: number,
): LivePnL {
  const T = Math.max(currentDte / 365, 0.0001);
  const r = 0.053; // approximate risk-free rate

  const shortLeg = blackScholes({
    S: currentSpx,
    K: position.shortStrike,
    T,
    r,
    sigma: iv,
    optionType: position.optionType,
  });

  const longLeg = blackScholes({
    S: currentSpx,
    K: position.longStrike,
    T,
    r,
    sigma: iv,
    optionType: position.optionType,
  });

  const spreadWidth = Math.abs(position.shortStrike - position.longStrike);
  // For a credit spread: current cost to close = short leg value - long leg value
  const currentValue = shortLeg.price - longLeg.price;
  const pnlPerContract = (position.entryCredit - currentValue) * 100; // in dollars
  const maxProfit = position.entryCredit * 100 * position.contracts;
  const maxLoss = (spreadWidth - position.entryCredit) * 100 * position.contracts;
  const pnlDollar = pnlPerContract * position.contracts;
  const pnlPct = maxProfit > 0 ? pnlDollar / maxProfit : 0;

  return {
    currentValue,
    pnlDollar,
    pnlPct,
    delta: shortLeg.delta - longLeg.delta,
    theta: shortLeg.theta - longLeg.theta,
    gamma: shortLeg.gamma - longLeg.gamma,
    spreadWidth,
    maxProfit,
    maxLoss,
  };
}

// ─── Recovery Playbook ────────────────────────────────────────────────────────

export function getRecoveryPlays(
  regime: DefenseLevel,
  pnlPct: number,
  dte: number,
): RecoveryPlay[] {
  return [
    {
      id: 'hold',
      name: 'Hold & Monitor',
      trigger: 'Loss < 25% of max, DTE > 3',
      action: 'No action — maintain position, set alert at -50% of max loss',
      risk: 'Position continues to move against you',
      reward: 'Full credit kept if position recovers',
      active: regime === 'HOLD' && pnlPct > -0.25,
    },
    {
      id: 'roll-out',
      name: 'Roll Out in Time',
      trigger: 'Loss 25–50% of max, DTE 1–5',
      action: 'Close current spread and re-open same strikes 2–4 weeks out for net credit',
      risk: 'Extends duration exposure; vol may increase further',
      reward: 'Additional credit collected; more time for position to recover',
      active: regime === 'DEFEND' && pnlPct > -0.5 && dte <= 5,
    },
    {
      id: 'roll-away',
      name: 'Roll Down/Up & Out',
      trigger: 'Loss 40–80% of max or strike breached',
      action: 'Close current spread; re-open at further OTM strikes with same or later expiry',
      risk: 'Smaller credit on new position; net debit possible',
      reward: 'Reduced directional risk; salvages some credit',
      active: regime === 'HEDGE' && pnlPct > -0.8,
    },
    {
      id: 'close',
      name: 'Close & Exit',
      trigger: 'Loss > 80% of max or VIX > 40',
      action: 'Buy back spread at market — accept max loss and preserve remaining capital',
      risk: 'Realized max loss',
      reward: 'Eliminates gamma risk; frees capital for recovery trade later',
      active: regime === 'BAIL',
    },
  ];
}

// ─── Position Sizing Calculator ───────────────────────────────────────────────

export function calcPositionSize(
  accountSize: number,
  riskPct: number,       // e.g. 0.02 = 2%
  maxLossPerContract: number,  // in dollars (e.g. 450 for a $5-wide put spread selling $0.50)
  winRate: number = 0.68,
  avgWin: number = 0.5,        // average win as fraction of max profit
  avgLoss: number = 1.0,       // average loss as fraction of max loss
): SizingResult {
  const dollarRisk = accountSize * riskPct;
  const contracts = maxLossPerContract > 0
    ? Math.max(1, Math.floor(dollarRisk / maxLossPerContract))
    : 1;
  const pctOfAccount = (contracts * maxLossPerContract) / accountSize;

  // Kelly criterion: f = (p*b - q) / b where b = win/loss ratio
  const b = (avgWin * maxLossPerContract) / (avgLoss * maxLossPerContract);
  const q = 1 - winRate;
  const kellyFull = (winRate * b - q) / b;
  const kellyHalf = Math.max(0, kellyFull / 2); // half-Kelly for safety
  const kellySuggestion = Math.max(1, Math.floor((accountSize * kellyHalf) / maxLossPerContract));

  return {
    contracts,
    dollarRisk: contracts * maxLossPerContract,
    pctOfAccount,
    kellySuggestion,
  };
}

// ─── Decision Tree ────────────────────────────────────────────────────────────

const TREE: Record<string, DecisionNode> = {
  root: {
    nodeId: 'root',
    question: 'Is the market moving against your position?',
    context: 'Check if SPX is approaching your short strike',
    options: [
      { label: 'Yes — short strike within 1% of current price', nextNode: 'strike-breached' },
      { label: 'No — position still comfortable', nextNode: 'pnl-check' },
    ],
    isTerminal: false,
  },
  'pnl-check': {
    nodeId: 'pnl-check',
    question: 'What is your current unrealized P&L?',
    context: 'Compare current spread value to entry credit',
    options: [
      { label: 'Profit > 50% of max — take profit', nextNode: 'take-profit', action: 'Close spread, book profit' },
      { label: 'Breakeven or small profit — hold', nextNode: 'hold-monitor' },
      { label: 'Loss < 25% of max — monitor', nextNode: 'hold-monitor' },
      { label: 'Loss 25–50% of max — defend', nextNode: 'defend-options' },
    ],
    isTerminal: false,
  },
  'take-profit': {
    nodeId: 'take-profit',
    question: 'Profit target reached',
    context: 'You have captured 50%+ of maximum profit',
    options: [{ label: 'Close position', nextNode: 'root', action: 'Close spread at current market' }],
    recommendation: 'Close the spread. Lock in the gain. Don\'t let a winner turn into a loser.',
    isTerminal: true,
  },
  'hold-monitor': {
    nodeId: 'hold-monitor',
    question: 'Position healthy — continue monitoring',
    context: 'Set alerts and check again at next 60-second update',
    options: [{ label: 'Reset — check again', nextNode: 'root' }],
    recommendation: 'Hold. Set alert if short strike comes within 1%. Check again at close.',
    isTerminal: true,
  },
  'strike-breached': {
    nodeId: 'strike-breached',
    question: 'How many DTE remain?',
    context: 'Time remaining affects your roll/close decision',
    options: [
      { label: '> 5 DTE — roll is viable', nextNode: 'roll-decision' },
      { label: '1–5 DTE — limited time', nextNode: 'close-or-roll' },
      { label: '0DTE — expiry today', nextNode: 'dte-zero' },
    ],
    isTerminal: false,
  },
  'roll-decision': {
    nodeId: 'roll-decision',
    question: 'Can you roll for a net credit?',
    context: 'Check if rolling 2–4 weeks out at same or further OTM strikes earns additional credit',
    options: [
      { label: 'Yes — net credit available', nextNode: 'execute-roll', action: 'Roll spread out 2–4 weeks' },
      { label: 'No — only net debit', nextNode: 'close-decision' },
    ],
    isTerminal: false,
  },
  'execute-roll': {
    nodeId: 'execute-roll',
    question: 'Roll executed',
    context: 'New position opened with additional credit',
    options: [{ label: 'Reset tree', nextNode: 'root' }],
    recommendation: 'Roll complete. Update position details. Monitor new short strike.',
    isTerminal: true,
  },
  'close-or-roll': {
    nodeId: 'close-or-roll',
    question: 'Is your loss less than 50% of max?',
    context: 'Smaller loss gives more flexibility',
    options: [
      { label: 'Yes — try to roll', nextNode: 'roll-decision' },
      { label: 'No — loss > 50%', nextNode: 'close-decision' },
    ],
    isTerminal: false,
  },
  'close-decision': {
    nodeId: 'close-decision',
    question: 'Accept loss and close position',
    context: 'Net debit roll means locking in loss while adding more risk. Close is better.',
    options: [{ label: 'Close position', nextNode: 'root', action: 'Close spread at market' }],
    recommendation: 'Close the spread. Accept the loss. Capital preservation over hope. Re-enter after vol normalizes.',
    isTerminal: true,
  },
  'defend-options': {
    nodeId: 'defend-options',
    question: 'Choose a defensive action',
    context: 'Position under moderate pressure but still manageable',
    options: [
      { label: 'Buy a protective option to hedge delta', nextNode: 'hedge-added', action: 'Buy hedge leg' },
      { label: 'Roll to further OTM strikes', nextNode: 'roll-decision' },
      { label: 'Do nothing — accept risk', nextNode: 'hold-monitor' },
    ],
    isTerminal: false,
  },
  'hedge-added': {
    nodeId: 'hedge-added',
    question: 'Hedge in place',
    context: 'Protective option reduces directional risk',
    options: [{ label: 'Reset tree', nextNode: 'root' }],
    recommendation: 'Hedge active. Monitor overall position delta. Remove hedge when vol subsides.',
    isTerminal: true,
  },
  'dte-zero': {
    nodeId: 'dte-zero',
    question: '0DTE with breach — close immediately',
    context: 'No time to roll or recover on expiry day once the strike is breached',
    options: [{ label: 'Close now', nextNode: 'root', action: 'Close spread at market immediately' }],
    recommendation: 'Close the spread now. On expiration day a breached strike almost always results in max loss. Do not wait.',
    isTerminal: true,
  },
};

export function getDecisionNode(nodeId: string): DecisionNode {
  return TREE[nodeId] ?? TREE['root'];
}

export function getAllNodes(): Record<string, DecisionNode> {
  return TREE;
}

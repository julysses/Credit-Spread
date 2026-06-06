/**
 * SPX Signal Desk — Database Schema
 * Drizzle ORM + Postgres
 */

import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  accountSize: real('account_size').default(100000),
  riskPerTrade: real('risk_per_trade').default(0.02), // 2% default
  notifyEmail: boolean('notify_email').default(true),
  notifySms: boolean('notify_sms').default(false),
  notifyPush: boolean('notify_push').default(true),
  timezone: varchar('timezone', { length: 50 }).default('America/New_York'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─────────────────────────────────────────────
// Market Snapshots
// ─────────────────────────────────────────────
export const marketSnapshots = pgTable('market_snapshots', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  spxPrice: real('spx_price').notNull(),
  spyPrice: real('spy_price'),
  vix: real('vix').notNull(),
  vixRegime: varchar('vix_regime', { length: 20 }),
  ivRank: real('iv_rank'),
  ivPercentile: real('iv_percentile'),
  impliedVol: real('implied_vol'),
  realizedVol: real('realized_vol'),
  spxDailyChange: real('spx_daily_change'),
  spxDailyChangePct: real('spx_daily_change_pct'),
  directionalBias: varchar('directional_bias', { length: 20 }),
  marketRegime: varchar('market_regime', { length: 30 }),
  riskLevel: varchar('risk_level', { length: 20 }),
  isMacroEventDay: boolean('is_macro_event_day').default(false),
  macroEventType: varchar('macro_event_type', { length: 50 }),
  expectedMove: real('expected_move'),
  atmStraddle: real('atm_straddle'),
  skewData: jsonb('skew_data'),
  termStructure: jsonb('term_structure'),
  technicalSignal: varchar('technical_signal', { length: 30 }),
  rawData: jsonb('raw_data'),
}, (table) => ({
  tsIdx: index('market_snapshots_ts_idx').on(table.timestamp),
}));

// ─────────────────────────────────────────────
// News Events
// ─────────────────────────────────────────────
export const newsEvents = pgTable('news_events', {
  id: serial('id').primaryKey(),
  publishedAt: timestamp('published_at').notNull(),
  source: varchar('source', { length: 100 }),
  headline: text('headline').notNull(),
  summary: text('summary'),
  url: text('url'),
  sentiment: varchar('sentiment', { length: 20 }), // positive, negative, neutral
  sentimentScore: real('sentiment_score'),          // -1 to 1
  geopoliticalRisk: boolean('geopolitical_risk').default(false),
  macroRelevance: boolean('macro_relevance').default(false),
  riskImpact: varchar('risk_impact', { length: 20 }), // low, medium, high
  aiAnalysis: text('ai_analysis'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  publishedIdx: index('news_published_idx').on(table.publishedAt),
}));

// ─────────────────────────────────────────────
// Strategy Recommendations
// ─────────────────────────────────────────────
export const strategyRecommendations = pgTable('strategy_recommendations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  strategy: varchar('strategy', { length: 50 }).notNull(),
  tradeType: varchar('trade_type', { length: 50 }),
  spxPrice: real('spx_price').notNull(),
  vix: real('vix').notNull(),
  marketRegime: varchar('market_regime', { length: 30 }),
  riskLevel: varchar('risk_level', { length: 20 }),
  confidence: varchar('confidence', { length: 10 }),

  // Short leg
  shortStrike: integer('short_strike'),
  shortOptionType: varchar('short_option_type', { length: 10 }),
  shortDelta: real('short_delta'),
  shortIV: real('short_iv'),
  shortPremium: real('short_premium'),

  // Long leg
  longStrike: integer('long_strike'),
  longOptionType: varchar('long_option_type', { length: 10 }),
  longDelta: real('long_delta'),
  longIV: real('long_iv'),
  longPremium: real('long_premium'),

  // Iron condor legs
  shortStrike2: integer('short_strike_2'),
  longStrike2: integer('long_strike_2'),

  // Trade metrics
  credit: real('credit'),
  creditTotal: real('credit_total'),
  maxProfit: real('max_profit'),
  maxLoss: real('max_loss'),
  spreadWidth: integer('spread_width'),
  probOfProfit: real('prob_of_profit'),
  probOfTouch: real('prob_of_touch'),
  expectedValue: real('expected_value'),
  kellySize: real('kelly_size'),
  profitTarget: real('profit_target'),
  stopLoss: real('stop_loss'),
  daysToExpiry: integer('days_to_expiry'),
  expiryDate: varchar('expiry_date', { length: 20 }),

  // Analysis
  rationale: jsonb('rationale'),
  conditions: jsonb('conditions'),
  warnings: jsonb('warnings'),
  morningBrief: text('morning_brief'),
  mcResults: jsonb('mc_results'),

  // Status
  status: varchar('status', { length: 20 }).default('pending'), // pending, active, closed, expired
}, (table) => ({
  generatedIdx: index('strat_rec_generated_idx').on(table.generatedAt),
  userIdx: index('strat_rec_user_idx').on(table.userId),
}));

// ─────────────────────────────────────────────
// Trades (actual positions)
// ─────────────────────────────────────────────
export const trades = pgTable('trades', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  recommendationId: integer('recommendation_id').references(() => strategyRecommendations.id),

  openedAt: timestamp('opened_at').defaultNow(),
  closedAt: timestamp('closed_at'),
  expiryDate: varchar('expiry_date', { length: 20 }),

  strategy: varchar('strategy', { length: 50 }).notNull(),
  tradeType: varchar('trade_type', { length: 50 }),

  shortStrike: integer('short_strike').notNull(),
  longStrike: integer('long_strike').notNull(),
  shortStrike2: integer('short_strike_2'),
  longStrike2: integer('long_strike_2'),
  optionType: varchar('option_type', { length: 10 }),

  contracts: integer('contracts').default(1),
  openCredit: real('open_credit').notNull(),
  closeDebit: real('close_debit'),
  pnl: real('pnl'),                  // Realized P&L
  pnlPercent: real('pnl_percent'),

  status: varchar('status', { length: 20 }).default('open'), // open, closed, expired
  closeReason: varchar('close_reason', { length: 50 }), // profit_target, stop_loss, expiry, manual

  maxAdverseExcursion: real('max_adverse_excursion'),
  maxFavorableExcursion: real('max_favorable_excursion'),

  notes: text('notes'),
  tags: jsonb('tags'),
}, (table) => ({
  userIdx: index('trades_user_idx').on(table.userId),
  statusIdx: index('trades_status_idx').on(table.status),
  openedIdx: index('trades_opened_idx').on(table.openedAt),
}));

// ─────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────
export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  sentAt: timestamp('sent_at'),
  type: varchar('type', { length: 50 }).notNull(), // morning_brief, signal, warning, stop_hit
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  priority: varchar('priority', { length: 10 }).default('normal'), // low, normal, high, urgent
  channel: varchar('channel', { length: 20 }).notNull(), // email, sms, push
  delivered: boolean('delivered').default(false),
  relatedTradeId: integer('related_trade_id').references(() => trades.id),
  relatedRecommendationId: integer('related_recommendation_id').references(() => strategyRecommendations.id),
  metadata: jsonb('metadata'),
});

// ─────────────────────────────────────────────
// Economic Calendar
// ─────────────────────────────────────────────
export const economicCalendar = pgTable('economic_calendar', {
  id: serial('id').primaryKey(),
  eventDate: timestamp('event_date').notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(), // FOMC, CPI, NFP, etc.
  title: varchar('title', { length: 255 }).notNull(),
  importance: varchar('importance', { length: 10 }).default('medium'), // low, medium, high
  forecast: varchar('forecast', { length: 50 }),
  previous: varchar('previous', { length: 50 }),
  actual: varchar('actual', { length: 50 }),
  isMacroEventDay: boolean('is_macro_event_day').default(false),
}, (table) => ({
  eventDateIdx: index('eco_calendar_date_idx').on(table.eventDate),
}));

// ─────────────────────────────────────────────
// Analytics / Performance
// ─────────────────────────────────────────────
export const performanceMetrics = pgTable('performance_metrics', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  calculatedAt: timestamp('calculated_at').defaultNow(),
  period: varchar('period', { length: 20 }), // daily, weekly, monthly, ytd, all
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  losingTrades: integer('losing_trades').default(0),
  winRate: real('win_rate'),
  avgWin: real('avg_win'),
  avgLoss: real('avg_loss'),
  profitFactor: real('profit_factor'),
  totalPnl: real('total_pnl'),
  maxDrawdown: real('max_drawdown'),
  sharpeRatio: real('sharpe_ratio'),
  expectedValueAccuracy: real('expected_value_accuracy'),
  byStrategy: jsonb('by_strategy'),
  byRegime: jsonb('by_regime'),
});

// ─────────────────────────────────────────────
// Signal Stack Snapshots
// ─────────────────────────────────────────────
export const signalSnapshots = pgTable('signal_snapshots', {
  id:                     serial('id').primaryKey(),
  createdAt:              timestamp('created_at').defaultNow().notNull(),
  // Crown macro inputs
  wtiPrice:               real('wti_price'),
  wti4weekChangePct:      real('wti_4week_change_pct'),
  spxPrice:               real('spx_price'),
  spx200sma:              real('spx_200sma'),
  breadthPctAbove200sma:  real('breadth_pct_above_200sma'),
  hySpreadBps:            real('hy_spread_bps'),
  hySpread2weekChange:    real('hy_spread_2week_change'),
  dxyLevel:               real('dxy_level'),
  vixLevel:               real('vix_level'),
  goldPrice:              real('gold_price'),
  goldWeeklyChangePct:    real('gold_weekly_change_pct'),
  // Flow + vol inputs
  portfolioVolAnnualized: real('portfolio_vol_annualized'),
  gexValue:               real('gex_value'),
  vvixLevel:              real('vvix_level'),
  pcrValue:               real('pcr_value'),
  // Scores + signal
  macroScore:             integer('macro_score'),
  flowScore:              integer('flow_score'),
  compositeSignal:        varchar('composite_signal', { length: 60 }),
  notes:                  text('notes'),
  aiRecommendation:       text('ai_recommendation'),
}, (table) => ({
  createdIdx: index('signal_snapshots_created_idx').on(table.createdAt),
}));

// ─────────────────────────────────────────────
// Trade Log (Signal Stack actions)
// ─────────────────────────────────────────────
export const tradeLog = pgTable('trade_log', {
  id:               serial('id').primaryKey(),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  signalSnapshotId: integer('signal_snapshot_id').references(() => signalSnapshots.id),
  actionTaken:      text('action_taken'),
  optionsStructure: text('options_structure'),
  entryPrice:       real('entry_price'),
  targetDte:        integer('target_dte'),
  outcomeNotes:     text('outcome_notes'),
}, (table) => ({
  snapshotIdx: index('trade_log_snapshot_idx').on(table.signalSnapshotId),
}));

// ─────────────────────────────────────────────
// 0DTE Trade Log
// ─────────────────────────────────────────────
export const zeroDteTrades = pgTable('zero_dte_trades', {
  id:                  serial('id').primaryKey(),
  createdAt:           timestamp('created_at').defaultNow().notNull(),
  strategyName:        varchar('strategy_name', { length: 50 }).notNull(),
  // Regime at entry
  vixAtEntry:          real('vix_at_entry'),
  vix1dAtEntry:        real('vix1d_at_entry'),
  vix1d20dAvg:         real('vix1d_20d_avg'),
  gexEnvironment:      varchar('gex_environment', { length: 20 }),
  spxVs20sma:          varchar('spx_vs_20sma', { length: 10 }),
  potrValue:           real('potr_value'),
  // Structure
  underlying:          varchar('underlying', { length: 10 }).default('SPX'),
  expirationDate:      varchar('expiration_date', { length: 20 }),
  structureType:       varchar('structure_type', { length: 30 }),
  shortPutStrike:      real('short_put_strike'),
  longPutStrike:       real('long_put_strike'),
  shortCallStrike:     real('short_call_strike'),
  longCallStrike:      real('long_call_strike'),
  spreadWidth:         real('spread_width'),
  // Execution
  entryTime:           varchar('entry_time', { length: 10 }),
  entryCredit:         real('entry_credit'),
  maxRisk:             real('max_risk'),
  rewardRiskRatio:     real('reward_risk_ratio'),
  contracts:           integer('contracts').default(1),
  totalCreditReceived: real('total_credit_received'),
  // Exit
  exitTime:            varchar('exit_time', { length: 10 }),
  exitDebit:           real('exit_debit'),
  outcome:             varchar('outcome', { length: 30 }),
  pnlPerContract:      real('pnl_per_contract'),
  totalPnl:            real('total_pnl'),
  // Checklist compliance
  allConditionsMet:    boolean('all_conditions_met'),
  conditionsSkipped:   text('conditions_skipped'),
  notes:               text('notes'),
  signalSnapshotId:    integer('signal_snapshot_id').references(() => signalSnapshots.id),
}, (table) => ({
  zeroDteCreatedIdx: index('zero_dte_trades_created_idx').on(table.createdAt),
  zeroDteStrategyIdx: index('zero_dte_trades_strategy_idx').on(table.strategyName),
}));

// ─────────────────────────────────────────────
// Morning Briefings
// ─────────────────────────────────────────────
export const morningBriefings = pgTable('morning_briefings', {
  id: serial('id').primaryKey(),
  date: varchar('date', { length: 20 }).notNull().unique(),
  generatedAt: timestamp('generated_at').defaultNow(),
  marketSummary: text('market_summary'),
  geopoliticalRisk: text('geopolitical_risk'),
  macroAnalysis: text('macro_analysis'),
  technicalAnalysis: text('technical_analysis'),
  strategyRecommendation: text('strategy_recommendation'),
  riskLevel: varchar('risk_level', { length: 20 }),
  shouldTrade: boolean('should_trade').default(true),
  keyEvents: jsonb('key_events'),
  newsHighlights: jsonb('news_highlights'),
  fullBrief: text('full_brief'),
});

// ─────────────────────────────────────────────
// Defense Events (move log)
// ─────────────────────────────────────────────
export const defenseEvents = pgTable('defense_events', {
  id:          serial('id').primaryKey(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  eventType:   varchar('event_type', { length: 50 }).notNull(), // 'roll'|'close'|'hedge'|'adjust'|'note'
  description: text('description').notNull(),
  spxAtEvent:  real('spx_at_event'),
  vixAtEvent:  real('vix_at_event'),
  pnlAtEvent:  real('pnl_at_event'),
  notes:       text('notes'),
}, (t) => ({
  createdIdx: index('defense_events_created_idx').on(t.createdAt),
}));

// ─────────────────────────────────────────────
// Defense Tree State (decision tree persistence)
// ─────────────────────────────────────────────
export const defenseTreeState = pgTable('defense_tree_state', {
  id:          serial('id').primaryKey(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
  currentNode: varchar('current_node', { length: 100 }).notNull().default('root'),
  answers:     jsonb('answers').default({}),
});

// ─────────────────────────────────────────────
// Growth Stock Candidates (daily screener output)
// ─────────────────────────────────────────────
export const stockCandidates = pgTable('stock_candidates', {
  id:                serial('id').primaryKey(),
  scanDate:          varchar('scan_date', { length: 20 }).notNull(),
  symbol:            varchar('symbol', { length: 10 }).notNull(),
  companyName:       varchar('company_name', { length: 255 }),
  sector:            varchar('sector', { length: 50 }),
  marketCap:         real('market_cap'),
  strategyType:      varchar('strategy_type', { length: 20 }).notNull(), // 'short_term'|'long_term'|'future_mover'
  compositeScore:    real('composite_score').notNull(),
  momentumScore:     real('momentum_score'),
  growthScore:       real('growth_score'),
  valueScore:        real('value_score'),
  institutionalScore: real('institutional_score'),
  optionsFlowScore:  real('options_flow_score'),
  price:             real('price'),
  priceChangePct:    real('price_change_pct'),
  volumeRatio:       real('volume_ratio'),
  rsi14:             real('rsi14'),
  above200sma:       boolean('above_200sma'),
  above50ema:        boolean('above_50ema'),
  revenueGrowthPct:  real('revenue_growth_pct'),
  epsGrowthPct:      real('eps_growth_pct'),
  pegRatio:          real('peg_ratio'),
  aiThesis:          text('ai_thesis'),
  signals:           jsonb('signals'),
  createdAt:         timestamp('created_at').defaultNow(),
}, (t) => ({
  scanDateIdx: index('stock_candidates_scan_date_idx').on(t.scanDate),
  symbolIdx:   index('stock_candidates_symbol_idx').on(t.symbol),
  scoreIdx:    index('stock_candidates_score_idx').on(t.compositeScore),
  uniqRow:     uniqueIndex('stock_candidates_unique').on(t.scanDate, t.symbol, t.strategyType),
}));

// ─────────────────────────────────────────────
// Growth Scan Metadata
// ─────────────────────────────────────────────
export const growthScans = pgTable('growth_scans', {
  id:                serial('id').primaryKey(),
  scanDate:          varchar('scan_date', { length: 20 }).notNull().unique(),
  ranAt:             timestamp('ran_at').defaultNow(),
  totalScreened:     integer('total_screened').default(0),
  shortTermCount:    integer('short_term_count').default(0),
  longTermCount:     integer('long_term_count').default(0),
  futureMoverCount:  integer('future_mover_count').default(0),
  marketRegime:      varchar('market_regime', { length: 30 }),
  notes:             text('notes'),
});

// ─────────────────────────────────────────────
// Options Flow Alerts
// ─────────────────────────────────────────────
export const optionsFlowAlerts = pgTable('options_flow_alerts', {
  id:                serial('id').primaryKey(),
  detectedAt:        timestamp('detected_at').defaultNow(),
  symbol:            varchar('symbol', { length: 10 }).notNull(),
  alertType:         varchar('alert_type', { length: 30 }), // 'unusual_call'|'unusual_put'|'squeeze_setup'|'dark_pool'
  strike:            real('strike'),
  expiry:            varchar('expiry', { length: 20 }),
  daysToExpiry:      integer('days_to_expiry'),
  premium:           real('premium'),
  volume:            integer('volume'),
  openInterest:      integer('open_interest'),
  volumeOiRatio:     real('volume_oi_ratio'),
  impliedVolatility: real('implied_volatility'),
  sentiment:         varchar('sentiment', { length: 10 }),
  notes:             text('notes'),
}, (t) => ({
  symbolIdx:    index('flow_alerts_symbol_idx').on(t.symbol),
  detectedIdx:  index('flow_alerts_detected_idx').on(t.detectedAt),
}));

// ─────────────────────────────────────────────
// Intelligence Dossiers (top 10 deep-dive)
// ─────────────────────────────────────────────
export const intelligenceDossiers = pgTable('intelligence_dossiers', {
  id:                  serial('id').primaryKey(),
  dossierDate:         varchar('dossier_date', { length: 20 }).notNull(),
  symbol:              varchar('symbol', { length: 10 }).notNull(),
  fundamentalsData:    jsonb('fundamentals_data'),
  valuationData:       jsonb('valuation_data'),
  newsData:            jsonb('news_data'),
  institutionalData:   jsonb('institutional_data'),
  optionsData:         jsonb('options_data'),
  technicalsData:      jsonb('technicals_data'),
  sectorData:          jsonb('sector_data'),
  aiMemo:              text('ai_memo'),
  bullCase:            text('bull_case'),
  bearCase:            text('bear_case'),
  entryStrategy:       text('entry_strategy'),
  keyRisks:            text('key_risks'),
  targetPriceRange:    varchar('target_price_range', { length: 50 }),
  convictionLevel:     varchar('conviction_level', { length: 20 }), // 'High'|'Medium'|'Speculative'
  createdAt:           timestamp('created_at').defaultNow(),
}, (t) => ({
  dateSymbolUniq: uniqueIndex('dossiers_date_symbol_idx').on(t.dossierDate, t.symbol),
}));

// ─────────────────────────────────────────────
// Stock Parameter Snapshots (ML training data)
// ─────────────────────────────────────────────
export const stockParameterSnapshots = pgTable('stock_parameter_snapshots', {
  id:                    serial('id').primaryKey(),
  snapshotDate:          varchar('snapshot_date', { length: 20 }).notNull(),
  symbol:                varchar('symbol', { length: 10 }).notNull(),
  sector:                varchar('sector', { length: 50 }),
  marketCap:             real('market_cap'),
  // Price & volume
  price:                 real('price'),
  priceOpen:             real('price_open'),
  priceHigh:             real('price_high'),
  priceLow:              real('price_low'),
  volume:                real('volume'),
  avgVolume20d:          real('avg_volume_20d'),
  volumeRatio:           real('volume_ratio'),
  dayChangePct:          real('day_change_pct'),
  weekChangePct:         real('week_change_pct'),
  monthChangePct:        real('month_change_pct'),
  threeMonthChangePct:   real('three_month_change_pct'),
  fiftyTwoWeekHigh:      real('fifty_two_week_high'),
  fiftyTwoWeekLow:       real('fifty_two_week_low'),
  distFromHigh52w:       real('dist_from_high_52w'),
  // Technical indicators
  rsi14:                 real('rsi14'),
  rsi2:                  real('rsi2'),
  macdLine:              real('macd_line'),
  macdSignal:            real('macd_signal'),
  macdHistogram:         real('macd_histogram'),
  sma20:                 real('sma20'),
  sma50:                 real('sma50'),
  sma200:                real('sma200'),
  ema20:                 real('ema20'),
  ema50:                 real('ema50'),
  priceVsSma20Pct:       real('price_vs_sma20_pct'),
  priceVsSma50Pct:       real('price_vs_sma50_pct'),
  priceVsSma200Pct:      real('price_vs_sma200_pct'),
  sma50VsSma200Pct:      real('sma50_vs_sma200_pct'),
  atr14:                 real('atr14'),
  atrPct:                real('atr_pct'),
  relStrengthVsSpy1m:    real('rel_strength_vs_spy_1m'),
  relStrengthVsSpy3m:    real('rel_strength_vs_spy_3m'),
  // Fundamental raw inputs
  revenueGrowthYoy:      real('revenue_growth_yoy'),
  revenueGrowthQoq:      real('revenue_growth_qoq'),
  epsGrowthYoy:          real('eps_growth_yoy'),
  epsGrowthQoq:          real('eps_growth_qoq'),
  grossMargin:           real('gross_margin'),
  operatingMargin:       real('operating_margin'),
  netMargin:             real('net_margin'),
  fcfMargin:             real('fcf_margin'),
  roe:                   real('roe'),
  roa:                   real('roa'),
  debtToEbitda:          real('debt_to_ebitda'),
  currentRatio:          real('current_ratio'),
  peRatio:               real('pe_ratio'),
  forwardPe:             real('forward_pe'),
  psRatio:               real('ps_ratio'),
  pbRatio:               real('pb_ratio'),
  evEbitda:              real('ev_ebitda'),
  pegRatio:              real('peg_ratio'),
  earningsSurprisePct:   real('earnings_surprise_pct'),
  earningsSurprise4q:    real('earnings_surprise_4q'),
  analystTargetPrice:    real('analyst_target_price'),
  impliedUpside:         real('implied_upside'),
  epsRevisionUp30d:      integer('eps_revision_up_30d'),
  epsRevisionDown30d:    integer('eps_revision_down_30d'),
  // Institutional & smart money
  institutionalOwnership: real('institutional_ownership'),
  hfNetShareChangePct:   real('hf_net_share_change_pct'),
  insiderNetBuyDollars:  real('insider_net_buy_dollars'),
  shortFloatPct:         real('short_float_pct'),
  shortDaysToCover:      real('short_days_to_cover'),
  // Options market
  ivRank:                real('iv_rank'),
  ivPercentile:          real('iv_percentile'),
  putCallOiRatio:        real('put_call_oi_ratio'),
  putCallVolumeRatio:    real('put_call_volume_ratio'),
  unusualFlowFlag:       boolean('unusual_flow_flag'),
  impliedMoveEarnings:   real('implied_move_earnings'),
  // Macro context
  spxRegime:             varchar('spx_regime', { length: 30 }),
  signalStackComposite:  real('signal_stack_composite'),
  vixLevel:              real('vix_level'),
  // Scores
  compositeShortTerm:    real('composite_short_term'),
  compositeLongTerm:     real('composite_long_term'),
  // Forward return labels (filled in by label-returns worker)
  returnFwd5d:           real('return_fwd_5d'),
  returnFwd10d:          real('return_fwd_10d'),
  returnFwd30d:          real('return_fwd_30d'),
  returnFwd60d:          real('return_fwd_60d'),
  returnFwd90d:          real('return_fwd_90d'),
  labeledAt:             timestamp('labeled_at'),
  createdAt:             timestamp('created_at').defaultNow(),
}, (t) => ({
  dateIdx:   index('param_snap_date_idx').on(t.snapshotDate),
  symbolIdx: index('param_snap_symbol_idx').on(t.symbol),
  uniqRow:   uniqueIndex('param_snap_unique').on(t.snapshotDate, t.symbol),
}));


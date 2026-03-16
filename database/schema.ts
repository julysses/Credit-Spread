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

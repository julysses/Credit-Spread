CREATE TABLE IF NOT EXISTS "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"created_at" timestamp DEFAULT now(),
	"sent_at" timestamp,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"priority" varchar(10) DEFAULT 'normal',
	"channel" varchar(20) NOT NULL,
	"delivered" boolean DEFAULT false,
	"related_trade_id" integer,
	"related_recommendation_id" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "economic_calendar" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_date" timestamp NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"importance" varchar(10) DEFAULT 'medium',
	"forecast" varchar(50),
	"previous" varchar(50),
	"actual" varchar(50),
	"is_macro_event_day" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"spx_price" real NOT NULL,
	"spy_price" real,
	"vix" real NOT NULL,
	"vix_regime" varchar(20),
	"iv_rank" real,
	"iv_percentile" real,
	"implied_vol" real,
	"realized_vol" real,
	"spx_daily_change" real,
	"spx_daily_change_pct" real,
	"directional_bias" varchar(20),
	"market_regime" varchar(30),
	"risk_level" varchar(20),
	"is_macro_event_day" boolean DEFAULT false,
	"macro_event_type" varchar(50),
	"expected_move" real,
	"atm_straddle" real,
	"skew_data" jsonb,
	"term_structure" jsonb,
	"technical_signal" varchar(30),
	"raw_data" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "morning_briefings" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" varchar(20) NOT NULL,
	"generated_at" timestamp DEFAULT now(),
	"market_summary" text,
	"geopolitical_risk" text,
	"macro_analysis" text,
	"technical_analysis" text,
	"strategy_recommendation" text,
	"risk_level" varchar(20),
	"should_trade" boolean DEFAULT true,
	"key_events" jsonb,
	"news_highlights" jsonb,
	"full_brief" text,
	CONSTRAINT "morning_briefings_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"published_at" timestamp NOT NULL,
	"source" varchar(100),
	"headline" text NOT NULL,
	"summary" text,
	"url" text,
	"sentiment" varchar(20),
	"sentiment_score" real,
	"geopolitical_risk" boolean DEFAULT false,
	"macro_relevance" boolean DEFAULT false,
	"risk_impact" varchar(20),
	"ai_analysis" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"calculated_at" timestamp DEFAULT now(),
	"period" varchar(20),
	"total_trades" integer DEFAULT 0,
	"winning_trades" integer DEFAULT 0,
	"losing_trades" integer DEFAULT 0,
	"win_rate" real,
	"avg_win" real,
	"avg_loss" real,
	"profit_factor" real,
	"total_pnl" real,
	"max_drawdown" real,
	"sharpe_ratio" real,
	"expected_value_accuracy" real,
	"by_strategy" jsonb,
	"by_regime" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"strategy" varchar(50) NOT NULL,
	"trade_type" varchar(50),
	"spx_price" real NOT NULL,
	"vix" real NOT NULL,
	"market_regime" varchar(30),
	"risk_level" varchar(20),
	"confidence" varchar(10),
	"short_strike" integer,
	"short_option_type" varchar(10),
	"short_delta" real,
	"short_iv" real,
	"short_premium" real,
	"long_strike" integer,
	"long_option_type" varchar(10),
	"long_delta" real,
	"long_iv" real,
	"long_premium" real,
	"short_strike_2" integer,
	"long_strike_2" integer,
	"credit" real,
	"credit_total" real,
	"max_profit" real,
	"max_loss" real,
	"spread_width" integer,
	"prob_of_profit" real,
	"prob_of_touch" real,
	"expected_value" real,
	"kelly_size" real,
	"profit_target" real,
	"stop_loss" real,
	"days_to_expiry" integer,
	"expiry_date" varchar(20),
	"rationale" jsonb,
	"conditions" jsonb,
	"warnings" jsonb,
	"morning_brief" text,
	"mc_results" jsonb,
	"status" varchar(20) DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"recommendation_id" integer,
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"expiry_date" varchar(20),
	"strategy" varchar(50) NOT NULL,
	"trade_type" varchar(50),
	"short_strike" integer NOT NULL,
	"long_strike" integer NOT NULL,
	"short_strike_2" integer,
	"long_strike_2" integer,
	"option_type" varchar(10),
	"contracts" integer DEFAULT 1,
	"open_credit" real NOT NULL,
	"close_debit" real,
	"pnl" real,
	"pnl_percent" real,
	"status" varchar(20) DEFAULT 'open',
	"close_reason" varchar(50),
	"max_adverse_excursion" real,
	"max_favorable_excursion" real,
	"notes" text,
	"tags" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"phone" varchar(20),
	"account_size" real DEFAULT 100000,
	"risk_per_trade" real DEFAULT 0.02,
	"notify_email" boolean DEFAULT true,
	"notify_sms" boolean DEFAULT false,
	"notify_push" boolean DEFAULT true,
	"timezone" varchar(50) DEFAULT 'America/New_York',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_related_trade_id_trades_id_fk" FOREIGN KEY ("related_trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_related_recommendation_id_strategy_recommendations_id_fk" FOREIGN KEY ("related_recommendation_id") REFERENCES "public"."strategy_recommendations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strategy_recommendations" ADD CONSTRAINT "strategy_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_recommendation_id_strategy_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."strategy_recommendations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eco_calendar_date_idx" ON "economic_calendar" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_snapshots_ts_idx" ON "market_snapshots" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_published_idx" ON "news_events" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strat_rec_generated_idx" ON "strategy_recommendations" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strat_rec_user_idx" ON "strategy_recommendations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_user_idx" ON "trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_status_idx" ON "trades" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_opened_idx" ON "trades" USING btree ("opened_at");
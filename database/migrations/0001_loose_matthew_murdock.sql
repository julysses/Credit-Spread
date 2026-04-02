CREATE TABLE IF NOT EXISTS "signal_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"wti_price" real,
	"wti_4week_change_pct" real,
	"spx_price" real,
	"spx_200sma" real,
	"breadth_pct_above_200sma" real,
	"hy_spread_bps" real,
	"hy_spread_2week_change" real,
	"dxy_level" real,
	"vix_level" real,
	"gold_price" real,
	"gold_weekly_change_pct" real,
	"portfolio_vol_annualized" real,
	"gex_value" real,
	"vvix_level" real,
	"pcr_value" real,
	"macro_score" integer,
	"flow_score" integer,
	"composite_signal" varchar(60),
	"notes" text,
	"ai_recommendation" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trade_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"signal_snapshot_id" integer,
	"action_taken" text,
	"options_structure" text,
	"entry_price" real,
	"target_dte" integer,
	"outcome_notes" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_log" ADD CONSTRAINT "trade_log_signal_snapshot_id_signal_snapshots_id_fk" FOREIGN KEY ("signal_snapshot_id") REFERENCES "public"."signal_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_snapshots_created_idx" ON "signal_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_log_snapshot_idx" ON "trade_log" USING btree ("signal_snapshot_id");
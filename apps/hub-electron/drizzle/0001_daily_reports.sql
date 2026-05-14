CREATE TABLE `daily_report_snapshots` (
	`pos_day_id` text PRIMARY KEY NOT NULL,
	`business_date` text NOT NULL,
	`status` text NOT NULL,
	`bill_count` integer NOT NULL,
	`open_orders` integer NOT NULL,
	`billed_orders` integer NOT NULL,
	`paid_bills` integer NOT NULL,
	`unpaid_bills` integer NOT NULL,
	`cancelled_orders` integer NOT NULL,
	`gross_sales_paise` integer NOT NULL,
	`discount_paise` integer NOT NULL,
	`tip_paise` integer NOT NULL,
	`final_sales_paise` integer NOT NULL,
	`cash_payments_paise` integer NOT NULL,
	`upi_payments_paise` integer NOT NULL,
	`card_payments_paise` integer NOT NULL,
	`online_payments_paise` integer NOT NULL,
	`total_payments_paise` integer NOT NULL,
	`non_cash_payments_paise` integer NOT NULL,
	`bill_summaries_json` text NOT NULL,
	`item_summaries_json` text NOT NULL,
	`finalized_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`pos_day_id`) REFERENCES `pos_days`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_daily_report_date` ON `daily_report_snapshots` (`business_date`);

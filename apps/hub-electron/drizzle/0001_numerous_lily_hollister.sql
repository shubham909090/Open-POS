ALTER TABLE `bills` ADD `discount_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bills` ADD `tip_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bills` ADD `final_total_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `reference` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `note` text;
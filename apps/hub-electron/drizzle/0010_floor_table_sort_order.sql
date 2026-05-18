ALTER TABLE `floors` ADD COLUMN `sort_order` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `restaurant_tables` ADD COLUMN `sort_order` integer NOT NULL DEFAULT 0;

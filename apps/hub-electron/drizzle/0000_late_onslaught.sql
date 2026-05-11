CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`status` text NOT NULL,
	`subtotal_paise` integer NOT NULL,
	`tax_paise` integer NOT NULL,
	`total_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`tip_paise` integer DEFAULT 0 NOT NULL,
	`final_total_paise` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`settled_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `event_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_log_event_id_unique` ON `event_log` (`event_id`);--> statement-breakpoint
CREATE TABLE `floors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`key` text NOT NULL,
	`route` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`key`, `route`)
);
--> statement-breakpoint
CREATE TABLE `kot_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kot_id` text NOT NULL,
	`order_item_id` text,
	`menu_item_id` text NOT NULL,
	`name_snapshot` text NOT NULL,
	`quantity_delta` integer NOT NULL,
	FOREIGN KEY (`kot_id`) REFERENCES `kots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kots` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`production_unit_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`sequence` integer NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_unit_id`) REFERENCES `production_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kots_unit_status` ON `kots` (`production_unit_id`,`status`);--> statement-breakpoint
CREATE TABLE `local_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_devices_token_hash_unique` ON `local_devices` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_local_devices_hash` ON `local_devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price_paise` integer NOT NULL,
	`production_unit_id` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`production_unit_id`) REFERENCES `production_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`name_snapshot` text NOT NULL,
	`unit_price_paise` integer NOT NULL,
	`quantity` integer NOT NULL,
	`production_unit_id` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_unit_id`) REFERENCES `production_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`pos_day_id` text NOT NULL,
	`order_type` text NOT NULL,
	`status` text NOT NULL,
	`pax` integer NOT NULL,
	`captain_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `restaurant_tables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pos_day_id`) REFERENCES `pos_days`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_orders_table_status` ON `orders` (`table_id`,`status`);--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`device_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`used_at` text,
	`used_device_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_codes_code_hash_unique` ON `pairing_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `idx_pairing_codes_status` ON `pairing_codes` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`method` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`received_by` text NOT NULL,
	`reference` text,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pos_days` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`business_date` text NOT NULL,
	`status` text NOT NULL,
	`opening_cash_paise` integer NOT NULL,
	`closing_cash_paise` integer,
	`opened_by` text NOT NULL,
	`closed_by` text,
	`opened_at` text NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE TABLE `print_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`production_unit_id` text,
	`printer_host` text,
	`printer_port` integer,
	`printer_name` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_print_jobs_status` ON `print_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `production_units` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`printer_host` text NOT NULL,
	`printer_port` integer NOT NULL,
	`kds_enabled` integer DEFAULT true NOT NULL,
	`printer_mode` text DEFAULT 'network' NOT NULL,
	`printer_name` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `restaurant_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`floor_id` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`status` text NOT NULL,
	`current_order_id` text,
	`occupied_at` text,
	FOREIGN KEY (`floor_id`) REFERENCES `floors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event_log`(`event_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_outbox_event_id_unique` ON `sync_outbox` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_outbox_status` ON `sync_outbox` (`status`,`created_at`);
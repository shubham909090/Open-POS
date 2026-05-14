ALTER TABLE `orders` ADD COLUMN `captain_device_id` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `created_by_device_id` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `created_by_role` text;
--> statement-breakpoint
CREATE TABLE `ready_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`kot_id` text NOT NULL,
	`order_id` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`production_unit_id` text NOT NULL,
	`production_unit_name` text NOT NULL,
	`captain_device_id` text,
	`captain_id` text NOT NULL,
	`items_json` text NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`created_at` text NOT NULL,
	`acknowledged_at` text,
	FOREIGN KEY (`kot_id`) REFERENCES `kots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`table_id`) REFERENCES `restaurant_tables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_unit_id`) REFERENCES `production_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ready_notifications_device_status` ON `ready_notifications` (`captain_device_id`,`status`,`created_at`);

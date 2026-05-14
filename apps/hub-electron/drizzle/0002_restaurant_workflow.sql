CREATE TABLE `sale_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`report_label` text NOT NULL,
	`ticket_label` text DEFAULT 'KOT' NOT NULL,
	`tax_components_json` text DEFAULT '[]' NOT NULL,
	`default_production_unit_id` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`default_production_unit_id`) REFERENCES `production_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `sale_groups` (`id`, `name`, `kind`, `report_label`, `ticket_label`, `tax_components_json`, `active`) VALUES
	('sg-food', 'Food', 'food', 'Food', 'KOT', '[{"name":"CGST","rateBps":250},{"name":"SGST","rateBps":250}]', true),
	('sg-alcohol', 'Alcohol', 'alcohol', 'Alcohol', 'BOT', '[{"name":"VAT","rateBps":1000}]', true),
	('sg-beverage', 'Beverage', 'beverage', 'Beverage', 'KOT', '[{"name":"CGST","rateBps":250},{"name":"SGST","rateBps":250}]', true),
	('sg-other', 'Other', 'other', 'Other', 'KOT', '[]', true)
ON CONFLICT(`id`) DO NOTHING;
--> statement-breakpoint
ALTER TABLE `menu_items` ADD COLUMN `sale_group_id` text DEFAULT 'sg-food' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `sale_group_id` text DEFAULT 'sg-food' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `sale_group_name_snapshot` text DEFAULT 'Food' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `sale_group_kind_snapshot` text DEFAULT 'food' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `ticket_label_snapshot` text DEFAULT 'KOT' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `tax_components_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `tax_paise` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `is_open_item` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `bills` ADD COLUMN `tax_breakdown_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `bills` ADD COLUMN `revision_number` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `bills` ADD COLUMN `is_nc` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `bills` ADD COLUMN `nc_reason` text;
--> statement-breakpoint
ALTER TABLE `bills` ADD COLUMN `nc_approved_by` text;
--> statement-breakpoint
ALTER TABLE `bills` ADD COLUMN `nc_marked_at` text;
--> statement-breakpoint
ALTER TABLE `bills` ADD COLUMN `print_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `daily_report_snapshots` ADD COLUMN `group_summaries_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE `bill_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`subtotal_paise` integer NOT NULL,
	`tax_paise` integer NOT NULL,
	`total_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`tip_paise` integer DEFAULT 0 NOT NULL,
	`final_total_paise` integer NOT NULL,
	`tax_breakdown_json` text DEFAULT '[]' NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bill_revisions_bill` ON `bill_revisions` (`bill_id`,`revision_number`);
--> statement-breakpoint
CREATE TABLE `manager_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`requested_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_manager_approvals_aggregate` ON `manager_approvals` (`aggregate_type`,`aggregate_id`);
--> statement-breakpoint
CREATE TABLE `order_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`from_table_id` text NOT NULL,
	`to_table_id` text NOT NULL,
	`source_order_id` text NOT NULL,
	`target_order_id` text,
	`moved_items_json` text NOT NULL,
	`reason` text NOT NULL,
	`moved_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_order_movements_source` ON `order_movements` (`source_order_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `ticket_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_header` text DEFAULT '' NOT NULL,
	`bill_footer` text DEFAULT '' NOT NULL,
	`kot_header` text DEFAULT '' NOT NULL,
	`kot_footer` text DEFAULT '' NOT NULL,
	`restaurant_name` text DEFAULT '' NOT NULL,
	`tax_registration_text` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);

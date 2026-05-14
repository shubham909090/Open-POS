CREATE TABLE `menu_item_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_item_id` text NOT NULL,
	`label` text NOT NULL,
	`kind` text DEFAULT 'default' NOT NULL,
	`price_paise` integer NOT NULL,
	`volume_ml` integer,
	`inventory_action` text DEFAULT 'none' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_menu_item_variants_item` ON `menu_item_variants` (`menu_item_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_menu_item_variants_item_kind` ON `menu_item_variants` (`menu_item_id`,`kind`);
--> statement-breakpoint
CREATE TABLE `alcohol_profiles` (
	`menu_item_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`large_bottle_ml` integer DEFAULT 750 NOT NULL,
	`small_bottle_ml` integer DEFAULT 180 NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `alcohol_stock_levels` (
	`menu_item_id` text PRIMARY KEY NOT NULL,
	`sealed_large_count` integer DEFAULT 0 NOT NULL,
	`open_large_ml` integer DEFAULT 0 NOT NULL,
	`sealed_small_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `alcohol_recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`product_menu_item_id` text NOT NULL,
	`liquor_menu_item_id` text NOT NULL,
	`ml_per_unit` integer NOT NULL,
	FOREIGN KEY (`product_menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`liquor_menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_alcohol_recipe_product` ON `alcohol_recipe_ingredients` (`product_menu_item_id`);
--> statement-breakpoint
CREATE INDEX `idx_alcohol_recipe_liquor` ON `alcohol_recipe_ingredients` (`liquor_menu_item_id`);
--> statement-breakpoint
CREATE TABLE `alcohol_stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_item_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`delta_sealed_large` integer DEFAULT 0 NOT NULL,
	`delta_open_large_ml` integer DEFAULT 0 NOT NULL,
	`delta_sealed_small` integer DEFAULT 0 NOT NULL,
	`balance_sealed_large` integer NOT NULL,
	`balance_open_large_ml` integer NOT NULL,
	`balance_sealed_small` integer NOT NULL,
	`approved_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_alcohol_stock_movements_item` ON `alcohol_stock_movements` (`menu_item_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_alcohol_stock_movements_source` ON `alcohol_stock_movements` (`source_type`,`source_id`);
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `menu_item_variant_id` text REFERENCES `menu_item_variants`(`id`);
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `variant_name_snapshot` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `variant_volume_ml` integer;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `inventory_action_snapshot` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `menu_item_variants` (`id`, `menu_item_id`, `label`, `kind`, `price_paise`, `volume_ml`, `inventory_action`, `sort_order`, `active`)
SELECT `id` || '-default', `id`, 'Regular', 'default', `price_paise`, NULL, 'none', 0, `active`
FROM `menu_items`;

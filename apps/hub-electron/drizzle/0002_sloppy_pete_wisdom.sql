CREATE TABLE `menu_item_modifier_groups` (
	`menu_item_id` text NOT NULL,
	`group_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`menu_item_id`, `group_id`),
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `modifier_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_menu_modifier_group` ON `menu_item_modifier_groups` (`group_id`);--> statement-breakpoint
CREATE TABLE `modifier_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`selection_type` text NOT NULL,
	`min_selections` integer DEFAULT 0 NOT NULL,
	`max_selections` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `modifier_options` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`price_delta_paise` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `modifier_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_modifier_options_group` ON `modifier_options` (`group_id`);--> statement-breakpoint
CREATE TABLE `note_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`note` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `kot_items` ADD `modifiers_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `modifier_total_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `modifiers_json` text DEFAULT '[]' NOT NULL;
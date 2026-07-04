CREATE INDEX `idx_kots_status` ON `kots` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_kots_open_unit_created` ON `kots` (`production_unit_id`, `created_at`) WHERE `status` IN ('queued', 'preparing', 'ready');
--> statement-breakpoint
CREATE INDEX `idx_kot_items_kot` ON `kot_items` (`kot_id`);

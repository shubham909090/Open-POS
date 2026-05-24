CREATE TABLE `cloud_backup_tombstones` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `domain` text NOT NULL,
  `local_id` text NOT NULL,
  `business_date` text,
  `deleted_at` text NOT NULL,
  `pushed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_cloud_backup_tombstones_pending` ON `cloud_backup_tombstones` (`pushed_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cloud_backup_tombstones_domain_local` ON `cloud_backup_tombstones` (`domain`, `local_id`);

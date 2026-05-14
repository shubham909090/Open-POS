ALTER TABLE `idempotency_records` ADD COLUMN `status` text DEFAULT 'completed' NOT NULL;
--> statement-breakpoint
ALTER TABLE `idempotency_records` ADD COLUMN `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
CREATE TABLE `cloud_command_failures` (
	`command_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`error` text NOT NULL,
	`failed_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cloud_command_failures_failed_at` ON `cloud_command_failures` (`failed_at`);

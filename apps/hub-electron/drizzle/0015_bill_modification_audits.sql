CREATE TABLE `bill_modification_audits` (
  `id` text PRIMARY KEY NOT NULL,
  `bill_id` text NOT NULL,
  `order_id` text NOT NULL,
  `pos_day_id` text NOT NULL,
  `business_date` text NOT NULL,
  `bill_number` integer NOT NULL,
  `table_name_snapshot` text NOT NULL,
  `change_type` text NOT NULL,
  `from_revision_number` integer NOT NULL,
  `to_revision_number` integer NOT NULL,
  `reason` text NOT NULL,
  `approval_type` text NOT NULL,
  `approved_by` text NOT NULL,
  `actor_device_id` text NOT NULL,
  `actor_device_name` text NOT NULL,
  `actor_role` text NOT NULL,
  `before_json` text NOT NULL,
  `after_json` text NOT NULL,
  `diff_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`pos_day_id`) REFERENCES `pos_days`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bill_modification_audits_date` ON `bill_modification_audits` (`business_date`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_bill_modification_audits_bill_number` ON `bill_modification_audits` (`bill_number`);
--> statement-breakpoint
CREATE INDEX `idx_bill_modification_audits_bill` ON `bill_modification_audits` (`bill_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_bill_modification_audits_order` ON `bill_modification_audits` (`order_id`, `created_at`);

ALTER TABLE `bills` ADD COLUMN `bill_number` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `bills`
SET `bill_number` = (
  SELECT COUNT(*)
  FROM `bills` AS prior
  WHERE prior.`created_at` < `bills`.`created_at`
     OR (prior.`created_at` = `bills`.`created_at` AND prior.`id` <= `bills`.`id`)
)
WHERE `bill_number` = 0;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bills_bill_number` ON `bills` (`bill_number`);
--> statement-breakpoint
ALTER TABLE `kots` ADD COLUMN `ticket_label` text DEFAULT 'KOT' NOT NULL;
--> statement-breakpoint
UPDATE `kots`
SET `ticket_label` = COALESCE((
  SELECT `target_type`
  FROM `print_jobs`
  WHERE `print_jobs`.`target_id` = `kots`.`id`
    AND `print_jobs`.`target_type` IN ('KOT', 'BOT')
  ORDER BY `print_jobs`.`created_at` ASC
  LIMIT 1
), 'KOT');

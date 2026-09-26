ALTER TABLE `tests` ADD `category` enum('c','cpp','java','python','javascript','typescript','go','rust','sql','math','physics','other');--> statement-breakpoint
ALTER TABLE `tests` ADD `difficulty` enum('easy','medium','hard');--> statement-breakpoint
CREATE INDEX `tests_category_idx` ON `tests` (`category`);--> statement-breakpoint
CREATE INDEX `tests_difficulty_idx` ON `tests` (`difficulty`);
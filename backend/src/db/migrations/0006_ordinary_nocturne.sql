ALTER TABLE `test_attempts` ADD `option_order` json;--> statement-breakpoint
ALTER TABLE `tests` ADD `shuffle_options` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tests` ADD `max_attempts` int;--> statement-breakpoint
ALTER TABLE `tests` ADD `question_count` int;
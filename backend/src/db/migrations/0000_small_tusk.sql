CREATE TABLE `answer_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`question_id` int NOT NULL,
	`text` varchar(500) NOT NULL,
	`is_correct` boolean NOT NULL DEFAULT false,
	CONSTRAINT `answer_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `answer_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attempt_id` int NOT NULL,
	`question_id` int NOT NULL,
	`selected_option_id` int,
	`text_answer` text,
	`is_correct` boolean,
	CONSTRAINT `answer_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`test_id` int NOT NULL,
	`text` text NOT NULL,
	`type` enum('single_choice','multiple_choice','open_ended','true_false') NOT NULL,
	`order_index` int NOT NULL,
	CONSTRAINT `questions_id` PRIMARY KEY(`id`),
	CONSTRAINT `questions_test_order_unique` UNIQUE(`test_id`,`order_index`)
);
--> statement-breakpoint
CREATE TABLE `test_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`test_id` int NOT NULL,
	`status` enum('in_progress','completed','expired') NOT NULL DEFAULT 'in_progress',
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`score` decimal(5,2),
	`time_spent_seconds` int,
	CONSTRAINT `test_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`author_id` int NOT NULL,
	`is_published` boolean NOT NULL DEFAULT false,
	`shuffle_questions` boolean NOT NULL DEFAULT false,
	`time_limit_minutes` int,
	`show_answers_after_completion` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`username` varchar(100) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `answer_options` ADD CONSTRAINT `answer_options_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `answer_records` ADD CONSTRAINT `answer_records_attempt_id_test_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `test_attempts`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `answer_records` ADD CONSTRAINT `answer_records_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `answer_records` ADD CONSTRAINT `answer_records_selected_option_id_answer_options_id_fk` FOREIGN KEY (`selected_option_id`) REFERENCES `answer_options`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_test_id_tests_id_fk` FOREIGN KEY (`test_id`) REFERENCES `tests`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `test_attempts` ADD CONSTRAINT `test_attempts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `test_attempts` ADD CONSTRAINT `test_attempts_test_id_tests_id_fk` FOREIGN KEY (`test_id`) REFERENCES `tests`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `tests` ADD CONSTRAINT `tests_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `answer_options_question_id_idx` ON `answer_options` (`question_id`);--> statement-breakpoint
CREATE INDEX `answer_records_attempt_id_idx` ON `answer_records` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `answer_records_question_id_idx` ON `answer_records` (`question_id`);--> statement-breakpoint
CREATE INDEX `questions_test_id_idx` ON `questions` (`test_id`);--> statement-breakpoint
CREATE INDEX `test_attempts_user_id_idx` ON `test_attempts` (`user_id`);--> statement-breakpoint
CREATE INDEX `test_attempts_test_id_idx` ON `test_attempts` (`test_id`);--> statement-breakpoint
CREATE INDEX `test_attempts_status_idx` ON `test_attempts` (`status`);--> statement-breakpoint
CREATE INDEX `tests_author_id_idx` ON `tests` (`author_id`);
-- 0008 starts by dropping its own tables: MySQL DDL implicit-commits, so
-- a boot that dies mid-migration leaves these tables behind while the
-- journal still lists 0008 as pending. Rebuilding from the JSON columns,
-- which are only dropped at the very end, is deterministic and loses
-- nothing, and makes every statement below safe to run again.
DROP TABLE IF EXISTS `attempt_question_options`, `attempt_questions`;
--> statement-breakpoint
CREATE TABLE `attempt_question_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attempt_id` int NOT NULL,
	`question_id` int NOT NULL,
	`option_id` int NOT NULL,
	`position` int NOT NULL,
	CONSTRAINT `attempt_question_options_id` PRIMARY KEY(`id`),
	CONSTRAINT `attempt_question_options_attempt_question_option_unique` UNIQUE(`attempt_id`,`question_id`,`option_id`),
	CONSTRAINT `attempt_question_options_attempt_question_position_unique` UNIQUE(`attempt_id`,`question_id`,`position`)
);
--> statement-breakpoint
CREATE TABLE `attempt_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attempt_id` int NOT NULL,
	`question_id` int NOT NULL,
	`position` int NOT NULL,
	CONSTRAINT `attempt_questions_id` PRIMARY KEY(`id`),
	CONSTRAINT `attempt_questions_attempt_question_unique` UNIQUE(`attempt_id`,`question_id`),
	CONSTRAINT `attempt_questions_attempt_position_unique` UNIQUE(`attempt_id`,`position`)
);
--> statement-breakpoint
ALTER TABLE `attempt_question_options` ADD CONSTRAINT `attempt_question_options_attempt_id_test_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `test_attempts`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `attempt_question_options` ADD CONSTRAINT `attempt_question_options_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `attempt_question_options` ADD CONSTRAINT `attempt_question_options_option_id_answer_options_id_fk` FOREIGN KEY (`option_id`) REFERENCES `answer_options`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `attempt_questions` ADD CONSTRAINT `attempt_questions_attempt_id_test_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `test_attempts`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `attempt_questions` ADD CONSTRAINT `attempt_questions_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `attempt_question_options_attempt_id_idx` ON `attempt_question_options` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `attempt_questions_attempt_id_idx` ON `attempt_questions` (`attempt_id`);--> statement-breakpoint
-- Backfill from the JSON columns below before they are dropped. Both
-- writers only ever stored machine-built arrays of integer ids, but the
-- statements stay total anyway: ids are extracted as text and non-numeric
-- entries are skipped instead of aborting the migration, and such attempts
-- simply fall back to natural order at read time. Dangling historic ids
-- (questions deleted before the restrict guard existed) are skipped via
-- EXISTS so the new foreign keys cannot fail, and repeated ids within one
-- attempt collapse to a single row keeping the earliest position, so the
-- UNIQUE constraints cannot fail either.
INSERT INTO `attempt_questions` (`attempt_id`, `question_id`, `position`)
SELECT `attempt_id`, `question_id`, MIN(`position`)
FROM (
  SELECT `a`.`id` AS `attempt_id`, CAST(`j`.`qid` AS UNSIGNED) AS `question_id`, `j`.`pos` - 1 AS `position`
  FROM `test_attempts` AS `a`,
    JSON_TABLE(`a`.`question_order`, '$[*]' COLUMNS (`pos` FOR ORDINALITY, `qid` VARCHAR(64) PATH '$')) AS `j`
  WHERE `a`.`question_order` IS NOT NULL AND `j`.`qid` REGEXP '^[0-9]+$'
    AND EXISTS (SELECT 1 FROM `questions` AS `q` WHERE `q`.`id` = CAST(`j`.`qid` AS UNSIGNED))
) AS `deduped`
GROUP BY `attempt_id`, `question_id`;--> statement-breakpoint
-- option_order is an object keyed by question id, so its keys are enumerated
-- first and each member array is unnested through a chained JSON_TABLE. Each
-- table function sees the range variables bound earlier in the FROM clause,
-- so the second one references `k`.`qkey` with no extra keyword: LATERAL is
-- only valid before derived tables and is a syntax error before JSON_TABLE.
INSERT INTO `attempt_question_options` (`attempt_id`, `question_id`, `option_id`, `position`)
SELECT `attempt_id`, `question_id`, `option_id`, MIN(`position`)
FROM (
  SELECT `a`.`id` AS `attempt_id`, CAST(`k`.`qkey` AS UNSIGNED) AS `question_id`, CAST(`j`.`oid` AS UNSIGNED) AS `option_id`, `j`.`pos` - 1 AS `position`
  FROM `test_attempts` AS `a`,
    JSON_TABLE(JSON_KEYS(`a`.`option_order`), '$[*]' COLUMNS (`qkey` VARCHAR(64) PATH '$')) AS `k`,
    JSON_TABLE(JSON_EXTRACT(`a`.`option_order`, CONCAT('$."', `k`.`qkey`, '"')), '$[*]' COLUMNS (`pos` FOR ORDINALITY, `oid` VARCHAR(64) PATH '$')) AS `j`
  WHERE `a`.`option_order` IS NOT NULL AND `k`.`qkey` REGEXP '^[0-9]+$' AND `j`.`oid` REGEXP '^[0-9]+$'
    AND EXISTS (SELECT 1 FROM `questions` AS `q` WHERE `q`.`id` = CAST(`k`.`qkey` AS UNSIGNED))
    AND EXISTS (SELECT 1 FROM `answer_options` AS `o` WHERE `o`.`id` = CAST(`j`.`oid` AS UNSIGNED))
) AS `deduped`
GROUP BY `attempt_id`, `question_id`, `option_id`;--> statement-breakpoint
-- Both columns go in one statement so a crash between two DROPs cannot leave
-- a half-migrated table behind on the next run.
ALTER TABLE `test_attempts` DROP COLUMN `question_order`, DROP COLUMN `option_order`;
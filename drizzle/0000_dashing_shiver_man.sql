CREATE TABLE `records` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`body` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);

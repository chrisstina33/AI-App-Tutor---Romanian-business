CREATE TABLE `center_access_codes` (
	`codeHash` varchar(64) NOT NULL,
	`centerId` int NOT NULL,
	`createdBy` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `center_access_codes_codeHash` PRIMARY KEY(`codeHash`)
);
--> statement-breakpoint
CREATE TABLE `center_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`centerId` int NOT NULL,
	`applicantId` int NOT NULL,
	`details` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `center_applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `center_applications_centerId_unique` UNIQUE(`centerId`),
	CONSTRAINT `center_applications_applicantId_unique` UNIQUE(`applicantId`)
);
--> statement-breakpoint
CREATE TABLE `center_materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`centerId` int NOT NULL,
	`uploadedBy` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`subject` varchar(80),
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `center_materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `auth_accounts` MODIFY COLUMN `accountType` enum('student','parent','educator') NOT NULL;--> statement-breakpoint
ALTER TABLE `center_access_codes` ADD CONSTRAINT `center_access_codes_centerId_educational_centers_id_fk` FOREIGN KEY (`centerId`) REFERENCES `educational_centers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `center_access_codes` ADD CONSTRAINT `center_access_codes_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `center_applications` ADD CONSTRAINT `center_applications_centerId_educational_centers_id_fk` FOREIGN KEY (`centerId`) REFERENCES `educational_centers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `center_applications` ADD CONSTRAINT `center_applications_applicantId_users_id_fk` FOREIGN KEY (`applicantId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `center_materials` ADD CONSTRAINT `center_materials_centerId_educational_centers_id_fk` FOREIGN KEY (`centerId`) REFERENCES `educational_centers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `center_materials` ADD CONSTRAINT `center_materials_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `center_access_codes_center_idx` ON `center_access_codes` (`centerId`);--> statement-breakpoint
CREATE INDEX `center_applications_status_idx` ON `center_applications` (`status`);--> statement-breakpoint
CREATE INDEX `center_materials_center_idx` ON `center_materials` (`centerId`);
CREATE TABLE `center_join_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`centerId` int NOT NULL,
	`studentId` int NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `center_join_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `center_join_request_unique` UNIQUE(`centerId`,`studentId`)
);
--> statement-breakpoint
ALTER TABLE `educational_centers` ADD `studentJoinMode` enum('approval','automatic') DEFAULT 'approval' NOT NULL;--> statement-breakpoint
ALTER TABLE `center_join_requests` ADD CONSTRAINT `center_join_requests_centerId_educational_centers_id_fk` FOREIGN KEY (`centerId`) REFERENCES `educational_centers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `center_join_requests` ADD CONSTRAINT `center_join_requests_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `center_join_requests_center_status_idx` ON `center_join_requests` (`centerId`,`status`);
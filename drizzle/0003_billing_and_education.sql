CREATE TABLE `billing_events` (
	`eventId` varchar(255) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `billing_events_eventId` PRIMARY KEY(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `educational_centers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`billingEmail` varchar(320),
	`status` enum('draft','active','suspended') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `educational_centers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `center_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`centerId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','educator','student') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `center_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `center_user_unique` UNIQUE(`centerId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int NOT NULL,
	`studentId` int NOT NULL,
	`stripeCustomerId` varchar(255) NOT NULL,
	`stripeSubscriptionId` varchar(255) NOT NULL,
	`status` varchar(32) NOT NULL,
	`currentPeriodEnd` timestamp,
	`cancelAtPeriodEnd` int NOT NULL DEFAULT 0,
	`lastStripeEventCreatedAt` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_stripeSubscriptionId_unique` UNIQUE(`stripeSubscriptionId`)
);
--> statement-breakpoint
ALTER TABLE `center_memberships` ADD CONSTRAINT `center_memberships_centerId_educational_centers_id_fk` FOREIGN KEY (`centerId`) REFERENCES `educational_centers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `center_memberships` ADD CONSTRAINT `center_memberships_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_parentId_users_id_fk` FOREIGN KEY (`parentId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `subscriptions_parent_status_idx` ON `subscriptions` (`parentId`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_student_status_idx` ON `subscriptions` (`studentId`,`status`);

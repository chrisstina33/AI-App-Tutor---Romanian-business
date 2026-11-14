CREATE TABLE `auth_accounts` (
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`accountType` enum('student','parent') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `auth_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
	CONSTRAINT `auth_accounts_userId_pk` PRIMARY KEY(`userId`),
	CONSTRAINT `auth_accounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`tokenHash` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `auth_sessions_tokenHash_pk` PRIMARY KEY(`tokenHash`),
	CONSTRAINT `auth_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE TABLE `parent_invites` (
	`codeHash` varchar(64) NOT NULL,
	`studentId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	CONSTRAINT `parent_invites_codeHash_pk` PRIMARY KEY(`codeHash`),
	CONSTRAINT `parent_invites_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE TABLE `parent_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int NOT NULL,
	`studentId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `parent_links_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `parent_links_parentId_users_id_fk` FOREIGN KEY (`parentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
	CONSTRAINT `parent_links_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parent_student_unique` ON `parent_links` (`parentId`,`studentId`);

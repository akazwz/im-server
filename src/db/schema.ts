import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: text()
		.primaryKey()
		.notNull()
		.$defaultFn(() => crypto.randomUUID()),
	username: text().notNull(),
	nickname: text().notNull(),
	avatar: text(),
	age: int().notNull(),
	email: text().notNull().unique(),
});

import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{owner:text('owner').notNull(),id:text('id').notNull(),body:text('body').notNull(),version:integer('version').notNull().default(1)},t=>[primaryKey({columns:[t.owner,t.id]})]);

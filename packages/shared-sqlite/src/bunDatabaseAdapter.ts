import type { SqliteDb, SqliteStmt } from "./types.js";

type BunSqliteQueryLike = {
  get(...args: any[]): any;
  all(...args: any[]): any[];
  run(...args: any[]): any;
};

type BunDatabaseLike = {
  exec(sql: string): void;
  query(sql: string): BunSqliteQueryLike;
  close(): void;
};

export function bunDbAdapter(db: BunDatabaseLike): SqliteDb {
  return {
    exec(sql: string) {
      db.exec(sql);
    },
    prepare(sql: string): SqliteStmt {
      return db.query(sql) as unknown as SqliteStmt;
    },
    close() {
      db.close();
    },
  };
}


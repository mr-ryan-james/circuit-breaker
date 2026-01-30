import type { SqliteDb, SqliteStmt } from "./types.js";

type NodeDatabaseSyncLike = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStmt;
  close(): void;
};

export function nodeDbAdapter(db: NodeDatabaseSyncLike): SqliteDb {
  return {
    exec(sql: string) {
      db.exec(sql);
    },
    prepare(sql: string) {
      return db.prepare(sql);
    },
    close() {
      db.close();
    },
  };
}


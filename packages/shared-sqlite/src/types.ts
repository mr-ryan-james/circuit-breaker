export interface SqliteStmt {
  get(...args: any[]): any;
  all(...args: any[]): any[];
  run(...args: any[]): any;
}

export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStmt;
  close(): void;
}


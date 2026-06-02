import type Database from "better-sqlite3";
import { silentPlannerLogger, type PlannerLogger } from "./_planner-types.js";

export class PlannerSql {
  readonly #database: Database.Database;
  readonly #logger: PlannerLogger;

  constructor(database: Database.Database, logger: PlannerLogger = silentPlannerLogger) {
    this.#database = database;
    this.#logger = logger;
  }

  get database(): Database.Database {
    return this.#database;
  }

  get logger(): PlannerLogger {
    return this.#logger;
  }

  exec(sql: string, params: Array<number | string | null> = []): void {
    this.#traceSql(sql, params);
    const startedAt = Date.now();
    this.#database.prepare(sql).run(...params);
    this.#logger.trace(`SQL exec completed in ${Date.now() - startedAt} ms`);
  }

  get<T>(sql: string, params: Array<number | string>): T | undefined {
    this.#debugSql(sql, params);
    this.#traceSql(sql, params);
    const startedAt = Date.now();
    const row = this.#database.prepare(sql).get(...params) as T | undefined;
    this.#logger.debug(`SQL returned ${row === undefined ? "0" : "1"} row(s) in ${Date.now() - startedAt} ms`);
    return row;
  }

  all<T>(sql: string, params: Array<number | string>): T[] {
    this.#debugSql(sql, params);
    this.#traceSql(sql, params);
    const startedAt = Date.now();
    const rows = this.#database.prepare(sql).all(...params) as T[];
    this.#logger.debug(`SQL returned ${rows.length} row(s) in ${Date.now() - startedAt} ms`);
    return rows;
  }

  traceSql(sql: string, params: Array<number | string | null>): void {
    this.#traceSql(sql, params);
  }

  #traceSql(sql: string, params: Array<number | string | null>): void {
    this.#logger.trace(`SQL:\n${sql.trim()}\nPARAMS: ${JSON.stringify(params)}`);
  }

  #debugSql(sql: string, params: Array<number | string | null>): void {
    this.#logger.debug(`SQL:\n${sql.trim()}\nPARAMS: ${JSON.stringify(params)}`);
  }
}

import { neon } from '@neondatabase/serverless';

// 懒加载 SQL 客户端：只有在真正执行查询时才要求 DATABASE_URL 存在，
// 避免 `next build` 阶段因为缺少环境变量而报错。
const connectionString = process.env.DATABASE_URL;
export const sql = connectionString ? neon(connectionString) : null;

export type Sql = NonNullable<typeof sql>;

export function requireSql(): Sql {
  if (!sql) {
    throw new Error('缺少 DATABASE_URL 环境变量，无法连接数据库');
  }
  return sql;
}

let tableReady: Promise<void> | null = null;

/** 幂等地建表（CREATE TABLE IF NOT EXISTS），首次调用时执行。 */
export async function ensureTable(): Promise<void> {
  if (!tableReady) {
    const db = requireSql();
    tableReady = db`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        emails TEXT NOT NULL DEFAULT '[]',
        last_checkin TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        alerted BOOLEAN NOT NULL DEFAULT false,
        alert_sent_at TIMESTAMPTZ
      )
    `.then(() => undefined);
  }
  return tableReady;
}

/** 连续多少天未签到触发预警（小时）。 */
export const ALERT_AFTER_HOURS = 48;

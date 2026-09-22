import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { requireSql, ensureTable } from './db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function extractToken(req: Request): string {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

/** 根据请求头里的 Bearer token 查找用户，未登录返回 null。 */
export async function getUserByToken(req: Request): Promise<Record<string, unknown> | null> {
  const token = extractToken(req);
  if (!token) return null;
  await ensureTable();
  const db = requireSql();
  const rows = await db`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ${token}
  `;
  return rows.length ? (rows[0] as Record<string, unknown>) : null;
}

/** 判断用户是否为管理员（邮箱匹配 ADMIN_EMAIL）。 */
export function isAdmin(user: Record<string, unknown> | null): boolean {
  if (!user) return false;
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!adminEmail) return false;
  return String(user.email || '').toLowerCase() === adminEmail;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 校验并规范化联系人邮箱：
 * - 去掉空项、去重、转小写
 * - 至少 1 个、最多 3 个
 */
export function normalizeEmails(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map((e) => String(e)) : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    const email = item.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      throw new Error(`邮箱格式不正确：${email}`);
    }
    if (!seen.has(email)) {
      seen.add(email);
      result.push(email);
    }
  }

  if (result.length === 0) {
    throw new Error('请至少填写一个联系人邮箱');
  }
  if (result.length > 3) {
    throw new Error('最多只能设置 3 个联系人邮箱');
  }
  return result;
}

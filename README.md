# 平安签到 🕊️

一个极简的「死亡开关 / 平安签到」网页应用：

- **无需注册、无需密码**：录入 1~3 位紧急联系人的邮箱，系统生成一个专属签到链接。
- **每日手动签到一次**：每天打开链接点一下「签到」即可。
- **连续两天未签到自动预警**：若连续 48 小时未签到，系统自动向联系人发送预警邮件。
- **签到即解除预警**：一旦你重新签到，预警标记会被重置。

## 技术栈

- **前端 / 后端**：Next.js 14（App Router，服务端 API 路由）
- **数据库**：[Neon Postgres](https://neon.tech)（免费，兼容 Vercel）
- **邮件**：nodemailer + 你自己的 SMTP 邮箱（QQ / 163 / Gmail / Outlook 均可）
- **定时任务**：Vercel Cron（每天 UTC 09:00 ≈ 北京时间 17:00 触发一次）
- **部署**：Vercel（连接 GitHub 仓库，push 自动部署）

## 目录结构

```
app/
  page.tsx                  # 前端页面（设置 / 签到 / 状态 / 编辑）
  layout.tsx
  globals.css
  api/
    setup/route.ts          # POST 创建用户
    checkin/route.ts        # POST 每日签到
    status/route.ts         # GET  查询状态
    update/route.ts         # POST 修改昵称/联系人
    cron/route.ts           # GET  定时检测并发送预警邮件
    test-email/route.ts     # POST 发送测试邮件
lib/
  db.ts                     # Neon 连接 + 建表
  mailer.ts                 # SMTP 发信
  emails.ts                 # 邮箱校验
vercel.json                 # Vercel Cron 配置
```

## 上线步骤

### 1. 推到 GitHub

```bash
git init
git add .
git commit -m "feat: 平安签到应用"
git branch -M main
git remote add origin https://github.com/<你的用户名>/pingan-checkin.git
git push -u origin main
```

> 或在 GitHub 网页新建仓库后按提示推送。

### 2. 准备数据库（Neon，免费）

1. 打开 [console.neon.tech](https://console.neon.tech)，注册 / 登录。
2. 新建一个 Project（地区随意）。
3. 复制 **Connection string**（形如 `postgresql://user:pass@host/db?sslmode=require`）。

### 3. 准备 SMTP 邮箱

用你自己的邮箱作为发件人。以 **QQ 邮箱**为例：

1. 登录 QQ 邮箱 → 设置 → 账户 → 开启 **SMTP 服务**。
2. 系统会给你一个 **授权码**（不是登录密码）。
3. 记录：`SMTP_HOST=smtp.qq.com`、`SMTP_PORT=465`、`SMTP_SECURE=true`、`SMTP_USER=你的QQ邮箱`、`SMTP_PASS=授权码`。

其他邮箱参考：

| 邮箱   | SMTP_HOST       | 端口 / 加密   | 密码说明       |
| ------ | --------------- | ------------- | -------------- |
| QQ     | smtp.qq.com     | 465 / SSL     | 授权码         |
| 163    | smtp.163.com    | 465 / SSL     | 授权码         |
| Gmail  | smtp.gmail.com  | 465 / SSL     | 应用专用密码   |
| Outlook| smtp.office365.com | 587 / STARTTLS | 登录密码或应用密码 |

> 端口 465 → `SMTP_SECURE=true`；端口 587 → `SMTP_SECURE=false`。

### 4. 部署到 Vercel

1. 打开 [vercel.com](https://vercel.com)，用 GitHub 账号登录。
2. **Add New → Project → Import** 选择 `pingan-checkin` 仓库。
3. Framework 自动识别为 Next.js，直接 **Deploy**。
4. 部署完成后，进入 **Settings → Environment Variables**，添加：

| 名称          | 值                                  |
| ------------- | ------------------------------------ |
| `DATABASE_URL` | 第 2 步复制的 Neon 连接串            |
| `SMTP_HOST`    | 例如 `smtp.qq.com`                  |
| `SMTP_PORT`    | 例如 `465`                          |
| `SMTP_SECURE`  | `true`（587 则填 `false`）          |
| `SMTP_USER`    | 你的发件邮箱                        |
| `SMTP_PASS`    | 授权码 / 应用密码                    |
| `FROM_EMAIL`   | （可选）发件地址，默认等于 SMTP_USER |

5. 保存后 Vercel 会自动 **Redeploy**，之后即可访问你的域名。

> `vercel.json` 中的 cron 会被 Vercel 自动识别，无需额外配置。
> Vercel 会自动注入 `CRON_SECRET` 用于保护定时接口。

### 5. 验证

1. 打开应用，录入联系人邮箱，复制并保存签到链接。
2. 点击「发送测试邮件」，确认能收到测试邮件 → SMTP 配置成功。
3. 点击「签到」→ 显示上次签到时间、剩余安全时间。
4. 手动验证预警：浏览器打开 `https://<你的域名>/api/cron` 带上鉴权头（生产环境由 Vercel 自动调度）。

## 本地运行（可选）

```bash
npm install
cp .env.example .env.local   # 填入真实配置
npm run dev
```

打开 http://localhost:3000 。

## 说明

- 预警逻辑：`上次签到时间（无则用创建时间）` 距今超过 **48 小时** 即触发，且每个「未签到周期」只发一次（重新签到后重置）。
- 该应用用于个人平安守护，请勿用于骚扰他人；联系人邮箱需为本人自愿提供的真实邮箱。

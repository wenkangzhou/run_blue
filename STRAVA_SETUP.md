# Strava 配置指南

## 1. 创建 Strava 应用

1. 访问 [Strava Settings](https://www.strava.com/settings/api)
2. 点击 **Create App**
3. 填写应用信息：
   - **Application Name**: 跑蓝 (或 Run Blue)
   - **Category**: Training / Health & Fitness
   - **Website**: `https://your-domain.com`
   - **Authorization Callback Domain**: `your-domain.com`
     - ⚠️ **只填域名，不加 `https://`、端口号和路径！**
     - 例如：`localhost`、`runblue.vercel.app`、`running.example.com`
4. 点击 **Create**

## 2. 获取密钥

创建后会得到：
- **Client ID**: 例如 `123456`
- **Client Secret**: 点击显示，例如 `abc123def456...`

## 3. 配置环境变量

在 Vercel / 生产环境变量中添加：

```env
NEXT_PUBLIC_STRAVA_CLIENT_ID=你的Client_ID
STRAVA_CLIENT_SECRET=你的Client_Secret
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

本地开发时 `.env.local`：

```env
NEXT_PUBLIC_STRAVA_CLIENT_ID=你的Client_ID
STRAVA_CLIENT_SECRET=你的Client_Secret
NEXT_PUBLIC_APP_URL=http://localhost:6364
```

> 📌 **关键**：`NEXT_PUBLIC_APP_URL` 必须与 Strava 后台的 **Authorization Callback Domain** 一致。
> 
> 例如：
> - Strava 填 `your-domain.com` → `.env` 写 `https://your-domain.com`
> - Strava 填 `localhost` → `.env` 写 `http://localhost:6364`

## 4. 授权范围

本应用只需要：
- `read` - 读取用户公开资料
- `activity:read` - 读取活动数据

**不需要**: `activity:write` (写入权限)

## 5. Callback Domain 切换（本地 ↔ 生产）

Strava 只允许一个 Callback Domain，切换时注意：

| 场景 | Strava Callback Domain | `NEXT_PUBLIC_APP_URL` |
|------|------------------------|----------------------|
| 本地开发 | `localhost` | `http://localhost:6364` |
| 生产环境 | `your-domain.com` | `https://your-domain.com` |
| 用 ngrok 调试 | `xxxx.ngrok-free.app` | `https://xxxx.ngrok-free.app` |

### 切换步骤

1. 去 [Strava API Settings](https://www.strava.com/settings/api) 修改 Authorization Callback Domain
2. 同步修改 `.env.local` 或 Vercel 环境变量里的 `NEXT_PUBLIC_APP_URL`
3. 重新部署（如果改了生产环境变量）
4. 重新登录测试

## 常见问题

### Q: 报错 "redirect_uri invalid"
A: 检查 `NEXT_PUBLIC_APP_URL` 是否与 Strava 后台的 Authorization Callback Domain 匹配。

例如 Strava 填的是 `your-domain.com`，但 `.env` 里写的是 `http://localhost:6364`，就会报错。

### Q: 本地开发无法登录？
A: 如果 Strava 后台配置的是生产域名，本地开发需要：
- **方案A**：临时把 Strava Callback Domain 改成 `localhost`，开发完再改回去
- **方案B**：使用 ngrok 生成一个公网域名，把 Strava Callback Domain 改成 ngrok 域名

```bash
# 方案B示例
npx ngrok http 6364
# 得到 https://xxxx.ngrok-free.app
# 把 Strava Callback Domain 改成 xxxx.ngrok-free.app
# NEXT_PUBLIC_APP_URL=https://xxxx.ngrok-free.app
```

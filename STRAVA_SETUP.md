# Strava 配置指南

## 1. 创建 Strava 应用

1. 访问 [Strava Settings](https://www.strava.com/settings/api)
2. 点击 **Create App**
3. 填写应用信息：
   - **Application Name**: 跑蓝 (或 Run Blue)
   - **Category**: Training / Health & Fitness
   - **Website**: http://localhost:6364 (本地开发)
   - **Authorization Callback Domain**: `localhost`
     - ⚠️ **只填域名，不加端口号！**
4. 点击 **Create**

## 2. 获取密钥

创建后会得到：
- **Client ID**: 例如 `123456`
- **Client Secret**: 点击显示，例如 `abc123def456...`

## 3. 配置环境变量

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_STRAVA_CLIENT_ID=你的Client_ID
STRAVA_CLIENT_SECRET=你的Client_Secret
```

## 4. 本地开发测试

```bash
npm run dev
# 访问 http://localhost:6364
```

## 5. 部署到生产环境

### 方案 A: 修改已有应用（简单）

1. 在 [Strava API Settings](https://www.strava.com/settings/api) 修改你的应用
2. 把 **Authorization Callback Domain** 从 `localhost` 改成你的生产域名
   - 例如: `run-blue.vercel.app` (不要加 https:// 和路径)
3. 部署代码到生产环境
4. 用生产域名访问

⚠️ **缺点**: 开发时需要改回 localhost，比较麻烦

### 方案 B: 创建两个应用（推荐）

创建两个 Strava 应用：

| 用途 | 应用名称 | Authorization Callback Domain |
|------|---------|------------------------------|
| 开发 | 跑蓝 - Dev | `localhost` |
| 生产 | 跑蓝 | `run-blue.vercel.app` |

然后在 Vercel 部署时配置生产应用的环境变量。

## 常见问题

### Q: 报错 "redirect_uri invalid"
A: 
1. 检查 **Authorization Callback Domain** 是否匹配
2. 确保没有加 `http://` 或端口号
3. OAuth 回调地址是自动生成的，格式为 `{domain}/api/auth/callback/strava`

### Q: 开发时能用生产域名测试吗？
A: 可以，用 ngrok:
```bash
npx ngrok http 6364
```
然后把生成的临时域名（如 `https://abc123.ngrok-free.app`）填到 Strava 应用的 Callback Domain。

## 授权范围说明

本应用只需要：
- `read` - 读取用户公开资料
- `activity:read` - 读取活动数据

**不需要**: `activity:write` (写入权限)

# Strava 配置指南

你的 Callback Domain: `runblue.yibuu.com`

## 1. 创建 Strava 应用

1. 访问 [Strava Settings](https://www.strava.com/settings/api)
2. 点击 **Create App**
3. 填写应用信息：
   - **Application Name**: 跑蓝 (或 Run Blue)
   - **Category**: Training / Health & Fitness
   - **Website**: https://runblue.yibuu.com
   - **Authorization Callback Domain**: `runblue.yibuu.com`
     - ⚠️ **只填域名，不加端口号和路径！**
4. 点击 **Create**

## 2. 获取密钥

创建后会得到：
- **Client ID**: 例如 `123456`
- **Client Secret**: 点击显示，例如 `abc123def456...`

## 3. 配置环境变量

在 Vercel 环境变量中添加：

```env
NEXT_PUBLIC_STRAVA_CLIENT_ID=你的Client_ID
STRAVA_CLIENT_SECRET=你的Client_Secret
NEXT_PUBLIC_APP_URL=https://runblue.yibuu.com
```

本地开发时 `.env.local`：

```env
NEXT_PUBLIC_STRAVA_CLIENT_ID=你的Client_ID
STRAVA_CLIENT_SECRET=你的Client_Secret
NEXT_PUBLIC_APP_URL=http://localhost:6364
```

## 4. 授权范围

本应用只需要：
- `read` - 读取用户公开资料
- `activity:read` - 读取活动数据

**不需要**: `activity:write` (写入权限)

## 常见问题

### Q: 报错 "redirect_uri invalid"
A: 检查 Authorization Callback Domain 是否匹配当前域名

### Q: 本地开发无法登录？
A: Strava 只支持一个 Callback Domain，生产环境配置后本地开发需要临时改为 localhost，或者使用 ngrok 代理

## 你的配置

| 项目 | 值 |
|------|-----|
| 生产域名 | https://runblue.yibuu.com |
| Callback Domain | runblue.yibuu.com |

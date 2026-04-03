# Strava 配置指南

## 1. 创建 Strava 应用

1. 访问 [Strava Developers](https://developers.strava.com/)
2. 点击右上角头像 → **Settings**
3. 在左侧菜单点击 **My API Application**
4. 填写应用信息：
   - **Application Name**: 跑蓝 (或 Run Blue)
   - **Category**: 选择 "Training" 或 "Other"
   - **Website**: 你的应用网址 (本地开发可用 http://localhost:6364)
   - **Application Description**: 跑步数据可视化应用
   - **Authorization Callback Domain**: `localhost:6364`
     - ⚠️ **注意**: 只填域名，不要加 `http://` 或路径
5. 点击 **Create**

## 2. 获取密钥

创建后会得到：
- **Client ID**: 例如 `123456`
- **Client Secret**: 例如 `abc123def456...` (点击显示)

## 3. 配置环境变量

在 `.env.local` 文件中添加：

```env
# Strava API
NEXT_PUBLIC_STRAVA_CLIENT_ID=你的Client_ID
STRAVA_CLIENT_SECRET=你的Client_Secret

# 应用 URL
NEXTAUTH_URL=http://localhost:6364
```

## 4. 授权范围说明

本应用只需要以下权限：
- `read` - 读取用户公开资料
- `activity:read` - 读取活动数据

**不需要**: `activity:write` (写入权限)

## 5. 部署到生产环境时

1. 在 Strava 应用设置中修改 **Authorization Callback Domain** 为你的生产域名
   - 例如: `run-blue.vercel.app` (不要加 https://)

2. 更新 `.env.local` 中的 `NEXTAUTH_URL`:
   ```env
   NEXTAUTH_URL=https://run-blue.vercel.app
   ```

## 常见问题

### Q: 报错 "redirect_uri invalid"
A: 检查 Authorization Callback Domain 是否匹配当前域名

### Q: 报错 "access denied"
A: 用户点击了拒绝授权，需要重新授权

### Q: Token 过期怎么办？
A: 应用会自动使用 refresh_token 刷新 access_token

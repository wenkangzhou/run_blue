# 跑蓝 Run Blue

一个像素极简风格的跑步数据可视化网站，数据来源于 Strava。

## 在线访问

https://runblue.yibuu.com

## 核心功能

- 🔐 **Strava OAuth 登录** - 唯一登录方式，无需注册账号
- 🗺️ **跑步路线地图** - 使用 Leaflet 展示 GPS 轨迹
- 📊 **数据统计** - 距离、时间、配速等关键指标
- 📈 **活动详情** - 分段数据、心率/配速/海拔图表
- 🌐 **中英文切换** - 支持双语界面
- 🌙 **深色/浅色主题** - 自动适配系统主题
- 📱 **PWA 支持** - 可添加到主屏幕，离线访问
- ⚡ **智能缓存** - 本地缓存数据，自动检测并同步新活动

## 最近更新

- ✅ 修复分页加载问题，支持加载更多历史数据
- ✅ 添加 Token 自动刷新，避免频繁重新登录
- ✅ 修复时区显示，正确展示本地时间
- ✅ 优化配速图表显示格式
- ✅ 改进下拉菜单位置和交互
- ✅ 智能缓存策略：缓存未过期时自动检测新活动

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript
- **样式**: Tailwind CSS 4 (像素极简风格)
- **地图**: Leaflet + React-Leaflet
- **状态**: Zustand + 持久化缓存
- **国际化**: i18next
- **主题**: next-themes
- **部署**: Vercel

## 本地开发

### 1. 克隆代码

```bash
git clone https://github.com/wenkangzhou/run_blue.git
cd run_blue
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_STRAVA_CLIENT_ID=你的Client_ID
STRAVA_CLIENT_SECRET=你的Client_Secret
NEXT_PUBLIC_APP_URL=http://localhost:6364
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:6364

## Strava 应用配置

1. 访问 [Strava Settings](https://www.strava.com/settings/api)
2. 创建应用，**关键配置**:
   - **Authorization Callback Domain**: 
     - 生产环境: `runblue.yibuu.com`
     - 本地开发: `localhost`
3. 复制 Client ID 和 Client Secret

详细配置见 [STRAVA_SETUP.md](./STRAVA_SETUP.md)

## License

MIT

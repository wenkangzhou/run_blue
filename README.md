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

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript
- **样式**: Tailwind CSS 4 (像素极简风格)
- **地图**: Leaflet + React-Leaflet
- **状态**: Zustand
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

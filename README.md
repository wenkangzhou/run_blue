# 跑蓝 Run Blue

一个像素极简风格的跑步数据可视化网站，数据来源于 Strava。

## 核心功能

- 🔐 **Strava OAuth 登录** - 唯一登录方式，无需注册账号
- 🗺️ **跑步路线地图** - 使用 Leaflet 展示 GPS 轨迹
- 📊 **数据统计** - 距离、时间、配速等关键指标
- 🌐 **中英文切换** - 支持双语界面
- 🌙 **深色/浅色主题** - 自动适配系统主题

## 快速开始

### 1. 克隆代码

```bash
git clone https://github.com/wenkangzhou/run_blue.git
cd run_blue
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 Strava

1. 访问 [Strava API Settings](https://www.strava.com/settings/api)
2. 创建应用，**关键配置**:
   - **Authorization Callback Domain**: `localhost` (只填域名，不加端口号！)
3. 复制 Client ID 和 Client Secret
4. 创建 `.env.local` 文件：

```env
NEXT_PUBLIC_STRAVA_CLIENT_ID=你的Client_ID
STRAVA_CLIENT_SECRET=你的Client_Secret
```

详细配置见 [STRAVA_SETUP.md](./STRAVA_SETUP.md)

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:6364

## 项目架构

```
run_blue/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── api/auth/     # Strava OAuth API
│   │   ├── activities/   # 活动列表页
│   │   ├── dashboard/    # 仪表盘
│   │   └── page.tsx      # 首页
│   ├── components/       # 组件
│   │   ├── ui/           # 像素风格 UI 组件
│   │   ├── layout/       # 布局组件
│   │   └── map/          # 地图组件 (Leaflet)
│   ├── lib/              # 工具函数
│   │   ├── strava.ts     # Strava API 封装
│   │   └── supabase.ts   # 数据库操作 (可选)
│   ├── store/            # Zustand 状态管理
│   └── i18n/             # 多语言配置
```

## 登录流程

本项目**只支持 Strava 登录**，流程如下：

1. 用户点击"使用 STRAVA 登录"
2. 跳转到 Strava 授权页面
3. 用户授权后，Strava 重定向回 `/api/auth/callback/strava`
4. 后端用 code 换取 access_token
5. 存储 token 到 cookie，跳转到仪表盘

**没有传统账号密码登录**，所有数据都来自 Strava。

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript
- **样式**: Tailwind CSS 4 (像素极简风格)
- **状态**: Zustand
- **地图**: Leaflet + React-Leaflet
- **国际化**: i18next
- **部署**: Vercel

## 部署到 Vercel

1. 推送代码到 GitHub
2. 在 Vercel 导入项目
3. 添加环境变量：
   ```env
   NEXT_PUBLIC_STRAVA_CLIENT_ID=生产应用的Client_ID
   STRAVA_CLIENT_SECRET=生产应用的Client_Secret
   ```
4. 在 Strava 应用设置中，把 **Authorization Callback Domain** 改为你的 Vercel 域名
5. 部署

## License

MIT

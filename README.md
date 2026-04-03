# 跑蓝 Run Blue

一个像素极简风格的跑步数据可视化网站，数据来源于 Strava。

## 功能特性

- 🔐 Strava OAuth 授权登录
- 🗺️ 跑步路线地图展示
- 📊 跑步数据统计
- 🌐 中英文多语言支持
- 🌙 深色/浅色主题切换
- 📱 响应式设计

## 技术栈

- **前端**: Next.js 16 + React 19 + TypeScript
- **样式**: Tailwind CSS 4
- **状态管理**: Zustand
- **国际化**: i18next
- **认证**: NextAuth.js
- **地图**: Leaflet + React-Leaflet
- **数据库**: Supabase
- **部署**: Vercel

## 快速开始

### 1. 环境配置

复制 `.env.example` 为 `.env.local` 并填写你的配置：

```bash
cp .env.example .env.local
```

需要配置的变量：
- `NEXT_PUBLIC_STRAVA_CLIENT_ID` - Strava 应用的 Client ID
- `STRAVA_CLIENT_SECRET` - Strava 应用的 Client Secret
- `NEXTAUTH_SECRET` - NextAuth 的加密密钥（可以使用 `openssl rand -base64 32` 生成）
- `NEXTAUTH_URL` - 你的应用 URL（本地开发为 http://localhost:3000）
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase 项目 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase 匿名密钥

### 2. 安装依赖

```bash
yarn install
# 或
npm install
```

### 3. 运行开发服务器

```bash
yarn dev
# 或
npm run dev
```

访问 http://localhost:3000

### 4. 构建生产版本

```bash
yarn build
# 或
npm run build
```

## Strava API 配置

1. 访问 [Strava Developers](https://developers.strava.com/)
2. 创建一个新的应用
3. 设置授权回调域名为你的应用域名
4. 获取 Client ID 和 Client Secret

## Supabase 配置

1. 创建一个新的 Supabase 项目
2. 创建 `users` 表：

```sql
create table users (
  id text primary key,
  strava_id bigint unique not null,
  email text,
  name text,
  image text,
  access_token text,
  refresh_token text,
  expires_at bigint,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);
```

## 部署到 Vercel

1. 推送代码到 GitHub
2. 在 Vercel 导入项目
3. 配置环境变量
4. 部署

## 项目结构

```
run_blue/
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # React 组件
│   ├── hooks/            # 自定义 Hooks
│   ├── i18n/             # 国际化配置
│   ├── lib/              # 工具函数
│   ├── store/            # Zustand Store
│   ├── styles/           # 样式文件
│   └── types/            # TypeScript 类型
├── public/               # 静态资源
└── ...
```

## License

MIT

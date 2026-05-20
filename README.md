# 跑蓝 Run Blue

一个像素极简风格的个人跑步数据可视化站点，数据来源于 Strava，AI 训练分析由 Kimi 驱动。

> **注意**：本项目为开源自部署项目。由于 Strava 多人权限审核困难，目前无法作为公共 SaaS 服务提供。你需要**自行注册 Strava 应用**和**申请 AI API Key**，部署到你自己的域名上使用。

---

## 核心功能

### 个人跑步档案馆 `/me`

免登录的沉浸式个人数据展示页，暗色终端风格：

- 🖥️ **终端风格首屏** - 打字机效果启动日志 + 实时时钟 + 像素跑道装饰
- 📊 **大字报统计** - 总里程 / 总次数 / 总时长 / 总爬升，数字滚动动画
- 🗺️ **全量轨迹地图** - Leaflet 暗色底图，Canvas 渲染全部轨迹，年份筛选自动适配视角
- 📈 **年度对比柱状图** - 终端绿色主题，按年堆叠跑量趋势
- 🌡️ **活动日历热力图** - GitHub 风格绿色色阶，年份切换
- 📁 **年度归档折叠卡片** - 按年份分组的活动网格卡片，默认折叠
- ✨ **Canvas 粒子背景** - 绿色光点网络 + 鼠标吸引互动
- 🔒 **纯前端渲染** - 数据来自本地 `public/data/activities.json`，无需 Strava 登录即可浏览

### 数据同步
- 🔐 **Strava OAuth 登录** - 唯一登录方式，无需注册账号
- ⚡ **智能缓存** - 本地持久化缓存活动数据，自动检测并同步新活动
- 🔄 **Token 自动刷新** - 登录态过期自动续期，避免频繁重新登录
- 📴 **离线可用** - PWA 支持，已缓存的数据断网仍可浏览

### 活动与路线
- 🗺️ **跑步路线地图** - Leaflet 展示 GPS 轨迹，支持三种底图切换
- 📊 **活动详情** - 分段数据、圈速、心率/配速/海拔图表、路段成绩、最佳成绩
- 📈 **跑量统计** - 按周/月/年/全部维度聚合，汇总卡片 + 柱状图趋势
- 🌡️ **跑步地图（Heatmap）** - 个人轨迹热力叠加，年份分色聚类
- 📍 **路线收藏与对比** - 收藏常跑路线，自动聚合相似活动，追踪每次表现变化
- 🔍 **活动筛选** - 按日期、距离、比赛/带娃/长跑标记筛选

### AI 训练分析
- 🤖 **单次训练智能分析**（基于 Kimi API / Moonshot）
  - 配速区间定位（Daniels E/M/T/I/R）
  - 心率区间分布可视化（基于 LTHR 的 Z1-Z5）
  - 配速模式识别（热身冷身 / 间歇 / 渐进跑 / 跑崩检测）
  - 训练负荷评估（结合单次强度 + 周跑量趋势）
  - 同类型历史对比
  - 心率漂移分析（区分正常加速段 vs 真正漂移）
  - 结合跑者身高体重 / BMI 的身体构成建议
  - 针对性训练建议与恢复时长
  - AI 服务不可用时自动 fallback，并提示用户重新分析
- 🏃‍♂️ **AI 训练计划生成器** - 根据目标比赛生成周期化课表
  - 支持多计划并行管理
  - 5k / 10k / 半马 / 全马周期化训练
  - 每周自动生成配速明确的间歇/阈值/长距离/轻松跑
  - 巅峰期/减量期自动加入马拉松配速（M配速）段落

### 装备与数据
- 👟 **跑鞋统计** - 按装备汇总里程、平均配速、使用次数
- 📸 **分享海报** - 将跑步路线生成 PNG 透明底图片

### 个性化
- 👤 **跑者档案** - 手动输入 PB、身高、体重、LTHR，AI 分析基于真实数据
- 🌐 **中英文切换** - 支持双语界面
- 🌙 **深色/浅色主题** - 自动适配系统主题
- 📱 **PWA 支持** - 可添加到主屏幕，离线访问已缓存数据

---

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript
- **样式**: Tailwind CSS 4 (像素极简风格)
- **地图**: Leaflet + 动态瓦片切换
- **图表**: recharts
- **AI**: Kimi API (Moonshot)
- **PWA**: Serwist (Service Worker + 离线缓存)
- **状态**: Zustand + localStorage 持久化
- **国际化**: i18next
- **主题**: next-themes

---

## 自部署指南

### 前置条件

你需要准备以下三项资源，**全部免费**：

| 资源 | 用途 | 获取地址 |
|------|------|----------|
| Strava Client ID / Secret | 读取你的 Strava 跑步数据 | [Strava API Settings](https://www.strava.com/settings/api) |
| Moonshot API Key | AI 训练分析（Kimi） | [Moonshot 开放平台](https://platform.moonshot.cn) |
| MapTiler Key（可选） | 国内地图瓦片加速 | [MapTiler Cloud](https://cloud.maptiler.com) |

> ⚠️ **Strava 应用只能绑定一个 Callback Domain**，这意味着：
> - 如果你把域名配置为 `localhost`，只能本地开发使用
> - 如果你把域名配置为生产域名（如 `your-domain.com`），本地开发时需要临时改为 `localhost`，或使用 ngrok 代理

---

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

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
# ── Strava API（必填）────────────────────
NEXT_PUBLIC_STRAVA_CLIENT_ID=你的Strava_Client_ID
STRAVA_CLIENT_SECRET=你的Strava_Client_Secret

# ── 应用 URL（必填）──────────────────────
# 本地开发
NEXT_PUBLIC_APP_URL=http://localhost:6364
# 生产部署时改为你的域名
# NEXT_PUBLIC_APP_URL=https://your-domain.com

# ── AI 分析（必填，否则 AI 功能不可用）────
KIMI_API_KEY=你的Moonshot_API_Key

# ── 地图（可选）──────────────────────────
NEXT_PUBLIC_MAPTILER_KEY=你的MapTiler_Key
```

> 📌 **关于 `NEXT_PUBLIC_APP_URL`**
> - 这个值必须与你在 Strava 后台填写的 **Authorization Callback Domain** 一致
> - 例如：如果你填的是 `your-domain.com`，这里就要写 `https://your-domain.com`
> - 如果你填的是 `localhost`，这里就要写 `http://localhost:6364`

---

### 4. 注册 Strava 应用并配置 Callback Domain

1. 访问 [Strava API Settings](https://www.strava.com/settings/api)
2. 点击 **Create App**，填写：
   - **Application Name**: 跑蓝 / Run Blue（或任意名字）
   - **Category**: Training
   - **Website**: `https://your-domain.com`
   - **Authorization Callback Domain**: `your-domain.com`
     - ⚠️ **只填域名，不加 `https://` 和端口号**
3. 保存后获得 **Client ID** 和 **Client Secret**
4. 将这两个值填入 `.env.local`

详细图文步骤见 [STRAVA_SETUP.md](./STRAVA_SETUP.md)

---

### 5. 申请 Moonshot API Key（AI 分析用）

1. 访问 [Moonshot 开放平台](https://platform.moonshot.cn)
2. 注册账号并完成实名认证
3. 在「API Key 管理」中创建新 Key
4. 将 Key 填入 `.env.local` 的 `KIMI_API_KEY`

> 不提供 `KIMI_API_KEY` 时，AI 分析功能将不可用，但 Strava 数据同步、地图、统计等其他功能不受影响。

---

### 6. 本地开发

```bash
npm run dev
```

访问 http://localhost:6364

---

### 7. 生产部署（Vercel 推荐）

本项目使用 Next.js App Router，推荐使用 [Vercel](https://vercel.com) 一键部署：

```bash
npm i -g vercel
vercel --prod
```

部署后在 Vercel Dashboard 的 **Environment Variables** 中添加所有环境变量。

> ⚠️ **再次提醒**：部署完成后，去 Strava 后台把 **Authorization Callback Domain** 从 `localhost` 改为你部署的**生产域名**（如 `your-domain.com`），否则登录回调会失败。

---

## License

MIT

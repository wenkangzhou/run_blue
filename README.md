# 跑蓝 Run Blue

> **基于 Strava 的跑步数据，按你的习惯重新呈现。**
>
> Strava 订阅才能看的高级分析、AI 活动解读、算法周期化课表——这里全部免费。

---

## 核心功能

### 🤖 AI 训练分析

基于 Kimi API（Moonshot），结合 Daniels 配速区间和 Joe Friel 心率区间，深度读懂你的每一次训练：

- **配速区间定位**（E/M/T/I/R）+ **心率区间分布**（基于 LTHR 的 Z1-Z5 彩色条形图）
- **配速模式识别**：热身冷身 / 间歇 / 渐进跑 / **比赛跑崩检测**
- **心率漂移分析**：区分正常加速段 vs 真正漂移（有氧不足/疲劳/脱水）
- **训练负荷评估**（结合单次强度 + 周跑量趋势）
- **同类型历史对比**（碾压了多少过去的自己）
- **针对性恢复建议**与**训练建议**
- **结合身高体重 / BMI / LTHR** 的身体构成与生理分析
- **比赛场景专项**：赛后恢复策略、深度疲劳预警、糖原耗竭识别

全部基于你的真实数据，不是模板套话。支持中英文双语输出。

---

### 🖥️ 个人跑步档案馆 `/me`

免登录的公开个人页，暗色终端风格，像展示作品一样展示你的跑步生涯：

- 打字机启动动画 + 实时时钟
- 大字报统计数字滚动（总里程 / 总次数 / 总时间 / 爬升 / 最长距离 / 最高爬升）
- 全量轨迹暗色地图（全部活动叠加，年份筛选自动适配视角）
- 年度对比柱状图（按年堆叠跑量趋势）
- GitHub 风格活动日历热力图
- 年度归档折叠列表

---

### 📊 数据总览与搜索

像浏览相册一样浏览你的跑步历史：

- 搜索框快速定位历史活动
- 周/月/年数据快捷预览（本周跑了多少，一目了然）
- 按周分组的活动网格卡片，路线图预览 + 距离 + 时间
- 深色/浅色主题自动适配

---

### 📈 数据可视化（统计页）

多维度统计，追踪你的跑步进化：

- 周/月/年/全部维度切换
- 指标维度切换（距离 / 时长 / 次数 / 卡路里 / 爬升 / **配速**）
- GitHub 风格年度活动日历热力图（配速模式颜色自动反转）
- 柱状图趋势 + 统计汇总卡片（总距离 / 平均配速 / 平均心率 / 累计爬升 / 总卡路里 / 次数 / 总时间 / 平均时长等）

---

### 📋 周期化训练计划

选择 5K / 10K / 半程 / 全程马拉松，基于算法模板自动生成：

- 16-20 周周期化训练计划
- 基础期→建立期→巅峰期→减量期自动切换
- 每周课表含目标配速、心率区间、训练类型（轻松跑/间歇/阈值/长距离/力量训练）
- 巅峰期/减量期自动加入马拉松配速（M配速）段落
- 比赛日自动识别，生成目标配速与 taper 建议
- 多计划并行管理

配速自动基于你的 PB 计算，每一公里都有明确目标。

---

### 🗺️ 路线与地图

- **跑步路线地图**：Leaflet 展示 GPS 轨迹，支持多种底图切换
- **路线收藏与对比**：收藏常跑路线，基于 10 采样点路径形状匹配自动聚合历史记录，历史配速对比 + 缩略地图
- **附近路线探索**：发现周围跑者常跑的路段

---

### 📸 分享海报

- **单次跑步分享**：透明底路线图 + 可选配速/距离/时间叠层
- **周期海报**：一周/一个月/一个季度的跑步路线汇总拼图

---

### 📱 更多功能

- 🔐 **Strava OAuth 一键登录**，无需注册账号
- 🧪 **游客体验模式**，不用登录也能用示例数据体验活动、统计、热力图、路线、训练计划和跑鞋页
- ⚡ **智能缓存**，本地持久化，断网也能浏览历史
- 🔄 **Token 自动刷新**，避免频繁重新登录
- 👟 **跑鞋统计**，按装备汇总里程、平均配速、使用次数
- 🌐 **中英文双语界面**
- 🌙 **深色/浅色主题**，自动适配系统
- 📴 **PWA 支持**，可添加到主屏幕，离线访问已缓存数据

---

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript
- **样式**: Tailwind CSS 4 (像素极简风格)
- **地图**: Leaflet + 动态瓦片切换
- **图表**: recharts
- **AI**: Kimi API (Moonshot) — 仅用于活动分析，训练计划已切换为算法模板
- **PWA**: Serwist (Service Worker + 离线缓存)
- **状态**: Zustand + IndexedDB / localStorage 持久化
- **云同步**: Supabase server-only 预留，当前未接入主流程
- **国际化**: i18next
- **主题**: next-themes

---

## 自部署指南

> **注意**：本项目为开源自部署项目。由于 Strava 免费版应用最多允许 **10 个用户**连接，目前无法作为公共 SaaS 大规模服务提供。你可以部署后供自己和朋友（最多10人）使用，或者申请 Strava 合作伙伴认证以获得更高配额。你需要**自行注册 Strava 应用**和**申请 AI API Key**，部署到你自己的域名上使用。

### 前置条件（全部免费）

| 资源 | 用途 | 获取地址 |
|------|------|----------|
| Strava Client ID / Secret | 读取你的 Strava 跑步数据 | [Strava API Settings](https://www.strava.com/settings/api) |
| Moonshot API Key | AI 训练分析（Kimi） | [Moonshot 开放平台](https://platform.moonshot.cn) |
| MapTiler Key（可选） | 国内地图瓦片加速 | [MapTiler Cloud](https://cloud.maptiler.com) |

> ⚠️ **Strava 应用只能绑定一个 Callback Domain**。本地开发填 `localhost`，生产环境填你的域名。

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

# ── 更新 /me 游客预览数据时使用（可选）────
# 只放在 .env.local，不要提交到仓库
# STRAVA_REFRESH_TOKEN=你的Strava_Refresh_Token

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

> 📌 `NEXT_PUBLIC_APP_URL` 必须与 Strava 后台的 **Authorization Callback Domain** 一致。

### 4. 注册 Strava 应用

1. 访问 [Strava API Settings](https://www.strava.com/settings/api)
2. 点击 **Create App**，填写：
   - **Application Name**: 跑蓝 / Run Blue
   - **Category**: Training
   - **Website**: `https://your-domain.com`
   - **Authorization Callback Domain**: `your-domain.com`（⚠️ 只填域名，不加 `https://` 和端口号）
3. 保存后获得 **Client ID** 和 **Client Secret**，填入 `.env.local`

详细图文步骤见 [STRAVA_SETUP.md](./STRAVA_SETUP.md)

### 5. 获取 Refresh Token（可选）

`STRAVA_REFRESH_TOKEN` 不是在 Strava 应用设置页直接复制的；应用设置页只有 **Client ID** 和 **Client Secret**。

Refresh Token 来自一次真实的 OAuth 授权。它只在你需要用本地脚本更新 `/me` 游客预览数据 `public/data/activities.json` 时才需要：

1. 本地启动应用并完成 Strava 登录：`http://localhost:6364/api/auth/signin/strava`
2. 登录成功回到应用后，打开浏览器 DevTools
3. 进入 **Application → Storage → Cookies → http://localhost:6364**
4. 找到 `refresh_token`，复制它的值
5. 写入 `.env.local`：

```env
STRAVA_REFRESH_TOKEN=复制到的_refresh_token
```

> 注意：`refresh_token` 是敏感信息，只放在本地 `.env.local`，不要提交到仓库。Strava 在刷新 token 时可能返回新的 refresh token；如果脚本提示 token 已轮换，需要把新的值同步更新到 `.env.local`。

更新游客预览数据：

```bash
# 全量更新 public/data/activities.json
npm run data:update-activities

# 日常定期更新：只拉最近 14 天并合并
npm run data:update-activities -- --recent-days=14
```

### 6. 申请 Moonshot API Key

1. 访问 [Moonshot 开放平台](https://platform.moonshot.cn)
2. 注册账号并完成实名认证
3. 在「API Key 管理」中创建新 Key，填入 `.env.local`

### 7. 本地开发

```bash
npm run dev
```

访问 http://localhost:6364

想先跳过 Strava 授权体验完整功能，可以访问：

```text
http://localhost:6364/?demo=1
```

游客模式使用内置示例数据，不会请求 Strava，也不会写入你的真实活动缓存。登录 Strava 前会自动退出游客模式。

### 8. 生产部署（Vercel 推荐）

```bash
npm i -g vercel
vercel --prod
```

部署后在 Vercel Dashboard 的 **Environment Variables** 中添加所有环境变量。

> ⚠️ 部署完成后，去 Strava 后台把 **Authorization Callback Domain** 改为你部署的**生产域名**。

---

## 开发者说

作为一名跑了 12 年、累计 11000+ 公里的跑者，我对 Strava 的付费订阅越来越不满：想看心率区间分析？订阅。想看训练负荷和恢复建议？订阅。想看周期化训练计划？订阅。想按自己的习惯浏览数据？做不到。

**跑蓝的初心很简单：基于 Strava 的跑步数据，按跑者自己的习惯重新呈现。**

Strava 擅长记录，但它不擅长"读懂"你的训练。跑蓝用 AI 补上活动分析：分析心率区间、配速模式、训练负荷，识别跑崩风险、给出恢复建议；训练计划则用稳定算法模板生成周期化课表——所有这些，不需要 Strava 付费订阅。

开源协议：MIT

---

## TODO / 规划

- 🤖 **Strava 自动机器人**：上传活动后自动修改标题和描述，支持条件触发（如距离/心率阈值）、天气信息注入、模板变量替换。参考 Kaze.run 的机器人机制。

---

## 页面截图

<p align="center">
  <img src="./public/screenshot/AI%20%E8%AE%AD%E7%BB%83%E5%88%86%E6%9E%90%EF%BC%88%E6%B4%BB%E5%8A%A8%E8%AF%A6%E6%83%85%E9%A1%B5%EF%BC%89.png" width="420" alt="AI 训练分析（日常训练）"/>
  <br/>
  <sub>AI 训练分析（日常训练）</sub>
</p>

<p align="center">
  <img src="./public/screenshot/AI%20%E8%AE%AD%E7%BB%83%E5%88%86%E6%9E%90%EF%BC%88%E6%B4%BB%E5%8A%A8%E8%AF%A6%E6%83%85%E9%A1%B5%EF%BC%89_%E6%AF%94%E8%B5%9B.png" width="420" alt="AI 训练分析（比赛场景）"/>
  <br/>
  <sub>AI 训练分析（比赛场景）</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E4%B8%AA%E4%BA%BA%E6%A1%A3%E6%A1%88%E9%A6%86.png" width="420" alt="个人跑步档案馆"/>
  <br/>
  <sub>个人跑步档案馆 /me</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E6%95%B0%E6%8D%AE%E6%80%BB%E8%A7%88%EF%BC%88%E6%B4%BB%E5%8A%A8%E5%88%97%E8%A1%A8%E9%A1%B5%EF%BC%89.png" width="420" alt="数据总览"/>
  <br/>
  <sub>数据总览（活动列表页）</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%EF%BC%88%E7%BB%9F%E8%AE%A1%E9%A1%B5%EF%BC%89.png" width="420" alt="数据可视化"/>
  <br/>
  <sub>数据可视化（统计页）</sub>
</p>

<p align="center">
  <img src="./public/screenshot/AI%E8%AE%AD%E7%BB%83%E8%AE%A1%E5%88%92png.png" width="420" alt="训练计划"/>
  <br/>
  <sub>周期化训练计划</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E8%B7%AF%E7%BA%BF%E5%9C%B0%E5%9B%BE.png" width="420" alt="路线地图"/>
  <br/>
  <sub>路线地图</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E8%B7%AF%E7%BA%BF%E6%94%B6%E8%97%8F.png" width="420" alt="路线收藏"/>
  <br/>
  <sub>路线收藏与对比</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E5%8D%95%E6%AC%A1%E8%BF%90%E5%8A%A8%E6%B5%B7%E6%8A%A5%E5%88%86%E4%BA%AB.png" width="320" alt="单次海报"/>
  <br/>
  <sub>单次运动海报分享</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E5%91%A8%E6%9C%9F%E6%B5%B7%E6%8A%A5%E5%88%86%E4%BA%AB.png" width="320" alt="周期海报"/>
  <br/>
  <sub>周期海报分享</sub>
</p>

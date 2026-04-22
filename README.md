# 跑蓝 Run Blue

一个像素极简风格的跑步数据可视化网站，数据来源于 Strava。

## 在线访问

https://runblue.yibuu.com

## 核心功能

### 数据同步
- 🔐 **Strava OAuth 登录** - 唯一登录方式，无需注册账号
- ⚡ **智能缓存** - 本地持久化缓存活动数据，自动检测并同步新活动
- 🔄 **Token 自动刷新** - 登录态过期自动续期，避免频繁重新登录

### 活动与路线
- 🗺️ **跑步路线地图** - 使用 Leaflet 展示 GPS 轨迹
- 📊 **活动详情** - 分段数据、心率/配速/海拔图表
- 📈 **跑量统计** - 按周/月/年/全部维度聚合，10 项汇总卡片 + 柱状图趋势
- 📍 **路线收藏与对比** - 收藏常跑路线，自动聚合同起点活动，追踪每次表现变化
  - 历史对比表格（最快配速高亮）
  - 配速趋势折线图
  - 关联活动一键跳转

### AI 功能
- 🤖 **AI 训练分析** - 基于 Kimi API 的单次训练智能分析（支持中英文双语）
  - 配速区间定位（Daniels E/M/T/I/R）
  - 训练负荷评估
  - 同类型历史对比
  - 针对性训练建议
- 🏃‍♂️ **AI 训练计划生成器** - 根据目标比赛生成周期化课表
  - 支持多计划并行管理
  - 5k / 10k / 半马 / 全马周期化训练
  - 每周自动生成配速明确的间歇/阈值/长距离/轻松跑/力量训练
  - 配速区间自动基于个人 PB 计算
  - 巅峰期/减量期自动加入马拉松配速（M配速）段落

### 分享与回顾
- 📸 **分享海报** - 将跑步路线生成 PNG 透明底图片
  - 单次跑步分享：透明底路线 + 可选配速/距离/时间叠层
  - 周期海报：一周/一个月的跑步路线汇总拼图
- 🏆 **年度回顾** - 生成跑步年度总结海报

### 个性化
- 👤 **跑者档案** - 手动输入 5k/10k/半马/全马 PB，AI 分析基于真实数据
- 🌐 **中英文切换** - 支持双语界面
- 🌙 **深色/浅色主题** - 自动适配系统主题
- 📱 **PWA 支持** - 可添加到主屏幕，离线访问

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript
- **样式**: Tailwind CSS 4 (像素极简风格)
- **地图**: Leaflet + React-Leaflet
- **图表**: recharts
- **AI**: Kimi API (Moonshot)
- **状态**: Zustand + localStorage 持久化
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
KIMI_API_KEY=你的Kimi_API_Key
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

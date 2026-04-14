# 跑蓝 Run Blue

一个像素极简风格的跑步数据可视化网站，数据来源于 Strava。

## 在线访问

https://runblue.yibuu.com

## 核心功能

- 🔐 **Strava OAuth 登录** - 唯一登录方式，无需注册账号
- 🗺️ **跑步路线地图** - 使用 Leaflet 展示 GPS 轨迹
- 📊 **数据统计** - 距离、时间、配速等关键指标
- 📈 **活动详情** - 分段数据、心率/配速/海拔图表
- 🤖 **AI 训练分析** - 基于 Kimi API 的单次训练智能分析
  - 配速区间定位（Daniels E/M/T/I/R）
 - 训练负荷评估
  - 同类型历史对比
  - 针对性训练建议
- 🌐 **中英文切换** - 支持双语界面
- 🌙 **深色/浅色主题** - 自动适配系统主题
- 📱 **PWA 支持** - 可添加到主屏幕，离线访问
- ⚡ **智能缓存** - 本地缓存数据，自动检测并同步新活动

## 开发计划

### 近期

- [x] **个人档案页** - 手动输入 PB，AI 分析基于真实数据
  - [x] 创建档案设置弹窗
  - [x] 支持输入 5k / 10k / 半马 / 全马 PB
  - [x] 自动计算 Daniels 配速区间
  - [x] AI 分析读取档案数据
- [x] **分享海报** - 将跑步路线生成 PNG 透明底图片
  - [x] 单次跑步分享：透明底路线 + 可选配速/距离/时间叠层
  - [x] 周期海报：一周/一个月的跑步路线汇总拼图

### 中期

- [ ] **训练计划生成器** - 根据目标比赛生成周期化课表

## 最近更新

- ✅ 新增 **分享海报** - 单次/周期跑步路线生成透明底 PNG
- ✅ 新增 **周期海报** - 一周/一月跑步路线自动拼图
- ✅ 新增 **个人档案** - 手动输入 PB，AI 分析更准确
- ✅ 新增 AI 训练分析 V2 - 专业教练级单次训练洞察
- ✅ 修复分页加载问题，支持加载更多历史数据
- ✅ 添加 Token 自动刷新，避免频繁重新登录
- ✅ 修复时区显示，正确展示本地时间
- ✅ 优化配速图表显示格式和坐标轴对齐
- ✅ 改进下拉菜单位置和交互
- ✅ 智能缓存策略：缓存未过期时自动检测新活动

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript
- **样式**: Tailwind CSS 4 (像素极简风格)
- **地图**: Leaflet + React-Leaflet
- **AI**: Kimi API (Moonshot)
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

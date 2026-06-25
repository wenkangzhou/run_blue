# Run Blue 跑蓝

> **Reimagining your Strava running data, your way.**
>
> English | [中文](./README.md)

> Advanced analytics, AI activity insights, and algorithmic periodization training plans — all free, no Strava subscription required.

---

## Core Features

### 🤖 AI Training Analysis

Powered by the Kimi API (Moonshot), combining Daniels pace zones and Joe Friel heart rate zones to deeply understand every training session:

- **Pace Zone Positioning** (E/M/T/I/R) + **Heart Rate Zone Distribution** (LTHR-based Z1–Z5 color bar charts)
- **Pace Pattern Recognition**: Warm-up/Cool-down / Intervals / Progressive Runs / **Race Blow-up Detection**
- **Heart Rate Drift Analysis**: Distinguishing normal acceleration segments from true drift (aerobic deficiency / fatigue / dehydration)
- **Training Load Assessment** (combining single-session intensity + weekly volume trends)
- **Historical Comparison by Type** (how much you crushed your past self)
- **Targeted Recovery Advice** and **Training Recommendations**
- **Body Composition & Physiological Analysis** incorporating height, weight, BMI, and LTHR
- **Race-Specific Scenarios**: Post-race recovery strategies, deep fatigue warnings, glycogen depletion identification

All based on your real data, not template fluff. Supports bilingual output in Chinese and English.

---

### 🖥️ Personal Running Archive `/me`

A public, login-free personal page with a dark terminal aesthetic, showcasing your running life like a portfolio:

- Typewriter boot animation + real-time clock
- Scrolling marquee stats (total distance / total runs / total time / elevation / longest distance / highest elevation)
- Full-track dark map overlay (all activities superimposed, year filter auto-fits viewport)
- Annual comparison bar charts (year-over-year stacked volume trends)
- GitHub-style activity calendar heatmap
- Collapsible annual archive list

---

### 📊 Data Overview & Search

Browse your running history like a photo album:

- Search bar for quick historical activity lookup
- Weekly / monthly / yearly data quick previews (how much did you run this week, at a glance)
- Weekly-grouped activity grid cards with route map preview + distance + time
- Dark / light theme auto-adaptation

---

### 📈 Data Visualization (Stats Page)

Multi-dimensional statistics to track your running evolution:

- Weekly / monthly / yearly / all-time dimension switching
- Metric dimension switching (distance / duration / count / calories / elevation / **pace**)
- GitHub-style annual activity calendar heatmap (pace-mode color auto-inversion)
- Bar chart trends + summary stat cards (total distance / avg pace / avg heart rate / cumulative elevation / total calories / count / total time / avg duration, etc.)

---

### 📋 Periodized Training Plans

Select 5K / 10K / Half / Full Marathon, auto-generated based on algorithmic templates:

- 16–20 week periodized training plans
- Base → Build → Peak → Taper phases auto-switching
- Weekly schedule includes target pace, heart rate zones, and training types (Easy / Interval / Threshold / Long Run / Strength)
- Marathon Pace (M-pace) segments automatically added during Peak / Taper phases
- Race day auto-recognition with target pace and taper suggestions
- Multi-plan parallel management

Pace is automatically calculated based on your PB — every kilometer has a clear target.

---

### 🗺️ Routes & Maps

- **Running Route Maps**: Leaflet GPS track display with multiple basemap switching
- **Route Favorites & Comparison**: Save frequently-run routes, auto-aggregate historical records via 10-sample-point path shape matching, historical pace comparison + thumbnail maps
- **Nearby Route Exploration**: Discover routes commonly run by runners around you

---

### 📸 Share Posters

- **Single Run Share**: Transparent-background route map + optional pace / distance / time overlay
- **Period Poster**: Weekly / monthly / quarterly route summary collage

---

### 📱 More Features

- 🔐 **Strava OAuth One-Click Login**, no account registration needed
- 🧪 **Guest Demo Mode**, experience activities, stats, heatmaps, routes, training plans, and shoe pages with sample data without logging in
- ⚡ **Smart Caching**, local persistence, browse history offline
- 🔄 **Token Auto-Refresh**, avoid frequent re-login
- 👟 **Shoe Stats**, aggregate mileage, average pace, and usage count by gear
- 🌐 **Chinese & English Bilingual Interface**
- 🌙 **Dark / Light Theme**, auto-adapts to system preference
- 📴 **PWA Support**, add to home screen, offline access to cached data

---

## Tech Stack

- **Framework**: Next.js 16 + React 19 + TypeScript
- **Styling**: Tailwind CSS 4 (pixel-minimalist aesthetic)
- **Maps**: Leaflet + dynamic tile switching
- **Charts**: recharts
- **AI**: Kimi API (Moonshot) — used only for activity analysis; training plans switched to algorithmic templates
- **PWA**: Serwist (Service Worker + offline caching)
- **State**: Zustand + IndexedDB / localStorage persistence
- **Cloud Sync**: Supabase server-only reserved, not currently integrated into main flow
- **i18n**: i18next
- **Theming**: next-themes

---

## Self-Hosting Guide

> **Note**: This is an open-source self-hosted project. Because the free Strava app tier allows a maximum of **10 connected users**, it cannot be offered as a public SaaS at scale. You can deploy it for yourself and friends (up to 10 people), or apply for Strava partner certification for a higher quota. You need to **register your own Strava app** and **apply for an AI API Key**, then deploy to your own domain.

### Prerequisites (All Free)

| Resource | Purpose | Where to Get |
|----------|---------|--------------|
| Strava Client ID / Secret | Read your Strava running data | [Strava API Settings](https://www.strava.com/settings/api) |
| Moonshot API Key | AI training analysis (Kimi) | [Moonshot Open Platform](https://platform.moonshot.cn) |
| MapTiler Key (optional) | China map tile acceleration | [MapTiler Cloud](https://cloud.maptiler.com) |

> ⚠️ **A Strava app can only bind to one Callback Domain**. Use `localhost` for local development, and your domain for production.

### 1. Clone the Code

```bash
git clone https://github.com/wenkangzhou/run_blue.git
cd run_blue
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# ── Strava API (Required) ────────────────────────
NEXT_PUBLIC_STRAVA_CLIENT_ID=Your_Strava_Client_ID
STRAVA_CLIENT_SECRET=Your_Strava_Client_Secret

# ── For updating /me guest preview data (Optional) ──
# Keep only in .env.local, do NOT commit to repo
# STRAVA_REFRESH_TOKEN=Your_Strava_Refresh_Token

# ── App URL (Required) ────────────────────────────
# Local development
NEXT_PUBLIC_APP_URL=http://localhost:6364
# Change to your domain for production
# NEXT_PUBLIC_APP_URL=https://your-domain.com

# ── AI Analysis (Required, otherwise AI features unavailable) ──
KIMI_API_KEY=Your_Moonshot_API_Key

# ── Maps (Optional) ───────────────────────────────
NEXT_PUBLIC_MAPTILER_KEY=Your_MapTiler_Key
```

> 📌 `NEXT_PUBLIC_APP_URL` must match the **Authorization Callback Domain** in your Strava app settings.

### 4. Register a Strava App

1. Visit [Strava API Settings](https://www.strava.com/settings/api)
2. Click **Create App**, fill in:
   - **Application Name**: Run Blue / 跑蓝
   - **Category**: Training
   - **Website**: `https://your-domain.com`
   - **Authorization Callback Domain**: `your-domain.com` (⚠️ Domain only, no `https://` or port number)
3. Save to get **Client ID** and **Client Secret**, paste into `.env.local`

For detailed step-by-step instructions with screenshots, see [STRAVA_SETUP.md](./STRAVA_SETUP.md)

### 5. Get Refresh Token (Optional)

`STRAVA_REFRESH_TOKEN` is not directly copied from the Strava app settings page; the settings page only has **Client ID** and **Client Secret**.

The Refresh Token comes from a real OAuth authorization. It is only needed when you want to use the local script to update the `/me` guest preview data in `public/data/activities.json`:

1. Start the app locally and complete Strava login: `http://localhost:6364/api/auth/signin/strava`
2. After successful login, open browser DevTools
3. Go to **Application → Storage → Cookies → http://localhost:6364**
4. Find `refresh_token`, copy its value
5. Write to `.env.local`:

```env
STRAVA_REFRESH_TOKEN=the_copied_refresh_token
```

> Note: `refresh_token` is sensitive information; keep it only in local `.env.local`, do not commit to the repo. Strava may return a new refresh token during token refresh; if the script warns about token rotation, update the new value in `.env.local` accordingly.

Update guest preview data:

```bash
# Full update of public/data/activities.json
npm run data:update-activities

# Daily incremental update: fetch only recent 14 days and merge
npm run data:update-activities -- --recent-days=14
```

### 6. Apply for a Moonshot API Key

1. Visit [Moonshot Open Platform](https://platform.moonshot.cn)
2. Register an account and complete real-name verification
3. Create a new Key in "API Key Management", paste into `.env.local`

### 7. Local Development

```bash
npm run dev
```

Visit http://localhost:6364

To skip Strava authorization and experience the full feature set first, visit:

```text
http://localhost:6364/?demo=1
```

Guest mode uses built-in sample data, will not request Strava, and will not write to your real activity cache. Guest mode automatically exits before logging into Strava.

### 8. Production Deployment (Vercel Recommended)

```bash
npm i -g vercel
vercel --prod
```

After deployment, add all environment variables in the Vercel Dashboard under **Environment Variables**.

> ⚠️ After deployment, go to the Strava backend and change the **Authorization Callback Domain** to your deployed **production domain**.

---

## From the Developer

As a runner with 12 years and 11,000+ kilometers under my belt, I became increasingly frustrated with Strava's paid subscriptions: Want heart rate zone analysis? Subscribe. Want training load and recovery advice? Subscribe. Want periodized training plans? Subscribe. Want to browse data your own way? Can't do it.

**Run Blue's mission is simple: Reimagining your Strava running data, your way.**

Strava excels at recording, but it doesn't excel at "reading" your training. Run Blue bridges the gap with AI-powered activity analysis: analyzing heart rate zones, pace patterns, training load, identifying blow-up risks, and giving recovery advice; training plans are generated via stable algorithmic templates for periodized schedules — all of this, without a Strava paid subscription.

License: MIT

---

## TODO / Roadmap

- 🤖 **Strava Auto Bot**: Automatically modify title and description after uploading an activity, supporting conditional triggers (e.g., distance / heart rate thresholds), weather info injection, and template variable replacement. Inspired by Kaze.run's bot mechanism.

---

## Screenshots

<p align="center">
  <img src="./public/screenshot/AI%20%E8%AE%AD%E7%BB%83%E5%88%86%E6%9E%90%EF%BC%88%E6%B4%BB%E5%8A%A8%E8%AF%A6%E6%83%85%E9%A1%B5%EF%BC%89.png" width="420" alt="AI Training Analysis (Daily Training)"/>
  <br/>
  <sub>AI Training Analysis (Daily Training)</sub>
</p>

<p align="center">
  <img src="./public/screenshot/AI%20%E8%AE%AD%E7%BB%83%E5%88%86%E6%9E%90%EF%BC%88%E6%B4%BB%E5%8A%A8%E8%AF%A6%E6%83%85%E9%A1%B5%EF%BC%89_%E6%AF%94%E8%B5%9B.png" width="420" alt="AI Training Analysis (Race Scenario)"/>
  <br/>
  <sub>AI Training Analysis (Race Scenario)</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E4%B8%AA%E4%BA%BA%E6%A1%A3%E6%A1%88%E9%A6%86.png" width="420" alt="Personal Running Archive"/>
  <br/>
  <sub>Personal Running Archive /me</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E6%95%B0%E6%8D%AE%E6%80%BB%E8%A7%88%EF%BC%88%E6%B4%BB%E5%8A%A8%E5%88%97%E8%A1%A8%E9%A1%B5%EF%BC%89.png" width="420" alt="Data Overview"/>
  <br/>
  <sub>Data Overview (Activity List)</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%EF%BC%88%E7%BB%9F%E8%AE%A1%E9%A1%B5%EF%BC%89.png" width="420" alt="Data Visualization"/>
  <br/>
  <sub>Data Visualization (Stats Page)</sub>
</p>

<p align="center">
  <img src="./public/screenshot/AI%E8%AE%AD%E7%BB%83%E8%AE%A1%E5%88%92png.png" width="420" alt="Training Plan"/>
  <br/>
  <sub>Periodized Training Plan</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E8%B7%AF%E7%BA%BF%E5%9C%B0%E5%9B%BE.png" width="420" alt="Route Map"/>
  <br/>
  <sub>Route Map</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E8%B7%AF%E7%BA%BF%E6%94%B6%E8%97%8F.png" width="420" alt="Route Favorites"/>
  <br/>
  <sub>Route Favorites & Comparison</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E5%8D%95%E6%AC%A1%E8%BF%90%E5%8A%A8%E6%B5%B7%E6%8A%A5%E5%88%86%E4%BA%AB.png" width="320" alt="Single Run Poster"/>
  <br/>
  <sub>Single Run Poster Share</sub>
</p>

<p align="center">
  <img src="./public/screenshot/%E5%91%A8%E6%9C%9F%E6%B5%B7%E6%8A%A5%E5%88%86%E4%BA%AB.png" width="320" alt="Period Poster"/>
  <br/>
  <sub>Period Poster Share</sub>
</p>

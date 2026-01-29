# olSync

## 簡介

**olSync** 是一個基於 Electron 的桌面應用程式，最初設計用於在 osu!stable 和 osu!lazer 兩個客戶端之間同步遊戲資料。

## 功能

* 收藏夾
  * 合併來自 osu!stable 和 osu!lazer 客戶端的收藏列表並輸出至 osu!stable

* 成績恢復
  * 基於 osu! API v2 取得線上成績記錄
  * 基於本地成績資料

* 圖包下載
  * 基於 osu! API v2 取得圖譜包
    * 僅獲取特定類型圖譜包 / 指定時間內 / 特定遊戲模式
    * 基於本地成績資料進行差異下載，可快速篩選未載譜面

## 開發

### 安裝依賴

```bash
npm install
```

### 開發模式

```bash
npm run dev
```

### 建置應用程式

```bash
npm run build:prod
npm run dist:win
```

## 系統需求

* Windows 10 或更新版本
* Node.js 16.x 或更新版本
* osu!stable 和/或 osu!lazer 客戶端

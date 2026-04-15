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

* 選圖器 (Map Picker)
  * 可透過篩選及比重設定來隨機選圖 (僅讀取本地地圖集)

## 使用方式

點擊齒輪設定 `osu!` 的路徑後即可使用大部分功能!

部分功能需求 `osu! API` 權限, 你必須至 [osu!web 設定](https://osu.ppy.sh/home/account/edit#oauth) 中生成一個 `OAuth 應用程式` 並將 `Client ID` 與 `Client Secert` 填寫至齒輪設定當中!

> [!CAUTION]
> `Client ID` 與 `Client Secert` 為敏感資訊, 他們將會明碼儲存於 `config.json` 當中 (通常位於olsync資料夾中的data資料夾裡面)
> 請切記不要隨意分享它們!

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

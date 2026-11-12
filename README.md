# 塗鴉水族箱 (Doodle Aquarium)

純單機手機網頁（PWA）互動水族箱小遊戲。列印專用圖紙讓小朋友塗鴉後，以手機相機自動掃描辨識、透視校正並貼圖到 2D WebGL 動態海洋生物上，即可在手機水族箱中游動、餵食互動與收藏圖鑑。

## 開發與測試指令

```bash
# 安裝依賴
npm install

# 電腦本機開發（localhost 可開相機）
npm run dev

# 手機同區網 Wi-Fi 測試相機（啟用本地 HTTPS）
npm run dev:https

# 型別檢查與單元／整合測試
npm run typecheck
npm test

# 產出純靜態網頁與 PWA 離線快取（輸出於 dist/）
npm run build

# 產出正式 Release 靜態部署包（輸出於 release/）
npm run build:release
```

## 專案資源與文件

- 領域詞彙：[GLOSSARY.md](./GLOSSARY.md)
- 規格書：[docs/spec.md](./docs/spec.md)
- 架構決策紀錄：[docs/adr/](./docs/adr/)
- 預先產出的 A4 專用圖紙：[public/sheets/](./public/sheets/)

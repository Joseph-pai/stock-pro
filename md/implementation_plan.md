# 深度優化與算法升級計劃

## 背景
基於第二輪深度分析，本優化旨在提升選股精準度、解決硬編碼閾值的局限性，並增強系統在數據缺失時的透明度。

---

## 預計優化項目

### 1. 技術面升級 (Technical Upgrade) 📈
- **均線多頭排列檢查**：在糾結檢查中加入 `isBullish` (MA5 > MA20) 判定。空頭排列下的糾結將大幅扣分。
- **平滑衰減模型**：優化 MA 分數計算，對於「極度糾結」給予滿分，超出閾值後改用指數或更平滑的衰減，而非目前的 10% 斷崖。
- **量能基線一致性**：修正 `engine.ts` 中註釋與代碼不一致的問題（統一為 45 日基線）。

### 2. 籌碼與融資模型相對化 (Contextualization) 💎
- **籌碼質量權重**：`instScore` 不再僅看連買天數，加入「買入張數 / 當日成交量」的比例權重。1% 以上的佔比將獲得額外加成。
- **相對融資變化**：融資評分從固定 `500 張` 修改為 `當前成交量的 10%` 或 `20日均量的 5%`。大盤股與小盤股將適用不同基準。

### 3. 掃描策略優化 (Discovery Optimization) 🚀
- **突破小型股發現**：在 Stage 1 預篩選中，除了純成交量排序外，引入「爆量幅度」權重。讓原本冷門但今日爆量 3 倍以上的小型股也能進入 Phase 2。

### 4. 系統健壯性與透明度 (Robustness) 🛠️
- **數據完整性標記 (Warnings)**：在 `AnalysisResult` 加入 `warnings` 欄位。當 FinMind 故障回退到 ExchangeClient 時，標註「籌碼/基本面數據缺失」，並在 `verdict` 中提示評分受限。防止用戶因看見「低分」而誤判個股品質。

---

## 修改文件清單

### [MODIFY] [config.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/config.ts)
- 加入新算法所需的常數閾值。

### [MODIFY] [engine.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/engine.ts)
- 實施均線多頭排列檢查與平滑衰減邏輯。
- 修正量能基線邏輯。

### [MODIFY] [scanner.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/scanner.ts)
- 實施籌碼品質檢查與相對融資評分。
- 優化 `scanMarket` 預篩選排序算法。
- 加入 API 回路警告標記。

---

## 驗證計劃
1. **邏輯驗證**：檢查 `AnalysisResult` 是否正確包含 `isBullish` 屬性。
2. **邊界測試**：模擬 FinMind 斷線，確認 `warnings` 正常顯示且評分邏輯有相應提示。
3. **對比測試**：對比優化前後的 `scanMarket` 結果，確認小型爆量股是否能進入名單。

# Critical Bug 修正任務清單

## [x] Bug #1 — 月營收 YoY 日期邏輯修正（scanner.ts）
- [x] 備份 scanner.ts（scanner.ts.2026-03-04_1531）
- [x] 新增 normalizeMonthlyDate 函數（處理民國年RRR/MM + ISO YYYY-MM + 完整日期格式）
- [x] 修正 YoY 計算，改用字串解析（第 429–447 行）
- [x] 修正月營收 normalized 使用 normalizeMonthlyDate 取代 normalizeAnyDate

## [x] Bug #2 — engine.ts 預計算標識混淆（engine.ts）
- [x] 備份 engine.ts（engine.ts.2026-03-04_1531）
- [x] 加入 note 標識區分三維/五維（第 163–175 行）

## [x] Bug #3 — chipScore 一致性確認（scanner.ts）
- [x] 審查 scanner.ts 第 528–534 行：chipScore = normalizedChipScore ✅ 已正確，無需修改

## [x] 驗證
- [x] 確認 normalizeMonthlyDate 支援：2025-01 / 114/01 / 114/01/01 / 2025-01-15
- [x] 確認 YoY 邏輯：字串 split('-') 解析年月，不依賴 Date 物件

## [x] GitHub 同步
- [x] 更新 .gitignore 排除備份文件
- [x] 初始化 Git 倉庫並設定遠端 origin
- [x] 提交代碼 (Commit) 並強制推送 (Force Push) 至 https://github.com/Joseph-pai/stock-pro

## [x] 第二輪深度分析
- [x] 審查所有核心算法（籌碼、技術、基本面、融資）
- [x] 識別邏輯漏洞與架構弱點（如 API Fallback 導致的評分跳水）
- [x] 撰寫深度分析報告與改進建議

## [/] 深度優化實施
- [x] 撰寫優化方案 implementation_plan.md
- [ ] 備份現有文件（2026-03-04_1550）
- [ ] 實施技術面優化：多頭排列檢查、平滑衰減、基線校正 (engine.ts)
- [ ] 實施籌碼/融資優化：相對權重與張數門檻 (scanner.ts, engine.ts)
- [ ] 實施掃描策略優化：爆量突破小型股發現 (scanner.ts)
- [ ] 實施數據完整性標記與警告機制 (scanner.ts, types)
- [ ] GitHub 同步：推送到 https://github.com/Joseph-pai/stock-pro

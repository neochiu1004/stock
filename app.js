
/**
 * 控盤方舟 V4 (GitHub 專業切分版) - JavaScript 互動與計量核心
 * 所有變數、邏輯與渲染引擎皆在此模組化封裝， comments 使用繁體中文
 */

// 1. 全域圖表顏色定義
const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e', '#64748b', '#06b6d4', '#f472b6'];

// 5% 圓整輔助函數
const round5 = (v) => Math.round(v / 5) * 5;

function updateCardTargetWeightDOM(item, weight) {
    if (item.type !== 'cash') {
        let el = document.getElementById(`card-tgt-weight-${item.id}`);
        if (el) el.innerText = weight.toFixed(1);
    }
}

// 2. 系統主要 State (確保 Fugle 與 Gemini API Key 預設為空字串，保障 GitHub 發布安全)
let state = {
    fugleApiKey: "", 
    geminiApiKey: "",
    inflowOnly: false,
    imbalanceThreshold: 5,
    lastGlobalUpdate: "--",
    cash: 15000,
    cashActive: true,
    cashWeight: 0,
    injection: 0,
    discount: 2.8,
    unit: 1,
    plMode: "GROSS", 
    ignoredRebalanceIds: [],
    settledT2Dates: [], 
    cashHistory: [], 
    assets: [
        { id: "a1", name: "元大台灣50", ticker: "0050", beta: 1.0, active: true, targetWeight: 40, savedTargetWeight: 40, marketPrice: 195.50, openPrice: 193.00, highPrice: 197.00, lowPrice: 192.50, referencePrice: 191.00, analysisLabel: "偏向買進", analysisReason: "量大收紅，三日均價大於六日均價", lastUpdated: "13:30:00", updateStatus: "success", txs: [{ id: 101, date: '2026-06-23', price: 185.00, shares: 1000, fee: 20, tax: 0, type: 'BUY', linked: false }] },
        { id: "a2", name: "元大台灣50正2", ticker: "00631L", beta: 2.0, active: true, targetWeight: 40, savedTargetWeight: 40, marketPrice: 225.0, openPrice: 220.00, highPrice: 227.00, lowPrice: 219.00, referencePrice: 218.00, analysisLabel: "偏向買進", analysisReason: "量縮價不跌，三日均價由下往上", lastUpdated: "--", updateStatus: "cache", txs: [{ id: 102, date: '2026-06-24', price: 215.00, shares: 500, fee: 20, tax: 0, type: 'BUY', linked: false }] },
        { id: "a3", name: "群益臺灣加權正2", ticker: "00685L", beta: 2.0, active: true, targetWeight: 20, savedTargetWeight: 20, marketPrice: 112.0, openPrice: 110.00, highPrice: 113.00, lowPrice: 109.50, referencePrice: 108.50, analysisLabel: "偏向買進", analysisReason: "量大收紅，三日均價大於六日均價", lastUpdated: "--", updateStatus: "cache", txs: [{ id: 103, date: '2026-06-25', price: 108.50, shares: 1000, fee: 20, tax: 0, type: 'BUY', linked: false }] }
    ]
};

let currentViewMode = 'PIE';
let pieViewType = 'CURRENT';
let mainChartInstance = null;
let currentActiveAssetId = null;
let assetIdPendingDelete = null;
let editingTxId = null; 

let isDragging = false;
let dragIndex = -1;
let dragStartX = 0;
let trackRect = null;
let dragItems = [];
let activeTxIdForActionSheet = null;
let t2DeductionState = { today: 0, future: 0 };

// 3. 初始化事件監聽
document.addEventListener("DOMContentLoaded", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateInput = document.getElementById('input-date-dynamic');
    if (dateInput) dateInput.value = todayStr;
    
    loadSavedData();
    
    const plLabel = document.getElementById('global-pl-mode-label');
    if (plLabel) {
        plLabel.innerText = state.plMode === 'NET' ? '切換帳面' : '切換淨額';
    }
    const titleEl = document.getElementById('unrealized-pl-header-title');
    if (titleEl) {
        titleEl.innerText = state.plMode === 'NET' ? "未實現損益 (淨額)" : "未實現損益 (帳面)";
    }

    if (!state.cashHistory || state.cashHistory.length === 0) {
        state.cashHistory = [{
            id: Date.now(),
            date: new Date().toLocaleString(),
            amount: state.cash,
            reason: "系統初始化"
        }];
    }

    normalizeWeights();
    renderCashHistoryUI();
    renderRealizedProfitsLedger();
});

// 4. UI 訊息提示與系統控制函數
function showToast(message, type = 'info') {
    const container = document.getElementById('ui-toast-container');
    const toast = document.createElement('div');
    toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl border shadow-2xl flex items-center gap-3 text-sm font-black transition-all transform translate-y-10 opacity-0 min-w-[200px] justify-center`;
    if (type === 'error') toast.className += ' bg-danger-red/10 border-danger-red text-danger-red backdrop-blur-xl';
    else if (type === 'success') toast.className += ' bg-primary/10 border-primary text-primary backdrop-blur-xl';
    else toast.className += ' bg-surface-container-highest border-outline-variant text-white backdrop-blur-xl';

    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('translate-y-10', 'opacity-0'));
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        var successful = document.execCommand('copy');
        if (successful) {
            showToast("已成功複製至剪貼簿", "success");
        } else {
            showToast("複製失敗，請手動複製", "error");
        }
    } catch (err) {
        showToast("複製失敗，請手動複製", "error");
    }
    document.body.removeChild(textArea);
}

function openSettingsModal() { 
    const el = document.getElementById('modal-system-settings');
    if (el) el.classList.remove('hidden');
}
function closeSettingsModal() { 
    const el = document.getElementById('modal-system-settings');
    if (el) el.classList.add('hidden'); 
}

function togglePlMode() {
    state.plMode = state.plMode === 'NET' ? 'GROSS' : 'NET';
    saveDataToLocal();

    const plLabel = document.getElementById('global-pl-mode-label');
    if (plLabel) plLabel.innerText = state.plMode === 'NET' ? '切換帳面' : '切換淨額';
    const titleEl = document.getElementById('unrealized-pl-header-title');
    if (titleEl) titleEl.innerText = state.plMode === 'NET' ? "未實現損益 (淨額)" : "未實現損益 (帳面)";

    renderAssetCards(); calculate();
    showToast(`已切換損益標準為：${state.plMode === 'NET' ? '【淨損益】(已扣估算交易稅費)' : '【帳面損益】'}`, "success");
}

async function pasteApiKey(targetId = 'api-key-input') {
    try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
            document.getElementById(targetId).value = text.trim();
            saveDataToLocal(); showToast("API Key 套用成功", "success");
        }
    } catch (err) { showToast("因網頁權限限制，請直接長按輸入框手動貼上", "info"); }
}

function logCashChange(newAmount, reason) {
    if (!state.cashHistory) state.cashHistory = [];
    if (state.cashHistory.length > 0 && state.cashHistory[0].amount === newAmount && state.cashHistory[0].reason === reason) {
        return;
    }
    state.cashHistory.unshift({
        id: Date.now() + Math.random(),
        date: new Date().toLocaleString('zh-TW', { hour12: false }),
        amount: newAmount,
        reason: reason
    });
    if (state.cashHistory.length > 40) {
        state.cashHistory.pop();
    }
    saveDataToLocal();
    renderCashHistoryUI();
}

function renderCashHistoryUI() {
    const container = document.getElementById('cash-history-panel');
    if (!container) return;
    if (!state.cashHistory || state.cashHistory.length === 0) {
        container.innerHTML = `<p class="text-center py-4 text-xs text-text-secondary font-bold">無變動紀錄</p>`;
        return;
    }
    container.innerHTML = state.cashHistory.map(h => {
        return `
        <div class="flex items-center justify-between p-2.5 bg-surface-base/80 border border-white/5 rounded-xl text-xs hover:border-white/10 transition-all font-mono">
            <div class="flex flex-col gap-1 min-w-0 flex-1 pr-2">
                <div class="flex items-center gap-2">
                    <span class="text-primary font-bold">NT$ ${Math.round(h.amount).toLocaleString()}</span>
                    <span class="text-[10px] text-text-secondary truncate bg-surface-container px-2 py-0.5 rounded-lg border border-white/5">${h.reason}</span>
                </div>
                <span class="text-[9px] text-text-secondary/60">${h.date}</span>
            </div>
            <button onclick="rollbackCash(${h.amount}, '${h.reason}')" class="bg-primary/20 text-primary border border-primary/30 hover:bg-primary hover:text-on-primary px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shrink-0 active:scale-95">
                還原
            </button>
        </div>`;
    }).join('');
}

function rollbackCash(amount, originalReason) {
    const parsedAmt = parseFloat(amount) || 0;
    state.cash = parsedAmt;
    document.getElementById('shares-cash').value = parsedAmt;
    logCashChange(parsedAmt, `還原 (原: ${originalReason})`);
    saveDataToLocal();
    calculate();
    renderAssetCards();
    showToast(`已成功還原現金餘額至 NT$ ${Math.round(parsedAmt).toLocaleString()}`, "success");
}

function toggleCashHistoryPanel() {
    const panel = document.getElementById('cash-history-panel');
    const chevron = document.getElementById('cash-history-chevron');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        chevron.innerText = "expand_less";
    } else {
        panel.classList.add('hidden');
        chevron.innerText = "expand_more";
    }
}

function saveDataToLocal() {
    state.fugleApiKey = document.getElementById('api-key-input').value.trim();
    state.geminiApiKey = document.getElementById('gemini-api-key-input').value.trim();
    
    const prevCash = state.cash;
    const currentInputCash = parseFloat(document.getElementById('shares-cash').value) || 0;
    state.cash = currentInputCash;

    state.injection = parseFloat(document.getElementById('new-injection').value) || 0;
    state.discount = parseFloat(document.getElementById('fee-discount').value) || 2.8;
    state.unit = parseInt(document.getElementById('trade-unit').value) || 1;
    state.imbalanceThreshold = parseFloat(document.getElementById('imbalance-threshold').value) || 5;
    state.inflowOnly = document.getElementById('inflow-only').checked;

    if (prevCash !== currentInputCash) {
        logCashChange(currentInputCash, "手動調整金額");
    }

    localStorage.setItem('ark_rebalancer_v4_mobile_a', JSON.stringify(state));
}

function loadSavedData() {
    let local = localStorage.getItem('ark_rebalancer_v4_mobile_a');
    if (!local) return;
    try {
        const parsed = JSON.parse(local);
        if (parsed.assets) {
            parsed.assets.forEach(a => {
                if (a.active === undefined) a.active = true;
                if (a.savedTargetWeight === undefined) a.savedTargetWeight = a.targetWeight || 0;
            });
            state.assets = parsed.assets;
        }
        
        state.inflowOnly = parsed.inflowOnly || false;
        state.imbalanceThreshold = parsed.imbalanceThreshold || 5;
        state.cash = parsed.cash || 0;
        state.cashActive = parsed.cashActive !== false;
        state.cashHistory = parsed.cashHistory || [];
        
        if (parsed.cashWeight === undefined) {
            let totalAssetW = state.assets.reduce((sum, a) => sum + (parseFloat(a.targetWeight) || 0), 0);
            state.cashWeight = Math.max(0, 100 - totalAssetW);
        } else {
            state.cashWeight = parsed.cashWeight;
        }

        state.injection = parsed.injection || 0;
        state.discount = parsed.discount || 2.8;
        state.unit = parsed.unit || 1;
        state.plMode = parsed.plMode || 'GROSS'; 
        state.ignoredRebalanceIds = parsed.ignoredRebalanceIds || [];
        state.settledT2Dates = parsed.settledT2Dates || []; 

        if (parsed.fugleApiKey) state.fugleApiKey = parsed.fugleApiKey;
        if (parsed.geminiApiKey) state.geminiApiKey = parsed.geminiApiKey;

        document.getElementById('api-key-input').value = state.fugleApiKey;
        document.getElementById('gemini-api-key-input').value = state.geminiApiKey;
        document.getElementById('shares-cash').value = state.cash;
        document.getElementById('new-injection').value = state.injection;
        document.getElementById('fee-discount').value = state.discount;
        document.getElementById('trade-unit').value = state.unit;
        document.getElementById('imbalance-threshold').value = state.imbalanceThreshold;
        document.getElementById('inflow-only').checked = state.inflowOnly;
    } catch(e) { console.error("Data restore error", e); }
}

function getActiveItems() {
    let items = [];
    state.assets.forEach((a, i) => {
        if (a.active !== false) {
            items.push({ type: 'asset', id: a.id, weight: parseFloat(a.targetWeight) || 0, color: CHART_COLORS[i % CHART_COLORS.length], name: a.name });
        }
    });
    if (state.cashActive !== false) {
        let cashColor = CHART_COLORS[state.assets.length % CHART_COLORS.length];
        items.push({ type: 'cash', id: 'cash', weight: parseFloat(state.cashWeight) || 0, color: cashColor, name: 'Settlement Cash' });
    }
    return items;
}

function updateItemWeight(item, weight) {
    if (item.type === 'cash') state.cashWeight = weight;
    else {
        let a = state.assets.find(x => x.id === item.id);
        if (a) a.targetWeight = weight;
    }
}

function normalizeWeights() {
    let items = getActiveItems();
    if (items.length === 0) {
        saveDataToLocal(); renderAssetCards(); renderSliderUI(); calculate();
        return;
    }
    
    let total = items.reduce((sum, item) => sum + item.weight, 0);

    items.forEach((item) => {
        let w = total === 0 ? (100 / items.length) : (item.weight / total) * 100;
        updateItemWeight(item, round5(w));
    });

    let currentTotal = items.reduce((sum, item) => sum + item.weight, 0);
    if (currentTotal !== 100) {
        let diff = 100 - currentTotal;
        let targetItem = items.reduce((max, item) => max.weight > item.weight ? max : item);
        let adjustedWeight = targetItem.weight + diff;
        if (adjustedWeight >= 0) {
            updateItemWeight(targetItem, adjustedWeight);
        }
    }
    
    saveDataToLocal();
    renderAssetCards();
    renderSliderUI();
    calculate();
}

function toggleAssetActive(id) {
    let a = state.assets.find(x => x.id === id);
    if (!a) return;
    if (a.active !== false) {
        a.active = false;
        a.savedTargetWeight = a.targetWeight;
        a.targetWeight = 0;
    } else {
        a.active = true;
        a.targetWeight = a.savedTargetWeight || 10; 
    }
    normalizeWeights();
}

function toggleCashActive() {
    if (state.cashActive !== false) {
        state.cashActive = false;
        state.savedCashWeight = state.cashWeight;
        state.cashWeight = 0;
    } else {
        state.cashActive = true;
        state.cashWeight = state.savedCashWeight || 10;
    }
    normalizeWeights();
}

// 5. T+2 交割與排除功能核心
function applyT2SettlementsToCash() {
    let todayStr = new Date().toISOString().slice(0, 10);
    t2DeductionState.today = 0;
    t2DeductionState.future = 0;

    state.assets.forEach(asset => {
        if (asset.txs) {
            asset.txs.forEach(t => {
                let sDate = getTPlus2Date(t.date);
                if (sDate >= todayStr) {
                    if (state.settledT2Dates && state.settledT2Dates.includes(sDate)) {
                        return;
                    }

                    let netAmount = t.type === 'BUY' 
                        ? -( (t.price * t.shares) + t.fee ) 
                        : ( (t.price * t.shares) - t.fee - (t.tax || 0) );
                    
                    if (sDate === todayStr) {
                        t2DeductionState.today += netAmount;
                    } else {
                        t2DeductionState.future += netAmount;
                    }
                }
            });
        }
    });

    if (t2DeductionState.today === 0 && t2DeductionState.future === 0) {
        showToast("目前無今日或未來的交割款項（或皆已標記排除結算）", "info");
        return;
    }

    if (t2DeductionState.today !== 0) {
        let sign = t2DeductionState.today > 0 ? "+" : "";
        const amtEl = document.getElementById('t2-actionsheet-today-amt');
        if (amtEl) amtEl.innerText = `${sign}${Math.round(t2DeductionState.today).toLocaleString()} 元`;
        const modal = document.getElementById('modal-t2-actionsheet');
        if (modal) modal.classList.remove('hidden');
    } else {
        executeT2Deduction(false);
    }
}

function closeT2ActionSheet(event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('modal-t2-actionsheet');
    if (modal) modal.classList.add('hidden');
}

function executeT2Deduction(includeToday) {
    let currentInputCash = parseFloat(document.getElementById('shares-cash').value) || 0;
    let totalToApply = t2DeductionState.future;
    let todayStr = new Date().toISOString().slice(0, 10);
    
    if (includeToday) {
        totalToApply += t2DeductionState.today;
    }

    if (!state.settledT2Dates) state.settledT2Dates = [];

    state.assets.forEach(asset => {
        if (asset.txs) {
            asset.txs.forEach(t => {
                let sDate = getTPlus2Date(t.date);
                if (sDate >= todayStr) {
                    if (sDate === todayStr) {
                        if (includeToday) {
                            if (!state.settledT2Dates.includes(sDate)) {
                                state.settledT2Dates.push(sDate);
                            }
                        }
                    } else {
                        if (!state.settledT2Dates.includes(sDate)) {
                            state.settledT2Dates.push(sDate);
                        }
                    }
                }
            });
        }
    });

    let finalCash = currentInputCash + totalToApply;
    if (finalCash < 0) {
        showToast("⚠️ 注意：預扣後帳戶餘額為負數", "error");
    }
    
    document.getElementById('shares-cash').value = finalCash;
    state.cash = finalCash;
    
    logCashChange(finalCash, "T+2 交割扣除");
    saveDataToLocal();
    calculate();

    let actionText = totalToApply > 0 ? "預先加總" : "預先扣除";
    let sign = totalToApply > 0 ? "+" : "";
    showToast(`已${actionText}交割款：${sign}${Math.round(totalToApply).toLocaleString()} 元，並標記存檔！`, "success");
    
    closeT2ActionSheet();
}

function toggleT2DateSettled(sDate) {
    if (!state.settledT2Dates) state.settledT2Dates = [];
    const idx = state.settledT2Dates.indexOf(sDate);
    if (idx > -1) {
        state.settledT2Dates.splice(idx, 1);
        showToast(`已恢復 ${formatT2Date(sDate)} 的未結算狀態`, "info");
    } else {
        state.settledT2Dates.push(sDate);
        showToast(`已將 ${formatT2Date(sDate)} 排除不計入交割`, "success");
    }
    saveDataToLocal();
    calculate();
}

// 6. 滑動 UI 動態渲染核心
function renderSliderUI() {
    const container = document.getElementById('allocation-slider-container');
    if (!container) return;
    let items = getActiveItems();
    
    if (items.length === 0) {
        container.innerHTML = `<div class="text-center py-6 border border-dashed border-danger-red/30 rounded-xl bg-danger-red/10 text-danger-red text-sm font-bold">請至少啟用一項資產或現金參與再平衡</div>`;
        return;
    }

    let html = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-sm font-black text-white flex items-center gap-2"><span class="material-symbols-outlined text-primary text-xl">tune</span> 目標比例調配</h3>
            <div class="flex gap-3 items-center">
                <span class="text-[11px] text-text-secondary bg-surface-base px-2 py-1 rounded border border-white/5 font-mono">已加入 ${items.length} 項</span>
                <button class="bg-surface-container-highest hover:bg-surface-elevated text-xs font-black text-white px-4 py-1.5 rounded-lg border border-outline-variant transition-colors active:scale-95" onclick="resetProportions()">重設等比</button>
            </div>
        </div>
        
        <div class="relative w-full h-6">
            <div class="absolute inset-0 rounded-full flex overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] border border-white/10 bg-surface-container-highest" id="slider-track-bg">
    `;

    items.forEach((item, i) => {
        html += `<div id="segment-${i}" class="h-full flex items-center justify-center relative group transition-colors" style="width: ${item.weight}%; background-color: ${item.color}e6;">
                    <span id="segment-label-${i}" class="text-[11px] font-black text-white/90 drop-shadow-md font-mono z-10 ${item.weight < 8 ? 'hidden' : ''}">${item.weight.toFixed(1)}%</span>
                 </div>`;
    });
    html += `</div>`;

    if (items.length > 1) {
        html += `<div class="absolute inset-0 pointer-events-none" id="slider-handles">`;
        let acc = 0;
        for (let i = 0; i < items.length - 1; i++) {
            acc += items[i].weight;
            html += `<div id="handle-${i}" class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 cursor-grab pointer-events-auto flex items-center justify-center z-10 hover:scale-110 active:scale-95 touch-none"
                          style="left: ${acc}%;"
                          onpointerdown="startDrag(event, ${i})">
                          <div class="w-5 h-5 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.8)] border-2 flex items-center justify-center pointer-events-none animate-pulse-border" style="border-color: ${items[i].color};">
                            <span class="material-symbols-outlined text-[10px] text-surface-container-lowest font-black" style="transform: scaleX(0.8);">code</span>
                          </div>
                     </div>`;
        }
        html += `</div>`;
    }
    
    html += `</div>`;

    html += `<div class="mt-6 flex flex-wrap justify-center gap-2 px-2">`;
    items.forEach((item, i) => {
        html += `<div class="flex items-center gap-1.5 bg-surface-base px-3 py-1.5 rounded-lg border border-white/5 shadow-sm">
                    <span class="w-2.5 h-2.5 rounded-full shadow-inner" style="background-color: ${item.color}"></span>
                    <span class="text-[11px] text-text-secondary font-bold max-w-[90px] truncate">${item.name}</span>
                    <span id="legend-label-${i}" class="text-[11px] text-white font-mono font-black">${item.weight.toFixed(1)}%</span>
                 </div>`;
    });
    html += `</div>`;

    container.innerHTML = html;
}

function startDrag(e, index) {
    e.preventDefault();
    isDragging = true;
    dragIndex = index;
    const track = document.getElementById('slider-track-bg');
    trackRect = track.getBoundingClientRect();
    dragItems = getActiveItems().map(item => ({...item})); 

    document.addEventListener('pointermove', onDrag);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
}

function onDrag(e) {
    if (!isDragging) return;
    
    let x = e.clientX - trackRect.left;
    let pct = (x / trackRect.width) * 100;

    let minPct = 0;
    for(let i=0; i<dragIndex; i++) minPct += dragItems[i].weight;

    let maxPct = 100;
    for(let i=dragItems.length-1; i>dragIndex+1; i--) maxPct -= dragItems[i].weight;

    pct = round5(pct);
    pct = Math.max(minPct + 5, Math.min(maxPct - 5, pct));

    let newLeftWeight = pct - minPct;
    let newRightWeight = maxPct - pct;

    dragItems[dragIndex].weight = newLeftWeight;
    dragItems[dragIndex+1].weight = newRightWeight;

    const leftSeg = document.getElementById(`segment-${dragIndex}`);
    const rightSeg = document.getElementById(`segment-${dragIndex + 1}`);
    const handle = document.getElementById(`handle-${dragIndex}`);
    const leftLabel = document.getElementById(`segment-label-${dragIndex}`);
    const rightLabel = document.getElementById(`segment-label-${dragIndex + 1}`);
    const leftLegend = document.getElementById('legend-label-' + dragIndex);
    const rightLegend = document.getElementById('legend-label-' + (dragIndex + 1));

    if (leftSeg) leftSeg.style.width = `${newLeftWeight}%`;
    if (rightSeg) rightSeg.style.width = `${newRightWeight}%`;
    if (handle) handle.style.left = `${pct}%`;

    if (leftLabel) {
        leftLabel.innerText = `${newLeftWeight.toFixed(1)}%`;
        leftLabel.classList.toggle('hidden', newLeftWeight < 8);
    }
    if (rightLabel) {
        rightLabel.innerText = `${newRightWeight.toFixed(1)}%`;
        rightLabel.classList.toggle('hidden', newRightWeight < 8);
    }
    
    if (leftLegend) leftLegend.innerText = `${newLeftWeight.toFixed(1)}%`;
    if (rightLegend) rightLegend.innerText = `${newRightWeight.toFixed(1)}%`;

    updateCardTargetWeightDOM(dragItems[dragIndex], newLeftWeight);
    updateCardTargetWeightDOM(dragItems[dragIndex+1], newRightWeight);
}

function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('pointermove', onDrag);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
    
    updateItemWeight(dragItems[dragIndex], dragItems[dragIndex].weight);
    updateItemWeight(dragItems[dragIndex+1], dragItems[dragIndex+1].weight);
    
    normalizeWeights(); 
}

function calculateTaiwanStockFee(price, shares, discount) {
    let rawFee = price * shares * 0.001425;
    let discountedFee = rawFee * (discount / 10);
    return Math.max(1, Math.floor(discountedFee));
}

function calculateTaiwanStockTax(ticker, price, shares, type) {
    if (type === 'BUY') return 0;
    let cleanTicker = (ticker || '').trim().toUpperCase();
    if (/^00.*B$/.test(cleanTicker)) return 0;
    if (/^00/.test(cleanTicker)) return Math.round(price * shares * 0.001);
    return Math.round(price * shares * 0.003);
}

// 15. WAC 行動平均成本庫
function aggregateAssetLedger(assetId) {
    let asset = state.assets.find(a => a.id === assetId);
    let txs = (asset && asset.txs) ? asset.txs : [];
    
    let sortedTxs = [...txs].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let totalShares = 0;
    let totalCost = 0;
    let wac = 0;

    sortedTxs.forEach(t => {
        if (t.type === 'BUY') {
            let buyCost = (t.price * t.shares) + t.fee + (t.tax || 0);
            totalShares += t.shares;
            totalCost += buyCost;
            wac = totalShares > 0 ? (totalCost / totalShares) : 0;
        } else if (t.type === 'SELL') {
            totalShares -= t.shares;
            if (totalShares < 0) totalShares = 0;
            totalCost = totalShares * wac;
        }
    });

    return { shares: totalShares, wac: wac, totalCost: totalCost };
}

// 動態計算歷史已實現獲利紀錄
function calculateRealizedProfits() {
    let realizedList = [];
    state.assets.forEach(asset => {
        let txs = asset.txs || [];
        let sortedTxs = [...txs].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        let totalShares = 0;
        let totalCost = 0;
        let wac = 0;

        sortedTxs.forEach(t => {
            if (t.type === 'BUY') {
                let buyCost = (t.price * t.shares) + t.fee + (t.tax || 0);
                totalShares += t.shares;
                totalCost += buyCost;
                wac = totalShares > 0 ? (totalCost / totalShares) : 0;
            } else if (t.type === 'SELL') {
                let costOfSold = wac * t.shares;
                let netSellProceeds = (t.price * t.shares) - t.fee - (t.tax || 0);
                let p_l = netSellProceeds - costOfSold;

                realizedList.push({
                    id: t.id,
                    assetName: asset.name,
                    ticker: asset.ticker || "無代號",
                    date: t.date,
                    shares: t.shares,
                    sellPrice: t.price,
                    buyCostPerShare: wac,
                    realizedPL: p_l,
                    fee: t.fee,
                    tax: t.tax
                });

                totalShares -= t.shares;
                if (totalShares < 0) totalShares = 0;
                totalCost = totalShares * wac;
            }
        });
    });
    return realizedList.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// 渲染已實現獲利明細列表
function renderRealizedProfitsLedger() {
    const container = document.getElementById('realized-profits-ledger-container');
    const totalLabel = document.getElementById('stat-total-realized-profit');
    if (!container) return;

    const list = calculateRealizedProfits();
    let sumRealized = 0;

    if (list.length === 0) {
        container.innerHTML = `<p class="text-center py-6 text-xs text-text-secondary font-bold border border-dashed border-white/5 rounded-xl bg-surface-container-highest/10">目前尚無已實現賣出獲利紀錄。</p>`;
        if (totalLabel) totalLabel.innerText = "累計獲利: NT$ 0";
        return;
    }

    container.innerHTML = list.map(item => {
        sumRealized += item.realizedPL;
        const plColor = item.realizedPL >= 0 ? "text-danger-red" : "text-success-emerald";
        const plPrefix = item.realizedPL >= 0 ? "+" : "";
        return `
        <div class="p-4 bg-surface-base/60 border border-white/5 rounded-2xl flex flex-col gap-2 font-mono text-xs hover:bg-surface-base transition-colors">
            <div class="flex justify-between items-center border-b border-white/5 pb-2">
                <span class="font-black text-white text-sm">${item.assetName} <span class="text-text-secondary/70">(${item.ticker})</span></span>
                <span class="text-text-secondary/60 text-[10px] bg-surface-container px-2 py-0.5 rounded-lg border border-white/5">${item.date}</span>
            </div>
            <div class="grid grid-cols-2 gap-y-1.5 text-text-secondary">
                <div>賣出數量: <span class="text-white font-bold">${item.shares.toLocaleString()} 股</span></div>
                <div>賣出單價: <span class="text-white font-bold">NT$ ${item.sellPrice.toFixed(2)}</span></div>
                <div>買入均價: <span class="text-white font-bold">NT$ ${item.buyCostPerShare.toFixed(2)}</span></div>
                <div>估算稅費: <span class="text-white font-bold">${item.fee + item.tax}</span> <span class="text-[9px] opacity-70">(費:${item.fee}/稅:${item.tax})</span></div>
            </div>
            <div class="flex justify-between items-center pt-1.5 border-t border-white/5">
                <span class="font-bold text-text-secondary">單筆已實現損益:</span>
                <span class="${plColor} font-black text-base">${plPrefix}NT$ ${Math.round(item.realizedPL).toLocaleString()}</span>
            </div>
        </div>`;
    }).join('');

    if (totalLabel) {
        const prefix = sumRealized >= 0 ? "+" : "";
        totalLabel.innerText = `累計獲利: NT$ ${prefix}${Math.round(sumRealized).toLocaleString()}`;
        totalLabel.className = `text-sm font-black font-mono border px-3 py-1 rounded-xl ${sumRealized >= 0 ? 'bg-danger-red/10 border-danger-red/30 text-danger-red' : 'bg-success-emerald/10 border-success-emerald/30 text-success-emerald'}`;
    }
}

// 7. 金融精算與再平衡核心 (隔離未參與再平衡的資產)
function calculate() {
    let cashWeight = state.cashActive !== false ? state.cashWeight : 0;
    let totalAssetWeight = state.assets.reduce((sum, a) => sum + (a.active !== false ? parseFloat(a.targetWeight) : 0), 0);
    let totalWeight = cashWeight + totalAssetWeight;
    
    let rightZoneContainer = document.getElementById('panel-dynamic-right-zone');
    let tradeUnit = state.unit;
    
    let totalCurrentPortfolioStocksMarketValue = 0;
    let totalPortfolioInitialCost = 0;
    let totalFrictionCost = 0;
    let totalEstSellCost = 0; 
    let currentAssetValues = {};
    
    state.assets.forEach(asset => {
        let ledger = aggregateAssetLedger(asset.id);
        let val = ledger.shares * asset.marketPrice;
        currentAssetValues[asset.id] = val;
        totalCurrentPortfolioStocksMarketValue += val;
        totalPortfolioInitialCost += ledger.totalCost;
        
        if (ledger.shares > 0) {
            let sellFee = calculateTaiwanStockFee(asset.marketPrice, ledger.shares, state.discount);
            let sellTax = calculateTaiwanStockTax(asset.ticker, asset.marketPrice, ledger.shares, 'SELL');
            totalEstSellCost += (sellFee + sellTax);
        }

        if (asset.txs) {
            asset.txs.forEach(t => totalFrictionCost += (t.fee || 0) + (t.tax || 0));
        }
    });
    
    let totalCurrent = totalCurrentPortfolioStocksMarketValue + state.cash;
    let totalTarget = totalCurrent + state.injection;
    let unreleasedTotalPlAmount = totalCurrentPortfolioStocksMarketValue - totalPortfolioInitialCost;

    let totalActiveCurrent = 0;
    if (state.cashActive !== false) {
        totalActiveCurrent += state.cash;
    }
    state.assets.forEach(asset => {
        if (asset.active !== false) {
            totalActiveCurrent += currentAssetValues[asset.id] || 0;
        }
    });
    let totalActiveTarget = totalActiveCurrent + state.injection;

    let displayTotalPl = unreleasedTotalPlAmount;
    if (state.plMode === 'NET') {
        displayTotalPl = unreleasedTotalPlAmount - totalEstSellCost;
    }
    let overallPortfolioRoi = totalPortfolioInitialCost > 0 ? (displayTotalPl / totalPortfolioInitialCost) * 100 : 0;
    
    document.getElementById('stat-total-asset').innerText = `NT$ ${Math.round(totalTarget).toLocaleString()}`;
    
    let titleEl = document.getElementById('unrealized-pl-header-title');
    if (titleEl) {
        titleEl.innerText = state.plMode === 'NET' ? "未實現 (淨)" : "未實現 (帳面)";
    }

    let plStatElement = document.getElementById('stat-total-pl');
    if (totalPortfolioInitialCost > 0) {
        let prefix = displayTotalPl >= 0 ? "+" : "";
        let colorClass = displayTotalPl >= 0 ? "text-danger-red font-black" : "text-success-emerald font-black";
        plStatElement.innerText = `NT$ ${prefix}${Math.round(displayTotalPl).toLocaleString()} (${prefix}${overallPortfolioRoi.toFixed(2)}%)`;
        plStatElement.className = `text-lg sm:text-xl md:text-2xl font-mono leading-tight tracking-tight ${colorClass}`;
    } else {
        plStatElement.innerText = "NT$ 0 (0.00%)";
        plStatElement.className = "text-lg sm:text-xl font-black font-mono leading-tight text-text-secondary tracking-tight";
    }
    document.getElementById('stat-total-friction').innerText = `F: ${Math.round(totalFrictionCost).toLocaleString()}`;

    let currBeta = 0, tgtBeta = 0;
    state.assets.forEach(asset => {
        let actualW = totalCurrent > 0 ? (currentAssetValues[asset.id] / totalCurrent) : 0;
        let targetW = asset.active !== false ? (parseFloat(asset.targetWeight) || 0) : 0;
        let assetBeta = asset.beta !== undefined ? parseFloat(asset.beta) : 1.0;
        currBeta += actualW * assetBeta;
        tgtBeta += targetW * assetBeta;
    });
    document.getElementById('stat-curr-beta').innerText = currBeta.toFixed(2);
    document.getElementById('stat-tgt-beta').innerText = tgtBeta.toFixed(2);

    let actions = [];
    if (state.injection > 0) actions.push({ type: 'INJECT', ticker: '新資金準備', shares: 0, value: state.injection });

    state.assets.forEach(asset => {
        if (asset.active === false) return; 
        if (state.ignoredRebalanceIds && state.ignoredRebalanceIds.includes(asset.id)) return;

        let t_weight = (parseFloat(asset.targetWeight) || 0) / 100;
        let t_val = totalActiveTarget * t_weight;
        let c_val = currentAssetValues[asset.id];
        let deltaVal = t_val - c_val;
  
        if(asset.marketPrice <= 0) return;
        let deltaShares = deltaVal / asset.marketPrice;

        deltaShares = tradeUnit === 1000 
            ? (deltaShares > 0 ? Math.floor(deltaShares / 1000) * 1000 : Math.round(deltaShares / 1000) * 1000)
            : (deltaShares > 0 ? Math.floor(deltaShares) : Math.round(deltaShares));

        if(deltaShares < 0 && !state.inflowOnly) {
            actions.push({ id: asset.id, type: 'SELL', ticker: asset.name, shares: Math.abs(deltaShares), value: Math.abs(deltaShares * asset.marketPrice) });
        }
        if(deltaShares > 0) {
            actions.push({ id: asset.id, type: 'BUY', ticker: asset.name, shares: deltaShares, value: deltaShares * asset.marketPrice });
        }
    });

    let expectedAssetValues = {...currentAssetValues};
    actions.forEach(act => {
        if (act.type === 'BUY' && act.id) expectedAssetValues[act.id] += act.value;
    });
    let expectedTotalStocksVal = state.assets.reduce((sum, a) => sum + expectedAssetValues[a.id], 0);
    let expectedCash = Math.max(0, totalTarget - expectedTotalStocksVal);

    let innerStepsHtml = `
        <div class="space-y-4">
            <div class="flex justify-between items-center px-1">
                <div>
                    <span class="text-xs font-black text-text-secondary uppercase tracking-widest">Rebalance Plan</span>
                </div>
                <span class="px-3 py-1 ${state.injection > 0 ? 'bg-secondary/10 text-secondary border-secondary/20' : 'bg-primary/10 text-primary border-primary/20'} border rounded-full text-[10px] font-black uppercase">Auto Generated</span>
            </div>
            <div class="space-y-3">`;

    if(actions.length === 0 || (actions.length === 1 && actions[0].type === 'INJECT')) {
        innerStepsHtml += `<p class="text-center py-8 text-sm text-text-secondary uppercase font-bold border border-dashed border-surface-container-highest rounded-xl bg-surface-container-highest/20">無觸發平衡或無配置變更</p>`;
    } else {
        actions.forEach((act, idx) => {
            let isSell = act.type === 'SELL';
            let isInject = act.type === 'INJECT';
            let badgeColor = isSell ? 'bg-success-emerald/20 text-success-emerald' : (isInject ? 'bg-secondary/20 text-secondary' : 'bg-danger-red/20 text-danger-red');
            let actionText = isSell ? '掛單賣出' : (isInject ? '預定匯入' : '掛單買進');
            
            innerStepsHtml += `
                <div class="flex items-center justify-between p-4 bg-surface-container-highest/20 rounded-xl border border-white/5 shadow-sm hover:border-white/10 transition-all">
                    <div class="flex items-center gap-4 min-w-0">
                        <span class="w-8 h-8 flex items-center justify-center rounded-full text-xs font-black shrink-0 ${badgeColor}">${idx+1}</span>
                        <div class="min-w-0">
                            <p class="text-sm font-black text-white flex items-center gap-1.5 truncate">${actionText} ${act.ticker}</p>
                            <p class="text-xs font-mono text-text-secondary uppercase mt-0.5">${act.shares > 0 ? act.shares.toLocaleString() + ' SHARES' : 'FUNDS'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <p class="text-sm font-mono font-bold text-white">NT$ ${Math.round(act.value).toLocaleString()}</p>
                    </div>
                </div>`;
        });
    }
    innerStepsHtml += `</div></div>`;
    if (rightZoneContainer) rightZoneContainer.innerHTML = innerStepsHtml;

    updateDynamicCharts(currentAssetValues, totalCurrent, cashWeight, totalTarget, true, expectedAssetValues, expectedCash, totalActiveTarget);
    renderT2SettlementPanel();
    renderRealizedProfitsLedger();
}

function switchViewMode(mode) {
    currentViewMode = mode;
    const activeClass = 'flex-1 py-2 text-sm font-black rounded-lg transition-all bg-surface-card text-white shadow-md border border-outline-variant';
    const inactiveClass = 'flex-1 py-2 text-sm font-black rounded-lg transition-all text-text-secondary hover:text-white border border-transparent';
    
    document.getElementById('tab-pie').className = mode === 'PIE' ? activeClass : inactiveClass;
    document.getElementById('tab-gap').className = mode === 'GAP' ? activeClass : inactiveClass;
    document.getElementById('view-pie').classList.toggle('hidden', mode !== 'PIE');
    document.getElementById('view-gap').classList.toggle('hidden', mode !== 'GAP');
    calculate(); 
}

function switchPieType(type) {
    pieViewType = type;
    const currBtn = document.getElementById('btn-pie-curr');
    const tgtBtn = document.getElementById('btn-pie-tgt');

    if(type === 'CURRENT') {
        currBtn.className = 'px-5 py-2 rounded-full text-sm font-black bg-action-blue text-white shadow border border-action-blue transition-colors';
        tgtBtn.className = 'px-5 py-2 rounded-full text-sm font-black bg-surface-container text-text-secondary border border-outline-variant hover:text-white transition-colors';
    } else {
        currBtn.className = 'px-5 py-2 rounded-full text-sm font-black bg-surface-container text-text-secondary border border-outline-variant hover:text-white transition-colors';
        tgtBtn.className = 'px-5 py-2 rounded-full text-sm font-black bg-primary text-on-primary shadow border border-primary transition-colors';
    }
    calculate(); 
}

// 8. 增強型圖表繪製
function updateDynamicCharts(currentVals, totalCurrent, tgtCashPct, totalTarget, isValid, expectedAssetValues, expectedCash, totalActiveTarget) {
    let labels = [], currData = [], tgtData = [], pointColors = [];
    let legendHtml = '', gapHtml = '';
    const legendContainer = document.getElementById('main-legend-container');
    const gapBarsContainer = document.getElementById('gap-bars-container');

    let activeTargetPool = (typeof totalActiveTarget !== 'undefined' && totalActiveTarget > 0) ? totalActiveTarget : totalTarget;

    state.assets.forEach((a, i) => {
        if(a.active === false && pieViewType === 'TARGET') return; 
        
        let color = CHART_COLORS[i % CHART_COLORS.length];
        let c_val = currentVals[a.id] || 0;
        let c_pct = totalCurrent > 0 ? (c_val / totalCurrent) * 100 : 0;
        
        let t_pct = 0;
        let t_pct_raw = a.active !== false ? (parseFloat(a.targetWeight) || 0) : 0;
        
        if (state.inflowOnly && expectedAssetValues && pieViewType === 'TARGET') {
            t_pct = totalTarget > 0 ? ((expectedAssetValues[a.id] || 0) / totalTarget) * 100 : 0;
        } else { t_pct = t_pct_raw; }

        if (pieViewType === 'CURRENT' && c_pct === 0) return; 
        
        labels.push(a.name);
        currData.push(c_pct.toFixed(1));
        tgtData.push(t_pct.toFixed(1));
        pointColors.push(color);

        let displayPct = pieViewType === 'CURRENT' ? c_pct.toFixed(1) : t_pct.toFixed(1);
        let displayVal = pieViewType === 'CURRENT' ? c_val : (activeTargetPool * t_pct / 100);
        legendHtml += `
            <div class="flex flex-col gap-1 bg-surface-container-highest/30 px-3 py-2 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0 ${a.active === false ? 'opacity-50' : ''}" style="background-color: ${color}"></span>
                    <span class="text-xs font-bold text-text-secondary truncate uppercase ${a.active === false ? 'line-through' : ''}">${a.name}</span>
                </div>
                <div class="flex justify-between items-center mt-0.5 font-mono text-[10px]">
                    <span class="text-text-secondary">NT$ ${Math.round(displayVal).toLocaleString()}</span>
                    <span class="font-black ${pieViewType === 'CURRENT' ? 'text-action-blue' : 'text-primary'}">${displayPct}%</span>
                </div>
            </div>`;

        if (a.active !== false) {
            let isImbalanced = Math.abs(c_pct - t_pct_raw) > state.imbalanceThreshold;
            let targetVal = activeTargetPool * (t_pct_raw / 100);
            gapHtml += `
                <div class="flex flex-col gap-1.5 relative group cursor-pointer" onclick="openLedgerModal('${a.id}')">
                    <div class="flex justify-between items-end flex-wrap gap-1">
                        <span class="text-xs font-bold text-white group-hover:text-primary transition-colors">${a.name}</span>
                        <div class="flex items-baseline gap-1 font-mono text-[11px] text-right">
                            <span class="text-text-secondary">NT$ ${Math.round(c_val).toLocaleString()}</span>
                            <span class="font-black ${isImbalanced ? 'text-danger-red' : 'text-action-blue'}">(${c_pct.toFixed(1)}%)</span>
                            <span class="text-text-secondary">/ NT$ ${Math.round(targetVal).toLocaleString()}</span>
                            <span class="text-text-secondary">(${t_pct_raw.toFixed(1)}%)</span>
                        </div>
                    </div>
                    <div class="w-full h-3.5 bg-surface-container-highest rounded-full relative overflow-hidden border border-outline-variant/30">
                        <div class="absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${isImbalanced ? 'bg-danger-red/80 animate-pulse' : 'bg-action-blue/80'}" style="width: ${c_pct}%"></div>
                        <div class="absolute top-0 h-full w-1.5 bg-white z-10 shadow-[0_0_2px_black]" style="left: calc(${t_pct_raw}% - 0.75px)"></div>
                    </div>
                </div>`;
        }
    });

    if (state.cashActive !== false || pieViewType === 'CURRENT') {
        labels.push("Settlement Cash");
        let c_cash_pct = totalCurrent > 0 ? ((state.cash / totalCurrent) * 100) : 0;
        currData.push(c_cash_pct.toFixed(1));
        
        let t_cash_pct = 0;
        if (state.inflowOnly && expectedAssetValues && pieViewType === 'TARGET') {
            t_cash_pct = totalTarget > 0 ? (expectedCash / totalTarget) * 100 : 0;
        } else { t_cash_pct = state.cashActive !== false ? state.cashWeight : 0; }
        tgtData.push(t_cash_pct.toFixed(1));
        
        let cashColor = CHART_COLORS[state.assets.length % CHART_COLORS.length];
        pointColors.push(cashColor);
        let displayCashPct = pieViewType === 'CURRENT' ? c_cash_pct.toFixed(1) : t_cash_pct.toFixed(1);

        let displayCashVal = pieViewType === 'CURRENT' ? state.cash : (activeTargetPool * t_cash_pct / 100);
        legendHtml += `
            <div class="flex flex-col gap-1 bg-surface-container-highest/30 px-3 py-2 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${cashColor}"></span>
                    <span class="text-xs font-bold text-text-secondary truncate uppercase">Cash</span>
                </div>
                <div class="flex justify-between items-center mt-0.5 font-mono text-[10px]">
                    <span class="text-text-secondary">NT$ ${Math.round(displayCashVal).toLocaleString()}</span>
                    <span class="font-black ${pieViewType === 'CURRENT' ? 'text-action-blue' : 'text-primary'}">${displayCashPct}%</span>
                </div>
            </div>`;
        
        if (state.cashActive !== false) {
            let isCashImbalanced = Math.abs(c_cash_pct - tgtCashPct) > state.imbalanceThreshold;
            let targetCashVal = activeTargetPool * (tgtCashPct / 100);
            gapHtml += `
                <div class="flex flex-col gap-1.5 relative mt-2 pt-4 border-t border-surface-container-highest">
                    <div class="flex justify-between items-end flex-wrap gap-1">
                        <span class="text-xs font-bold text-text-secondary">Settlement Cash</span>
                        <div class="flex items-baseline gap-1 font-mono text-[11px] text-right">
                            <span class="text-text-secondary">NT$ ${Math.round(state.cash).toLocaleString()}</span>
                            <span class="font-black ${isCashImbalanced ? 'text-danger-red' : 'text-action-blue'}">(${c_cash_pct.toFixed(1)}%)</span>
                            <span class="text-text-secondary">/ NT$ ${Math.round(targetCashVal).toLocaleString()}</span>
                            <span class="text-text-secondary">(${tgtCashPct.toFixed(1)}%)</span>
                        </div>
                    </div>
                    <div class="w-full h-3.5 bg-surface-container-lowest rounded-full relative overflow-hidden border border-outline-variant/30">
                        <div class="absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${isCashImbalanced ? 'bg-danger-red/60' : 'bg-surface-elevated'}" style="width: ${c_cash_pct}%"></div>
                        <div class="absolute top-0 h-full w-1.5 bg-text-secondary z-10 shadow-[0_0_2px_black]" style="left: calc(${tgtCashPct}% - 0.75px)"></div>
                    </div>
                </div>`;
        }
    }

    if (legendContainer) legendContainer.innerHTML = legendHtml;
    if (gapBarsContainer) gapBarsContainer.innerHTML = gapHtml;

    if(currentViewMode === 'PIE') {
        let activeData = pieViewType === 'CURRENT' ? currData : tgtData;
        const chartConfig = {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{ 
                    data: isValid ? activeData : [100], 
                    backgroundColor: isValid ? pointColors : ['#475569'], 
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: { 
                cutout: '72%', responsive: true, maintainAspectRatio: false, 
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        enabled: isValid, displayColors: false,
                        titleFont: { size: 14, family: "'Hanken Grotesk', sans-serif" },
                        bodyFont: { size: 14, family: "'JetBrains Mono', monospace", weight: 'bold' },
                        padding: 12, 
                        callbacks: { 
                            label: function(context) { 
                                let pct = context.raw;
                                let label = context.label || '';
                                let amt = 0;
                                if (label === "Settlement Cash") {
                                    amt = pieViewType === 'CURRENT' ? state.cash : (activeTargetPool * parseFloat(pct) / 100);
                                } else {
                                    let asset = state.assets.find(x => x.name === label);
                                    if (asset) {
                                        amt = pieViewType === 'CURRENT' ? (currentVals[asset.id] || 0) : (activeTargetPool * parseFloat(pct) / 100);
                                    }
                                }
                                return ` ${label}: NT$ ${Math.round(amt).toLocaleString()} (${pct}%)`; 
                            } 
                        }
                    }
                },
                animation: { animateScale: true, animateRotate: true }
            }
        };

        if (mainChartInstance) mainChartInstance.destroy();
        mainChartInstance = new Chart(document.getElementById('mainChart').getContext('2d'), chartConfig);
    }
}

// 9. 流水帳登錄預覽
function updateTxPreview() {
    let type = document.getElementById('input-type-dynamic').value;
    let price = parseFloat(document.getElementById('input-price-dynamic').value) || 0;
    let shares = parseInt(document.getElementById('input-shares-dynamic').value) || 0;
    
    let tickerEl = document.getElementById('modal-asset-ticker');
    let ticker = tickerEl ? tickerEl.value : '';
    let box = document.getElementById('tx-preview-box');
    
    let cashLabel = document.getElementById('current-cash-preview');
    if (cashLabel) {
        cashLabel.innerText = `(現有: NT$ ${state.cash.toLocaleString()})`;
    }

    if (price <= 0 || shares <= 0) { 
        if (box) box.innerHTML = '請輸入單價與股數...'; 
        return; 
    }

    let fee = calculateTaiwanStockFee(price, shares, state.discount);
    let tax = calculateTaiwanStockTax(ticker, price, shares, type);
    let total = price * shares;
    let net = type === 'BUY' ? total + fee : total - fee - tax;
    let text = type === 'BUY' ? `總扣減: NT$ ${net.toLocaleString()}` : `預估淨得: NT$ ${net.toLocaleString()}`;
    let color = type === 'BUY' ? 'text-danger-red' : 'text-success-emerald';
    
    if (box) {
        box.innerHTML = `
            <div class="flex justify-between w-full"><span>手續費: <span class="text-white">${fee}</span></span> <span>證交稅: <span class="text-white">${tax}</span></span></div>
            <div class="${color} font-black mt-1">${text}</div>
        `;
    }
}

// 10. 編輯與刪除模態彈窗 (Modals)
function openLedgerModal(id) {
    cancelEditTransaction(); 
    currentActiveAssetId = id;
    let a = state.assets.find(x => x.id === id);
    if(!a) return;
    
    document.getElementById('ledger-dynamic-title').innerText = `${a.name} 配置管理`;
    document.getElementById('modal-asset-name').value = a.name;
    document.getElementById('modal-asset-ticker').value = a.ticker;
    
    const wInput = document.getElementById('modal-asset-weight');
    wInput.value = a.targetWeight;
    wInput.disabled = (a.active === false);
    
    const badge = document.getElementById('modal-active-badge');
    if(a.active === false) {
        badge.innerText = "已排除再平衡";
        badge.className = "text-[10px] text-danger-red bg-danger-red/10 border border-danger-red/20 px-2 py-0.5 rounded";
    } else {
        badge.innerText = "參與再平衡";
        badge.className = "text-[10px] text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded";
    }

    let l = aggregateAssetLedger(id);
    document.getElementById('modal-wac-display').innerText = `平均持股成本: NT$ ${l.wac.toFixed(2)}`;

    document.getElementById('modal-asset-beta').value = a.beta !== undefined ? a.beta : 1.0;
    document.getElementById('modal-asset-price').value = a.marketPrice;
    document.getElementById('input-price-dynamic').value = a.marketPrice;
    
    updateTxPreview(); renderLedgerTable();
    document.getElementById('modal-dynamic-ledger').classList.remove('hidden');
}

function closeLedgerModal() {
    cancelEditTransaction(); 
    document.getElementById('modal-dynamic-ledger').classList.add('hidden');
    currentActiveAssetId = null; 
}

function saveModalSettingsOnly() {
    if(!currentActiveAssetId) return;
    let a = state.assets.find(x => x.id === currentActiveAssetId);
    a.name = document.getElementById('modal-asset-name').value || "新資產";
    a.ticker = (document.getElementById('modal-asset-ticker').value || "").toUpperCase().trim();
    if (a.active !== false) {
        a.targetWeight = round5(parseFloat(document.getElementById('modal-asset-weight').value) || 0);
    }
    let nBeta = parseFloat(document.getElementById('modal-asset-beta').value);
    a.beta = isNaN(nBeta) ? 1.0 : nBeta;
    a.marketPrice = parseFloat(document.getElementById('modal-asset-price').value) || 0;
    
    normalizeWeights(); showToast("參數儲存成功", "success"); closeLedgerModal();
}

function removeAsset(id) {
    let a = state.assets.find(x => x.id === id);
    if(a && a.txs && a.txs.length > 0) {
        assetIdPendingDelete = id;
        document.getElementById('delete-asset-name-label').innerText = a.name;
        document.getElementById('modal-confirm-delete').classList.remove('hidden');
        document.getElementById('btn-confirm-delete-execute').onclick = () => {
            executeRemoveAsset(assetIdPendingDelete);
            closeDeleteConfirmModal(); closeLedgerModal();
        };
    } else {
        executeRemoveAsset(id); closeLedgerModal();
    }
}

function executeRemoveAsset(id) {
    state.assets = state.assets.filter(x => x.id !== id);
    normalizeWeights(); showToast("資產已成功移除", "info");
}

function closeDeleteConfirmModal() {
    const modal = document.getElementById('modal-confirm-delete');
    if (modal) modal.classList.add('hidden');
    assetIdPendingDelete = null;
}

function openClearConfirmModal() {
    const modal = document.getElementById('modal-confirm-clear');
    if (modal) modal.classList.remove('hidden');
    const execBtn = document.getElementById('btn-confirm-clear-execute');
    if (execBtn) {
        execBtn.onclick = () => {
            executeClearAllTransactions();
            closeClearConfirmModal();
        };
    }
}
function closeClearConfirmModal() {
    const modal = document.getElementById('modal-confirm-clear');
    if (modal) modal.classList.add('hidden');
}

function executeClearAllTransactions() {
    let asset = state.assets.find(a => a.id === currentActiveAssetId);
    if (asset) {
        if(editingTxId) cancelEditTransaction();
        asset.txs = []; 
        let l = aggregateAssetLedger(currentActiveAssetId);
        document.getElementById('modal-wac-display').innerText = `平均持股成本: NT$ ${l.wac.toFixed(2)}`;
        normalizeWeights(); renderLedgerTable();
        showToast(`已清空 【${asset.name}】 的歷史交易紀錄`, "success");
    }
}

// 【修復】新增資產時強制重新綁定與渲染畫面
function addAsset() {
    let newId = "a_" + Date.now();
    state.assets.push({ id: newId, name: "新資產", ticker: "", beta: 1.0, active: true, targetWeight: 0, savedTargetWeight: 0, marketPrice: 100.0, txs: [] });
    normalizeWeights();
    renderAssetCards(); // 強制重繪卡片列表
    renderSliderUI();   // 強制重繪滑動條
    setTimeout(() => openLedgerModal(newId), 100);
}

function openTxActionSheet(txId, assetName, type, date, price, shares) {
    activeTxIdForActionSheet = txId;
    const descEl = document.getElementById('tx-actionsheet-desc');
    if (descEl) {
        descEl.innerText = `${assetName} ｜ ${type === 'BUY' ? '買進' : '賣出'} ｜ ${date} ｜ ${price.toFixed(2)}元 ｜ ${shares.toLocaleString()}股`;
    }
    const modal = document.getElementById('modal-tx-actionsheet');
    if (modal) modal.classList.remove('hidden');
}

function closeTxActionSheet(event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('modal-tx-actionsheet');
    if (modal) modal.classList.add('hidden');
    activeTxIdForActionSheet = null;
}

function triggerTxAction(action) {
    if (!activeTxIdForActionSheet) return;
    const targetTxId = activeTxIdForActionSheet;
    closeTxActionSheet();
    if (action === 'EDIT') {
        loadTransactionForEdit(targetTxId);
    } else if (action === 'DELETE') {
        deleteTransaction(targetTxId);
    }
}

function loadTransactionForEdit(txId) {
    if(!currentActiveAssetId) return;
    let a = state.assets.find(x => x.id === currentActiveAssetId);
    let tx = a.txs.find(t => t.id === txId);
    if(!tx) return;

    editingTxId = txId;
    document.getElementById('input-type-dynamic').value = tx.type;
    document.getElementById('input-date-dynamic').value = tx.date;
    document.getElementById('input-price-dynamic').value = tx.price;
    document.getElementById('input-shares-dynamic').value = tx.shares;
    document.getElementById('input-linked-dynamic').checked = tx.linked;

    const btn = document.getElementById('btn-submit-tx');
    if (btn) {
        btn.innerText = "💾 確認更新明細";
        btn.className = "flex-[2] bg-secondary text-on-secondary py-3.5 rounded-xl text-sm font-black shadow-lg active:scale-95 transition-all";
    }
    const cancelBtn = document.getElementById('btn-cancel-edit-tx');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    const titleEl = document.getElementById('ledger-dynamic-title');
    if (titleEl) titleEl.scrollIntoView({ behavior: 'smooth' });
    updateTxPreview();
}

function cancelEditTransaction() {
    editingTxId = null;
    document.getElementById('input-date-dynamic').value = new Date().toISOString().slice(0, 10);
    document.getElementById('input-shares-dynamic').value = '';
    const btn = document.getElementById('btn-submit-tx');
    if (btn) {
        btn.innerText = "新增流水明細";
        btn.className = "flex-[2] bg-action-blue text-white py-3.5 rounded-xl text-sm font-black shadow-lg active:scale-95 transition-all";
    }
    const cancelBtn = document.getElementById('btn-cancel-edit-tx');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    
    if (currentActiveAssetId) {
        let a = state.assets.find(x => x.id === currentActiveAssetId);
        if (a) document.getElementById('input-price-dynamic').value = a.marketPrice;
    }
    updateTxPreview();
}

function deleteTransaction(id) {
    if (editingTxId === id) cancelEditTransaction();
    let asset = state.assets.find(a => a.id === currentActiveAssetId);
    let tx = asset.txs.find(t => t.id === id);
    
    if (tx && tx.linked) {
        let simulatedCash = state.cash;
        if (tx.type === 'BUY') {
            simulatedCash += ((tx.price * tx.shares) + tx.fee);
        } else if (tx.type === 'SELL') {
            simulatedCash -= ((tx.price * tx.shares) - tx.fee - (tx.tax || 0));
        }
        state.cash = simulatedCash;
        document.getElementById('shares-cash').value = simulatedCash;
        logCashChange(simulatedCash, `刪除連動交易還原 (${asset.name})`);
    }

    asset.txs = asset.txs.filter(t => t.id !== id);
    
    let l = aggregateAssetLedger(currentActiveAssetId);
    document.getElementById('modal-wac-display').innerText = `平均持股成本: NT$ ${l.wac.toFixed(2)}`;
    
    normalizeWeights(); renderLedgerTable(); showToast("明細已移除", "info");
}

// 11. API 同步與多筆券商 CSV 載入核心邏輯
async function syncModalTicker() {
    if(!currentActiveAssetId) return;
    const tickerInput = document.getElementById('modal-asset-ticker').value;
    const ticker = (tickerInput || '').trim().toUpperCase().replace(/\.TWO?$/, "");
    if (!ticker) return showToast("請先輸入代號", "error");
    if (!state.fugleApiKey) return showToast("請先設定 API 金鑰", "error");

    const btn = document.getElementById('btn-sync-ticker');
    const originalText = btn.innerText;
    btn.innerText = "🔄 同步中..."; btn.disabled = true;

    try {
        const url = `https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${ticker}`;
        const res = await fetchWithTimeout(url, 5000, { method: 'GET', headers: { 'X-API-KEY': state.fugleApiKey } });
        if (!res.ok) throw new Error("無效或無權限");
        const data = await res.json();
        
        let priceStr = data.latest_price || data.realtime?.latest_trade_price || data.lastPrice || data.closePrice || (data.lastTrade && data.lastTrade.price) || data.referencePrice;
        let price = parseQuoteNumber(priceStr);
        
        let a = state.assets.find(x => x.id === currentActiveAssetId);
        if (a) {
            if (data.name) a.name = data.name;
            if (price) a.marketPrice = price;

            let r = data.realtime;
            let lastRow = data.rows && data.rows.length > 0 ? data.rows[data.rows.length - 1] : null;

            a.referencePrice = parseQuoteNumber(data.previousClose || data.referencePrice || data.refPrice) || a.referencePrice;
            a.openPrice = parseQuoteNumber(data.openPrice || r?.open || lastRow?.open) || a.openPrice;
            a.highPrice = parseQuoteNumber(data.highPrice || r?.high || lastRow?.high) || a.highPrice;
            a.lowPrice = parseQuoteNumber(data.lowPrice || r?.low || lastRow?.low) || a.lowPrice;

            if (data.analysis?.overall) {
                a.analysisLabel = data.analysis.overall.label;
                a.analysisReason = data.analysis.overall.reason;
            }
        }

        if (data.name) document.getElementById('modal-asset-name').value = data.name;
        if (price) {
            document.getElementById('modal-asset-price').value = price;
            document.getElementById('input-price-dynamic').value = price;
        }
        
        showToast("已同步最新報價與市場決策", "success");
        updateTxPreview(); 
    } catch (e) {
        showToast("同步失敗", "error");
    } finally {
        btn.innerText = originalText; btn.disabled = false;
    }
}

async function fetchPriceViaGAS(ticker, specificAssetId = null) {
    if (!ticker || !state.fugleApiKey) return null;
    const url = `https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${ticker}`; 
    try {
        const response = await fetchWithTimeout(url, 5000, { method: 'GET', headers: { 'X-API-KEY': state.fugleApiKey } });
        if (!response.ok) return null;
        const data = await response.json();
        
        let priceStr = data.latest_price || data.realtime?.latest_trade_price || data.lastPrice || data.closePrice || (data.lastTrade && data.lastTrade.price) || data.referencePrice;
        
        if (specificAssetId) {
            let asset = state.assets.find(a => a.id === specificAssetId);
            if (asset) {
                if (asset.name === "新資產" && data.name) asset.name = data.name;
                
                let r = data.realtime;
                let lastRow = data.rows && data.rows.length > 0 ? data.rows[data.rows.length - 1] : null;

                asset.referencePrice = parseQuoteNumber(data.previousClose || data.referencePrice || data.refPrice) || asset.referencePrice;
                asset.openPrice = parseQuoteNumber(data.openPrice || r?.open || lastRow?.open) || asset.openPrice;
                asset.highPrice = parseQuoteNumber(data.highPrice || r?.high || lastRow?.high) || asset.highPrice;
                asset.lowPrice = parseQuoteNumber(data.lowPrice || r?.low || lastRow?.low) || asset.lowPrice;

                if (data.analysis?.overall) {
                    asset.analysisLabel = data.analysis.overall.label;
                    asset.analysisReason = data.analysis.overall.reason;
                }
            }
        }
        
        return parseQuoteNumber(priceStr);
    } catch (e) { return null; }
}

async function fetchLatestPrices() {
    if (!state.fugleApiKey) return showToast("尚未設定 Fugle API Key", "error");

    const dot = document.getElementById('api-status-dot');
    const timeLabel = document.getElementById('global-update-time');
    
    if(dot) dot.className = "w-3 h-3 rounded-full bg-secondary animate-pulse";
    
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
    state.lastGlobalUpdate = timeStr;

    const validRequests = state.assets
        .map(a => ({ id: a.id, ticker: (a.ticker || '').trim().toUpperCase().replace(/\.TWO?$/, "") }))
        .filter(req => req.ticker !== '');
    
    const pricePromises = validRequests.map(req => fetchPriceViaGAS(req.ticker, req.id));
    const prices = await Promise.all(pricePromises);

    const updatedItems = [];
    prices.forEach((price, index) => {
        const targetId = validRequests[index].id;
        const assetIndex = state.assets.findIndex(a => a.id === targetId);
        
        if (assetIndex !== -1) {
            if (price && price > 0) {
                state.assets[assetIndex].marketPrice = price;
                state.assets[assetIndex].lastUpdated = timeStr;
                state.assets[assetIndex].updateStatus = 'success';
                updatedItems.push(targetId);
            } else {
                state.assets[assetIndex].updateStatus = 'cache';
            }
        }
    });
    if(timeLabel) timeLabel.innerText = `SYNC: ${timeStr}`;
    
    renderAssetCards();
    calculate();

    if (dot) {
        if (updatedItems.length > 0) {
            dot.className = "w-3 h-3 rounded-full bg-primary";
        } else {
            dot.className = "w-3 h-3 rounded-full bg-danger-red";
        }
    }
    showToast("市場即時報價同步成功！", "success");
}

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function readCsvFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ name: file.name, text: e.target.result });
        reader.onerror = (e) => reject(e);
        reader.readAsText(file, "big5");
    });
}

// 【修復】多筆 CSV 匯入後強制重新綁定與渲染畫面
async function importCsvData(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let parsedGroups = {};
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
        try {
            const fileObj = await readCsvFileAsText(files[i]);
            const lines = fileObj.text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 2) continue;

            const headerRow = parseCsvLine(lines[0]);
            const colNameIdx = headerRow.indexOf("股票名稱");
            const colSharesIdx = headerRow.indexOf("股數");
            
            let colPriceIdx = headerRow.indexOf("成交價");
            if (colPriceIdx === -1) {
                colPriceIdx = headerRow.indexOf("成交均價");
            }
            
            const colMarketPriceIdx = headerRow.indexOf("市價");
            const colDateIdx = headerRow.indexOf("成交日期");

            if (colNameIdx === -1 || colSharesIdx === -1 || colPriceIdx === -1) {
                errorCount++;
                continue;
            }

            for (let j = 1; j < lines.length; j++) {
                const cols = parseCsvLine(lines[j]);
                if (cols.length < headerRow.length) continue;
                
                const stockName = cols[colNameIdx];
                if (!stockName || stockName.startsWith("總預估") || stockName.startsWith("總融資") || stockName === "總計") {
                    continue; 
                }

                const rawShares = cols[colSharesIdx].replace(/,/g, '').replace(/"/g, '');
                const shares = parseInt(rawShares);
                const rawPrice = cols[colPriceIdx].replace(/,/g, '').replace(/"/g, '');
                const price = parseFloat(rawPrice);
                
                if (isNaN(shares) || isNaN(price) || shares <= 0 || price <= 0) continue;

                const rawMarketPrice = colMarketPriceIdx !== -1 ? cols[colMarketPriceIdx].replace(/,/g, '').replace(/"/g, '') : null;
                const marketPrice = rawMarketPrice ? parseFloat(rawMarketPrice) : price;

                let dateStr = (colDateIdx !== -1 && cols[colDateIdx]) ? cols[colDateIdx] : new Date().toISOString().slice(0, 10);
                dateStr = dateStr.replace(/\//g, "-"); 

                if (!parsedGroups[stockName]) {
                    parsedGroups[stockName] = { name: stockName, marketPrice: marketPrice, txs: [] };
                }

                const fee = calculateTaiwanStockFee(price, shares, state.discount);
                const tax = 0;
                
                parsedGroups[stockName].txs.push({
                    id: Date.now() + Math.random(), date: dateStr, price: price, shares: shares,
                    fee: fee, tax: tax, type: 'BUY', linked: false 
                });
            }
            successCount++;
        } catch (err) {
            errorCount++;
            console.error(err);
        }
    }

    if (successCount === 0) {
        showToast("解析選取的 CSV 檔案皆失敗", "error");
        document.getElementById('import-csv-file').value = '';
        return;
    }

    for (const name in parsedGroups) {
        const groupData = parsedGroups[name];
        let existingAsset = state.assets.find(a => a.name.trim() === name.trim());
        if (existingAsset) {
            if (!existingAsset.txs) existingAsset.txs = [];
            existingAsset.txs = [...existingAsset.txs, ...groupData.txs];
            existingAsset.marketPrice = groupData.marketPrice;
            existingAsset.active = true;
        } else {
            const newAsset = {
                id: "a_" + Date.now() + Math.floor(Math.random()*1000),
                name: groupData.name, ticker: "", beta: 1.0, active: true,
                targetWeight: 0, savedTargetWeight: 0, marketPrice: groupData.marketPrice, txs: groupData.txs
            };
            state.assets.push(newAsset);
        }
    }

    // 強制完整重新綁定與渲染畫面
    normalizeWeights();
    renderAssetCards();
    renderSliderUI();
    calculate();

    if (errorCount > 0) {
        showToast(`已成功合併匯入 ${successCount} 個 CSV 檔案，但有 ${errorCount} 個檔案格式有誤。`, "success");
    } else {
        showToast(`成功合併匯入並解析 ${successCount} 個券商 CSV 帳戶明細！`, "success");
    }
    document.getElementById('import-csv-file').value = ''; 
}

// 12. 智慧 AI 健檢分析模態
function closeAIReportModal() { 
    const modal = document.getElementById('modal-ai-report');
    if (modal) modal.classList.add('hidden'); 
}

function applyAIWeights(text) {
    if (!text || text.trim() === '') return showToast("請貼上 AI 的回覆內容", "error");
    try {
        const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*"cash"[\s\S]*\}/i);
        if (!match) throw new Error("找不到有效的 JSON 格式");
        
        let jsonStr = match[1] ? match[1] : match[0];
        let weights = JSON.parse(jsonStr);
        
        if (weights.cash !== undefined) {
            state.cashActive = true;
            state.cashWeight = parseFloat(weights.cash);
        }
        
        state.assets.forEach(a => {
            if (weights[a.id] !== undefined) {
                a.active = true;
                a.targetWeight = parseFloat(weights[a.id]);
            }
        });
        
        normalizeWeights();
        showToast("✨ 已成功套用 AI 建議配置", "success");
        closeAIReportModal();
    } catch (e) {
        console.error(e);
        showToast("解析失敗：請確認回覆中包含完整的 JSON 權重格式", "error");
    }
}

async function generateAIReport() {
    const modal = document.getElementById('modal-ai-report');
    const contentBox = document.getElementById('ai-report-content');
    if (modal) modal.classList.remove('hidden');

    let totalVal = document.getElementById('stat-total-asset').innerText;
    let totalPl = document.getElementById('stat-total-pl').innerText;
    let assetsText = state.assets.filter(a => a.active !== false).map(a => `${a.name}(id: "${a.id}", 現重: ${a.targetWeight}%)`).join('、');
    
    const prompt = `你是一個專業的量化金融與資產配置顧問。以下是使用者目前的投資組合現況：
- 總資產規模：${totalVal}
- 未實現損益：${totalPl}
- 目標資產配置：現金(${state.cashWeight}%)、${assetsText}。

請給出一段繁體中文的精簡點評（包含配置風險提示與優化建議），字數控制在120字以內。
【強制指令】請務必在回覆結尾，嚴格輸出一組 JSON 格式的建議權重，包含 "cash" 與上述各資產的 id，各項目權重加總必須嚴格等於 100。
範例：
\`\`\`json
{"cash": 10, "a1": 40, "a2": 50}
\`\`\``;

    const effectiveApiKey = state.geminiApiKey || "";

    if (!effectiveApiKey) {
        if (contentBox) {
            contentBox.innerHTML = `
                <div class="space-y-4">
                    <div class="p-4 bg-secondary/10 border border-secondary/30 rounded-xl text-secondary text-xs font-bold leading-relaxed shadow-inner">
                        ⚠️ 尚未設定 Gemini API Key。<br>請手動複製以下提示詞，至外部 AI (如 ChatGPT 或 Gemini) 詢問，並將其回覆貼於下方。
                    </div>
                    <div class="relative">
                        <textarea id="ai-prompt-copy" class="w-full h-32 p-3 bg-surface-container-highest/50 border border-outline-variant rounded-xl text-[11px] font-mono text-text-secondary focus:outline-none resize-none" readonly>${prompt}</textarea>
                        <button onclick="fallbackCopyTextToClipboard(document.getElementById('ai-prompt-copy').value);" class="absolute top-2 right-2 bg-surface-container-highest hover:bg-surface-elevated text-white p-2 rounded-lg transition-all active:scale-95 shadow-md"><span class="material-symbols-outlined text-[16px]">content_copy</span></button>
                    </div>
                    <textarea id="ai-response-paste" class="w-full h-32 p-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-xs font-mono text-white focus:border-primary focus:outline-none resize-none" placeholder="在此貼上 AI 的完整回覆 (包含 JSON 代碼區塊)..."></textarea>
                    <button onclick="applyAIWeights(document.getElementById('ai-response-paste').value)" class="w-full bg-primary text-on-primary py-3.5 rounded-xl text-sm font-black shadow-lg active:scale-95 hover:brightness-110 transition-all flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-lg">auto_fix_high</span> 解析並一鍵套用配置
                    </button>
                </div>
            `;
        }
        return;
    }
    
    if (contentBox) {
        contentBox.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 space-y-4">
                <span class="material-symbols-outlined text-secondary text-4xl animate-spin">sync</span>
                <p class="text-text-secondary font-bold animate-pulse text-xs tracking-widest uppercase">呼叫大模型 analysis 中...</p>
            </div>
        `;
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${effectiveApiKey}`;
        let delays = [1000, 2000, 4000, 8000, 16000];
        let result = null;
        
        for (let i = 0; i < 5; i++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                result = await response.json();
                break;
            } catch (error) {
                if (i === 4) throw error;
                await new Promise(resolve => setTimeout(resolve, delays[i]));
            }
        }

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "分析生成失敗，請稍後重試。";
        const formattedText = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<span class="text-secondary font-black">$1</span>');
        const rawDataEncoded = encodeURIComponent(text);
        
        if (contentBox) {
            contentBox.innerHTML = `
                <div class="bg-surface-container-highest/30 p-5 rounded-2xl border border-white/5 shadow-inner mb-4 text-xs sm:text-sm leading-relaxed">${formattedText}</div>
                <button onclick="applyAIWeights(decodeURIComponent('${rawDataEncoded}'))" class="w-full bg-primary text-on-primary py-3.5 rounded-xl text-sm font-black shadow-lg active:scale-95 hover:brightness-110 transition-all flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-lg">auto_fix_high</span> 一鍵套用 AI 建議配置
                </button>
            `;
        }
        
    } catch (error) {
        console.error(error);
        if (contentBox) {
            contentBox.innerHTML = `<p class="text-danger-red font-bold text-center py-6">連線超時或發生錯誤，無法取得分析報告。</p>`;
        }
    }
}

// 13. 精密會計模型公式與實數對照說明 (支援 LaTeX 渲染)
function openFormulaSheet(assetId) {
    const modal = document.getElementById('modal-formula-actionsheet');
    const titleEl = document.getElementById('formula-sheet-title');
    const bodyEl = document.getElementById('formula-sheet-body');
    if (!modal || !titleEl || !bodyEl) return;

    let html = "";
    if (assetId === null || assetId === undefined) {
        titleEl.innerText = "【組合總體會計精密計量模型】";
        
        let totalCurrentPortfolioStocksMarketValue = 0;
        let totalPortfolioInitialCost = 0;
        let totalEstSellCost = 0;
        
        state.assets.forEach(asset => {
            let ledger = aggregateAssetLedger(asset.id);
            let val = ledger.shares * asset.marketPrice;
            totalCurrentPortfolioStocksMarketValue += val;
            totalPortfolioInitialCost += ledger.totalCost;
            
            if (ledger.shares > 0) {
                let sellFee = calculateTaiwanStockFee(asset.marketPrice, ledger.shares, state.discount);
                let sellTax = calculateTaiwanStockTax(asset.ticker, asset.marketPrice, ledger.shares, 'SELL');
                totalEstSellCost += (sellFee + sellTax);
            }
        });
        
        let totalCurrentNetVal = totalCurrentPortfolioStocksMarketValue - totalEstSellCost + state.cash;
        let totalCost = totalPortfolioInitialCost + state.cash; 
        let totalEstPl = totalCurrentNetVal - totalCost;
        let totalRoi = totalCost > 0 ? (totalEstPl / totalCost) * 100 : 0;

        html = `
            <div class="space-y-4 font-mono text-xs text-on-surface leading-relaxed">
                <div class="p-4 bg-surface-base/80 rounded-xl border border-white/5 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black text-white">
                        <span>總成本 (Total Cost)</span>
                        <span class="text-secondary font-bold">NT$ ${Math.round(totalCost).toLocaleString()}</span>
                    </div>
                    <p class="text-text-secondary text-[10px] leading-relaxed">
                        $$\\text{Total Cost} = \\sum (\\text{Stock Cost}) + \\text{Cash}$$
                    </p>
                    <p class="text-primary font-bold">目前帶入：${Math.round(totalPortfolioInitialCost).toLocaleString()} (證券成本) + ${Math.round(state.cash).toLocaleString()} (現金)</p>
                </div>
                
                <div class="p-4 bg-surface-base/80 rounded-xl border border-white/5 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black text-white">
                        <span>總淨現值 (Total Net Value)</span>
                        <span class="text-secondary font-bold">NT$ ${Math.round(totalCurrentNetVal).toLocaleString()}</span>
                    </div>
                    <p class="text-text-secondary text-[10px] leading-relaxed">
                        $$\\text{Total Net Value} = \\sum (\\text{Market Value} - \\text{Est. Sell Fee} - \\text{Tax}) + \\text{Cash}$$
                    </p>
                    <p class="text-primary font-bold">目前帶入：${Math.round(totalCurrentPortfolioStocksMarketValue).toLocaleString()} (市值) - ${Math.round(totalEstSellCost).toLocaleString()} (估算費用) + ${Math.round(state.cash).toLocaleString()} (現金)</p>
                </div>

                <div class="p-4 bg-surface-base/80 rounded-xl border border-white/5 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black text-white">
                        <span>總預估淨損益 (Est. Total P/L)</span>
                        <span class="${totalEstPl >= 0 ? 'text-danger-red' : 'text-success-emerald'} font-bold">NT$ ${Math.round(totalEstPl).toLocaleString()}</span>
                    </div>
                    <p class="text-text-secondary text-[10px] leading-relaxed">
                        $$\\text{Est. Total P/L} = \\text{Total Net Value} - \\text{Total Cost}$$
                    </p>
                    <p class="text-primary font-bold">計算過程：${Math.round(totalCurrentNetVal).toLocaleString()} - ${Math.round(totalCost).toLocaleString()}</p>
                </div>

                <div class="p-4 bg-surface-base/80 rounded-xl border border-white/5 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black text-white">
                        <span>總預估淨報酬率 (Total Net ROI)</span>
                        <span class="${totalEstPl >= 0 ? 'text-danger-red' : 'text-success-emerald'} font-bold">${totalRoi.toFixed(2)} %</span>
                    </div>
                    <p class="text-text-secondary text-[10px] leading-relaxed">
                        $$\\text{Total ROI} = \\left( \\frac{\\text{Est. Total P/L}}{\\text{Total Cost}} \\right) \\times 100\\%$$
                    </p>
                    <p class="text-primary font-bold">計算過程：(${Math.round(totalEstPl).toLocaleString()} ÷ ${Math.round(totalCost).toLocaleString()}) × 100%</p>
                </div>
            </div>
        `;
    } else {
        let a = state.assets.find(x => x.id === assetId);
        if (!a) return;
        titleEl.innerText = `【${a.name} (${a.ticker || '無代號'}) 精密計量】`;

        let l = aggregateAssetLedger(a.id);
        let totalShares = l.shares;
        let marketPrice = a.marketPrice;
        let marketValue = totalShares * marketPrice;
        
        let sellFee = calculateTaiwanStockFee(marketPrice, totalShares, state.discount);
        let sellTax = calculateTaiwanStockTax(a.ticker, marketPrice, totalShares, 'SELL');
        let estSellCost = sellFee + sellTax;
        
        let netValue = marketValue - estSellCost; 
        let totalCost = l.totalCost; 
        let estPl = netValue - totalCost; 
        let roi = totalCost > 0 ? (estPl / totalCost) * 100 : 0;

        let isETF = /^00/.test(a.ticker || '');
        let isBondETF = /^00.*B$/i.test(a.ticker || '');
        let taxDesc = isBondETF ? "債券型 ETF (免稅 0%)" : (isETF ? "股票型 ETF (優惠 0.1%)" : "普通股票 (標準 0.3%)");

        html = `
            <div class="space-y-4 font-mono text-xs text-on-surface leading-relaxed">
                <div class="p-4 bg-surface-base/80 rounded-xl border border-white/5 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black text-white">
                        <span>當前市值 (Market Value)</span>
                        <span class="text-secondary font-bold">NT$ ${Math.round(marketValue).toLocaleString()}</span>
                    </div>
                    <p class="text-text-secondary text-[10px] leading-relaxed">
                        $$\\text{Market Value} = \\text{Market Price} \\times \\text{Shares}$$
                    </p>
                    <p class="text-primary font-bold">目前帶入：${marketPrice.toFixed(2)} 元 × ${totalShares.toLocaleString()} 股</p>
                </div>

                <div class="p-4 bg-surface-base/80 rounded-xl border border-white/5 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black text-white">
                        <span>預估現值 (Net Realizable Value)</span>
                        <span class="text-secondary font-bold">NT$ ${Math.round(netValue).toLocaleString()}</span>
                    </div>
                    <p class="text-text-secondary text-[10px] leading-relaxed">
                        $$\\text{Net NRV} = \\text{Market Value} - \\text{Est. Fee} - \\text{Est. Tax}$$
                    </p>
                    <p class="text-text-secondary text-[10px] text-secondary">稅率分類：${taxDesc}</p>
                    <p class="text-primary font-bold">計算過程：${Math.round(marketValue).toLocaleString()} - ${sellFee} (費) - ${sellTax} (稅)</p>
                </div>

                <div class="p-4 bg-surface-base/80 rounded-xl border border-white/5 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black text-white">
                        <span>帳面付出總成本 (Total Cost)</span>
                        <span class="text-secondary font-bold">NT$ ${Math.round(totalCost).toLocaleString()}</span>
                    </div>
                    <p class="text-text-secondary text-[10px] leading-relaxed">
                        $$\\text{Total Cost} = \\sum (\\text{Purchase Price} \\times \\text{Shares} + \\text{Fee})$$
                    </p>
                    <p class="text-primary font-bold">目前累計實數成本：NT$ ${Math.round(totalCost).toLocaleString()}</p>
                </div>

                <div class="p-4 bg-surface-base/80 rounded-xl border border-white/5 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black text-white">
                        <span>預估變現淨損益 (Net P/L)</span>
                        <span class="${estPl >= 0 ? 'text-danger-red' : 'text-success-emerald'} font-bold">NT$ ${Math.round(estPl).toLocaleString()}</span>
                    </div>
                    <p class="text-text-secondary text-[10px] leading-relaxed">
                        $$\\text{Net P/L} = \\text{Net NRV} - \\text{Total Cost}$$
                    </p>
                    <p class="text-primary font-bold">計算過程：${Math.round(netValue).toLocaleString()} (現值) - ${Math.round(totalCost).toLocaleString()} (付出成本)</p>
                </div>

                <div class="p-4 bg-surface-base/80 rounded-xl border border-white/5 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black text-white">
                        <span>預估淨報酬率 (Net ROI)</span>
                        <span class="${estPl >= 0 ? 'text-danger-red' : 'text-success-emerald'} font-bold">${roi.toFixed(2)} %</span>
                    </div>
                    <p class="text-text-secondary text-[10px] leading-relaxed">
                        $$\\text{Net ROI} = \\left( \\frac{\\text{Net P/L}}{\\text{Total Cost}} \\right) \\times 100\\%$$
                    </p>
                    <p class="text-primary font-bold">計算過程：(${Math.round(estPl).toLocaleString()} ÷ ${Math.round(totalCost).toLocaleString()}) × 100%</p>
                </div>
            </div>
        `;
    }

    bodyEl.innerHTML = html;
    modal.classList.remove('hidden');
    
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise();
    }
}

function closeFormulaActionSheet(event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('modal-formula-actionsheet');
    if (modal) modal.classList.add('hidden');
}

// 14. 系統備份與資料還原
function exportData() {
    saveDataToLocal();
    const dataStr = localStorage.getItem('ark_rebalancer_v4_mobile_a') || JSON.stringify(state);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const a = document.createElement('a');
    a.setAttribute('href', dataUri);
    a.setAttribute('download', `ark_v4_mobile_backup_${new Date().toISOString().slice(0,10)}.json`);
    a.click();
    showToast("系統設定檔已導出下載", "success");
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if(parsed.assets) {
                localStorage.setItem('ark_rebalancer_v4_mobile_a', JSON.stringify(parsed));
                showToast("數據還原成功，正在重載頁面...", "success");
                setTimeout(() => location.reload(), 1000);
            } else { showToast("檔案格式錯誤，解析失敗", "error"); }
        } catch (err) { showToast("解析備份檔案失敗", "error"); }
    };
    reader.readAsText(file);
}

function resetProportions() {
    let items = getActiveItems();
    if (items.length === 0) return;
    let avg = 100 / items.length;
    items.forEach(item => updateItemWeight(item, avg));
    normalizeWeights(); 
    showToast("比例已重設等比 (依 5% 圓整)", "success");
}

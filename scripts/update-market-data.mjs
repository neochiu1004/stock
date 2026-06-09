import { mkdir, writeFile } from 'node:fs/promises';

const STOCK_CODES = ['0050', '00631L', '00685L'];
const OUTPUT_FILE = new URL('../data/market-data.json', import.meta.url);

function parseQuoteNumber(value) {
  if (value === undefined || value === null) return null;
  const parsed = Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; stock-dashboard-market-cache/1.0)'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function getTwseMonthlyDateKeys() {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return [currentMonth, previousMonth].map((date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}${month}01`;
  });
}

async function fetchTwseClose(code) {
  for (const dateKey of getTwseMonthlyDateKeys()) {
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?response=json&date=${dateKey}&stockNo=${code}`;
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) continue;
      const data = await response.json();
      if (data.stat !== 'OK' || !Array.isArray(data.data)) continue;
      const closeIndex = data.fields?.indexOf('收盤價') ?? -1;
      if (closeIndex < 0) continue;
      const latestRow = [...data.data].reverse().find((row) => parseQuoteNumber(row[closeIndex]));
      const price = latestRow ? parseQuoteNumber(latestRow[closeIndex]) : null;
      if (price) return price;
    } catch (error) {
      console.warn(`TWSE quote failed for ${code}:`, error.message);
    }
  }
  return null;
}

async function fetchYahooChartPrice(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    const data = await response.json();
    return parseQuoteNumber(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
  } catch (error) {
    console.warn(`Yahoo quote failed for ${symbol}:`, error.message);
    return null;
  }
}

function parseTaifexVixText(text) {
  const matches = [...text.matchAll(/\b\d{8}\b\s+\d{6,8}\s+([0-9]+(?:\.[0-9]+)?)/g)];
  if (matches.length === 0) return null;
  return parseQuoteNumber(matches.at(-1)[1]);
}

function getRecentDateKeys(days = 7) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  });
}

async function fetchTaifexVix() {
  for (const dateKey of getRecentDateKeys()) {
    const url = `https://www.taifex.com.tw/cht/7/getVixData?filesname=${dateKey}`;
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) continue;
      const text = await response.text();
      const value = parseTaifexVixText(text);
      if (value) return value;
    } catch (error) {
      console.warn(`TAIFEX VIX failed for ${dateKey}:`, error.message);
    }
  }
  return null;
}

const quoteEntries = await Promise.all(
  STOCK_CODES.map(async (code) => [`${code}.TW`, await fetchTwseClose(code)])
);

const payload = {
  generatedAt: new Date().toISOString(),
  source: {
    quotes: 'TWSE STOCK_DAY',
    vix: 'Yahoo Finance chart',
    vixtwn: 'TAIFEX getVixData'
  },
  quotes: Object.fromEntries(quoteEntries.filter(([, price]) => price)),
  fear: {
    vix: await fetchYahooChartPrice('^VIX'),
    vixtwn: await fetchTaifexVix()
  }
};

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload, null, 2));

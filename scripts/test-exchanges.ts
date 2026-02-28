/**
 * Exchange Data Test Script for CITARION
 * 
 * Tests:
 * 1. REST API - Ticker data
 * 2. REST API - Klines/OHLCV
 * 3. REST API - Funding Rate
 * 4. WebSocket connectivity (optional)
 * 
 * Usage: bun run scripts/test-exchanges.ts
 */

// ==================== CONFIGURATION ====================

const EXCHANGES = {
  binance: {
    name: 'Binance',
    urls: {
      ticker: 'https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT',
      klines: 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=10',
      funding: 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=5',
      markPrice: 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',
    },
    wsUrl: 'wss://fstream.binance.com/ws/btcusdt@markPrice',
  },
  bybit: {
    name: 'Bybit',
    urls: {
      ticker: 'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
      klines: 'https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=60&limit=10',
      funding: 'https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=5',
      markPrice: 'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
    },
    wsUrl: 'wss://stream.bybit.com/v5/public/linear',
  },
  okx: {
    name: 'OKX',
    urls: {
      ticker: 'https://www.okx.com/api/v5/market/tickers?instType=SWAP',
      klines: 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1H&limit=10',
      funding: 'https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=5',
      markPrice: 'https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP',
    },
    wsUrl: 'wss://ws.okx.com:8443/ws/v5/public',
  },
  bitget: {
    name: 'Bitget',
    urls: {
      // Bitget returns funding rate and mark price in ticker
      ticker: 'https://api.bitget.com/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=BTCUSDT',
      klines: 'https://api.bitget.com/api/v2/mix/market/candles?productType=USDT-FUTURES&symbol=BTCUSDT&granularity=1H&limit=10',
      // Use ticker endpoint for funding (included in response)
      funding: 'https://api.bitget.com/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=BTCUSDT',
      markPrice: 'https://api.bitget.com/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=BTCUSDT',
    },
    wsUrl: 'wss://ws.bitget.com/v2/ws/public',
  },
  bingx: {
    name: 'BingX',
    urls: {
      ticker: 'https://open-api.bingx.com/openApi/swap/v2/quote/ticker?symbol=BTC-USDT',
      klines: 'https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=BTC-USDT&interval=1h&limit=10',
      funding: 'https://open-api.bingx.com/openApi/swap/v2/quote/fundingRate?symbol=BTC-USDT',
      markPrice: 'https://open-api.bingx.com/openApi/swap/v2/quote/price?symbol=BTC-USDT',
    },
    wsUrl: 'wss://open-api-swap.bingx.com/ws',
  },
};

// ==================== HELPER FUNCTIONS ====================

interface TestResult {
  exchange: string;
  test: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function testEndpoint(exchange: string, testName: string, url: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'CITARION-Test/1.0',
        'Accept': 'application/json',
      },
    });
    
    const duration = Date.now() - start;
    
    if (!response.ok) {
      return {
        exchange,
        test: testName,
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        duration,
      };
    }
    
    const data = await response.json();
    return {
      exchange,
      test: testName,
      success: true,
      data,
      duration,
    };
  } catch (error) {
    return {
      exchange,
      test: testName,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

function parseTickerData(exchange: string, data: unknown): { price: number; symbol: string } | null {
  try {
    switch (exchange) {
      case 'binance': {
        const d = data as { price?: string; symbol?: string };
        return { price: parseFloat(d.price || '0'), symbol: d.symbol || '' };
      }
      case 'bybit': {
        const d = data as { result?: { list?: Array<{ lastPrice?: string; symbol?: string }> } };
        const item = d.result?.list?.[0];
        return item ? { price: parseFloat(item.lastPrice || '0'), symbol: item.symbol || '' } : null;
      }
      case 'okx': {
        const d = data as { data?: Array<{ last?: string; instId?: string }> };
        const item = d.data?.find((i: { instId?: string }) => i.instId === 'BTC-USDT-SWAP');
        return item ? { price: parseFloat(item.last || '0'), symbol: item.instId || '' } : null;
      }
      case 'bitget': {
        // Bitget returns data as array
        const d = data as { data?: Array<{ lastPr?: string; symbol?: string }> };
        const item = d.data?.[0];
        return item ? { price: parseFloat(item.lastPr || '0'), symbol: item.symbol || '' } : null;
      }
      case 'bingx': {
        const d = data as { data?: { lastPrice?: string; symbol?: string } };
        return d.data ? { price: parseFloat(d.data.lastPrice || '0'), symbol: d.data.symbol || '' } : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function parseFundingData(exchange: string, data: unknown): Array<{ rate: number; time: string }> {
  try {
    switch (exchange) {
      case 'binance': {
        const d = data as Array<{ fundingRate: string; fundingTime: number }>;
        return d.map((item: { fundingRate: string; fundingTime: number }) => ({
          rate: parseFloat(item.fundingRate) * 100,
          time: new Date(item.fundingTime).toISOString(),
        }));
      }
      case 'bybit': {
        const d = data as { result?: { list?: Array<{ fundingRate: string; fundingRateTimestamp: string }> } };
        return (d.result?.list || []).map((item: { fundingRate: string; fundingRateTimestamp: string }) => ({
          rate: parseFloat(item.fundingRate) * 100,
          time: new Date(parseInt(item.fundingRateTimestamp)).toISOString(),
        }));
      }
      case 'okx': {
        const d = data as { data?: Array<{ fundingRate: string; fundingTime: string }> };
        return (d.data || []).map((item: { fundingRate: string; fundingTime: string }) => ({
          rate: parseFloat(item.fundingRate) * 100,
          time: new Date(parseInt(item.fundingTime)).toISOString(),
        }));
      }
      case 'bitget': {
        // Bitget returns funding rate in ticker data
        const d = data as { data?: Array<{ fundingRate?: string; ts?: string }> };
        const item = d.data?.[0];
        if (item && item.fundingRate) {
          return [{
            rate: parseFloat(item.fundingRate) * 100,
            time: item.ts ? new Date(parseInt(item.ts)).toISOString() : new Date().toISOString(),
          }];
        }
        return [];
      }
      case 'bingx': {
        const d = data as { data?: { fundingRate?: string; nextFundingTime?: number } };
        if (d.data) {
          return [{
            rate: parseFloat(d.data.fundingRate || '0') * 100,
            time: d.data.nextFundingTime ? new Date(d.data.nextFundingTime).toISOString() : new Date().toISOString(),
          }];
        }
        return [];
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}

// ==================== MAIN TEST FUNCTION ====================

async function runTests() {
  console.log('========================================');
  console.log('  CITARION Exchange Data Test');
  console.log('========================================\n');
  
  const startTime = Date.now();
  
  // Test each exchange
  for (const [exchangeId, config] of Object.entries(EXCHANGES)) {
    console.log(`\n📡 Testing ${config.name}...`);
    console.log('─'.repeat(40));
    
    // Test Ticker
    const tickerResult = await testEndpoint(exchangeId, 'Ticker', config.urls.ticker);
    if (tickerResult.success) {
      const parsed = parseTickerData(exchangeId, tickerResult.data);
      if (parsed) {
        console.log(`  ✅ Ticker: ${parsed.symbol} = $${parsed.price.toLocaleString()}`);
      } else {
        console.log(`  ⚠️ Ticker: Got data but parse failed`);
      }
    } else {
      console.log(`  ❌ Ticker: ${tickerResult.error}`);
    }
    results.push(tickerResult);
    
    // Test Klines
    const klinesResult = await testEndpoint(exchangeId, 'Klines', config.urls.klines);
    if (klinesResult.success) {
      console.log(`  ✅ Klines: Received OHLCV data (${klinesResult.duration}ms)`);
    } else {
      console.log(`  ❌ Klines: ${klinesResult.error}`);
    }
    results.push(klinesResult);
    
    // Test Funding Rate
    const fundingResult = await testEndpoint(exchangeId, 'Funding', config.urls.funding);
    if (fundingResult.success) {
      const parsed = parseFundingData(exchangeId, fundingResult.data);
      if (parsed.length > 0) {
        const latest = parsed[0];
        console.log(`  ✅ Funding: ${latest.rate.toFixed(4)}% (next: ${latest.time})`);
      } else {
        console.log(`  ⚠️ Funding: Got data but no rates found`);
      }
    } else {
      console.log(`  ❌ Funding: ${fundingResult.error}`);
    }
    results.push(fundingResult);
    
    // Test Mark Price
    const markResult = await testEndpoint(exchangeId, 'Mark Price', config.urls.markPrice);
    if (markResult.success) {
      console.log(`  ✅ Mark Price: Received (${markResult.duration}ms)`);
    } else {
      console.log(`  ❌ Mark Price: ${markResult.error}`);
    }
    results.push(markResult);
  }
  
  // Summary
  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log('\n========================================');
  console.log('  TEST SUMMARY');
  console.log('========================================');
  console.log(`  Total tests: ${results.length}`);
  console.log(`  ✅ Passed: ${successCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  ⏱️ Total time: ${totalDuration}ms`);
  console.log('========================================\n');
  
  // Detailed failure report
  const failures = results.filter(r => !r.success);
  if (failures.length > 0) {
    console.log('❌ Failed Tests Details:');
    console.log('─'.repeat(40));
    for (const f of failures) {
      console.log(`  ${f.exchange} - ${f.test}: ${f.error}`);
    }
    console.log('');
  }
  
  // Exchange summary table
  console.log('\n📊 Exchange Status Summary:');
  console.log('─'.repeat(60));
  console.log('| Exchange  | Ticker | Klines | Funding | Mark Price |');
  console.log('|-----------|--------|--------|---------|------------|');
  
  for (const exchangeId of Object.keys(EXCHANGES)) {
    const exchangeResults = results.filter(r => r.exchange === exchangeId);
    const ticker = exchangeResults.find(r => r.test === 'Ticker')?.success ? '✅' : '❌';
    const klines = exchangeResults.find(r => r.test === 'Klines')?.success ? '✅' : '❌';
    const funding = exchangeResults.find(r => r.test === 'Funding')?.success ? '✅' : '❌';
    const mark = exchangeResults.find(r => r.test === 'Mark Price')?.success ? '✅' : '❌';
    console.log(`| ${exchangeId.padEnd(9)} |   ${ticker}   |   ${klines}   |    ${funding}    |     ${mark}      |`);
  }
  console.log('─'.repeat(60));
  
  // Return exit code
  return failCount === 0 ? 0 : 1;
}

// Run tests
runTests()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });

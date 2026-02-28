/**
 * Comprehensive Exchange Test Script
 * 
 * Tests all 5 active exchanges (Binance, Bybit, OKX, Bitget, BingX) for:
 * 1. Market Data (Ticker, Funding Rate, Klines)
 * 2. Position Sync (getFuturesPositions, getSpotPositions)
 * 3. Signal Parsing and Trade Execution
 * 
 * Run: npx tsx scripts/comprehensive-exchange-test.ts
 */

const EXCHANGES = ['binance', 'bybit', 'okx', 'bitget', 'bingx'] as const;
type ExchangeId = typeof EXCHANGES[number];

// Test symbols for each exchange
const TEST_SYMBOLS: Record<ExchangeId, { futures: string; spot: string }> = {
  binance: { futures: 'BTCUSDT', spot: 'BTCUSDT' },
  bybit: { futures: 'BTCUSDT', spot: 'BTCUSDT' },
  okx: { futures: 'BTC-USDT-SWAP', spot: 'BTC-USDT' },
  bitget: { futures: 'BTCUSDT', spot: 'BTCUSDT' },
  bingx: { futures: 'BTC-USDT', spot: 'BTC-USDT' },
};

// API endpoints
const API_ENDPOINTS = {
  binance: {
    ticker: 'https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT',
    funding: 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',
    klines: 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=10',
  },
  bybit: {
    ticker: 'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
    funding: 'https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=1',
    klines: 'https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=60&limit=10',
  },
  okx: {
    ticker: 'https://www.okx.com/api/v5/market/tickers?instType=SWAP',
    funding: 'https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP',
    klines: 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1H&limit=10',
  },
  bitget: {
    ticker: 'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES&symbol=BTCUSDT',
    funding: 'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES&symbol=BTCUSDT',
    klines: 'https://api.bitget.com/api/v2/mix/market/candles?productType=USDT-FUTURES&symbol=BTCUSDT&granularity=1H&limit=10',
  },
  bingx: {
    ticker: 'https://open-api.bingx.com/openApi/swap/v2/quote/price?symbol=BTC-USDT',
    funding: 'https://open-api.bingx.com/openApi/swap/v2/quote/fundingRate?symbol=BTC-USDT',
    klines: 'https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=BTC-USDT&interval=1h&limit=10',
  },
};

// Signal test cases
const SIGNAL_TEST_CASES = [
  {
    name: 'Futures LONG',
    text: '#BTC/USDT LONG Entry: 97000 TP: 100000 SL: 94000 Leverage: 10x',
    expected: { symbol: 'BTCUSDT', direction: 'LONG', leverage: 10 },
  },
  {
    name: 'Futures SHORT',
    text: 'ETHUSDT SHORT Entry 3500 TP 3000 Stop 4000 Leverage Cross 20x',
    expected: { symbol: 'ETHUSDT', direction: 'SHORT', leverage: 20 },
  },
  {
    name: 'Entry Zone',
    text: 'SOL/USDT Entry Zone: 150-160 TP: 180 TP: 200 Stop: 140 Lev: 15x',
    expected: { symbol: 'SOLUSDT', direction: 'LONG', entryZone: true },
  },
  {
    name: 'SPOT signal',
    text: '#DOGE/USDT SPOT Buy: 0.15 TP: 0.20 Stop: 0.12',
    expected: { symbol: 'DOGEUSDT', direction: 'LONG', marketType: 'SPOT' },
  },
  {
    name: 'Russian keywords',
    text: 'BTCUSDT лонг вход 95000 тейк 100000 стоп 90000 плечо 25x',
    expected: { symbol: 'BTCUSDT', direction: 'LONG', leverage: 25 },
  },
];

interface TestResult {
  exchange: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration?: number;
  data?: unknown;
}

const results: TestResult[] = [];

function log(result: TestResult) {
  results.push(result);
  const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} [${result.exchange.toUpperCase()}] ${result.test}: ${result.message}`);
}

async function testMarketData() {
  console.log('\n📊 === MARKET DATA TESTS ===\n');

  for (const exchange of EXCHANGES) {
    const endpoints = API_ENDPOINTS[exchange];
    
    // Test Ticker
    try {
      const start = Date.now();
      const response = await fetch(endpoints.ticker);
      const data = await response.json();
      const duration = Date.now() - start;

      if (response.ok) {
        let price = 0;
        if (exchange === 'binance') price = parseFloat(data.lastPrice);
        else if (exchange === 'bybit') price = parseFloat(data.result?.list?.[0]?.lastPrice || 0);
        else if (exchange === 'okx') {
          const btc = data.data?.find((d: { instId: string }) => d.instId === 'BTC-USDT-SWAP');
          price = parseFloat(btc?.last || 0);
        }
        else if (exchange === 'bitget') price = parseFloat(data.data?.[0]?.lastPr || 0);
        else if (exchange === 'bingx') price = parseFloat(data.data?.price || 0);

        log({
          exchange,
          test: 'Ticker',
          status: price > 0 ? 'PASS' : 'FAIL',
          message: price > 0 ? `BTC price: $${price.toLocaleString()} (${duration}ms)` : 'No price data',
          duration,
          data: { price },
        });
      } else {
        log({ exchange, test: 'Ticker', status: 'FAIL', message: `HTTP ${response.status}` });
      }
    } catch (error) {
      log({ exchange, test: 'Ticker', status: 'FAIL', message: String(error) });
    }

    // Test Funding Rate
    try {
      const start = Date.now();
      const response = await fetch(endpoints.funding);
      const data = await response.json();
      const duration = Date.now() - start;

      if (response.ok) {
        let rate = 0;
        if (exchange === 'binance') rate = parseFloat(data.lastFundingRate);
        else if (exchange === 'bybit') rate = parseFloat(data.result?.list?.[0]?.fundingRate || 0);
        else if (exchange === 'okx') rate = parseFloat(data.data?.fundingRate || 0);
        else if (exchange === 'bitget') {
          // Funding rate is in ticker response
          rate = parseFloat(data.data?.[0]?.fundingRate || 0);
        }
        else if (exchange === 'bingx') rate = parseFloat(data.data?.fundingRate || 0);

        log({
          exchange,
          test: 'Funding Rate',
          status: 'PASS',
          message: `Rate: ${(rate * 100).toFixed(4)}% (${duration}ms)`,
          duration,
          data: { rate },
        });
      } else {
        log({ exchange, test: 'Funding Rate', status: 'FAIL', message: `HTTP ${response.status}` });
      }
    } catch (error) {
      log({ exchange, test: 'Funding Rate', status: 'FAIL', message: String(error) });
    }

    // Test Klines
    try {
      const start = Date.now();
      const response = await fetch(endpoints.klines);
      const data = await response.json();
      const duration = Date.now() - start;

      if (response.ok) {
        let candles = 0;
        if (exchange === 'binance') candles = data.length;
        else if (exchange === 'bybit') candles = data.result?.list?.length || 0;
        else if (exchange === 'okx') candles = data.data?.length || 0;
        else if (exchange === 'bitget') candles = data.data?.length || 0;
        else if (exchange === 'bingx') candles = data.data?.length || 0;

        log({
          exchange,
          test: 'Klines',
          status: candles > 0 ? 'PASS' : 'FAIL',
          message: candles > 0 ? `${candles} candles received (${duration}ms)` : 'No candle data',
          duration,
        });
      } else {
        log({ exchange, test: 'Klines', status: 'FAIL', message: `HTTP ${response.status}` });
      }
    } catch (error) {
      log({ exchange, test: 'Klines', status: 'FAIL', message: String(error) });
    }
  }
}

async function testSignalParsing() {
  console.log('\n📝 === SIGNAL PARSING TESTS ===\n');

  for (const testCase of SIGNAL_TEST_CASES) {
    try {
      const response = await fetch('http://localhost:3000/api/chat/parse-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testCase.text }),
      });

      const data = await response.json();

      if (data.success && data.signal) {
        const signal = data.signal;
        let passed = true;
        const checks: string[] = [];

        // Check symbol
        if (testCase.expected.symbol && signal.symbol !== testCase.expected.symbol) {
          passed = false;
          checks.push(`symbol: expected ${testCase.expected.symbol}, got ${signal.symbol}`);
        } else {
          checks.push('symbol ✓');
        }

        // Check direction
        if (testCase.expected.direction && signal.direction !== testCase.expected.direction) {
          passed = false;
          checks.push(`direction: expected ${testCase.expected.direction}, got ${signal.direction}`);
        } else {
          checks.push('direction ✓');
        }

        // Check leverage
        if (testCase.expected.leverage && signal.leverage !== testCase.expected.leverage) {
          passed = false;
          checks.push(`leverage: expected ${testCase.expected.leverage}, got ${signal.leverage}`);
        } else if (testCase.expected.leverage) {
          checks.push('leverage ✓');
        }

        // Check entry zone
        if (testCase.expected.entryZone && !signal.entryZone) {
          passed = false;
          checks.push('entryZone: expected zone, got single entry');
        } else if (testCase.expected.entryZone) {
          checks.push('entryZone ✓');
        }

        // Check market type
        if (testCase.expected.marketType && signal.marketType !== testCase.expected.marketType) {
          passed = false;
          checks.push(`marketType: expected ${testCase.expected.marketType}, got ${signal.marketType}`);
        } else if (testCase.expected.marketType) {
          checks.push('marketType ✓');
        }

        log({
          exchange: 'parser',
          test: testCase.name,
          status: passed ? 'PASS' : 'FAIL',
          message: passed ? 'All checks passed' : checks.join(', '),
          data: signal,
        });
      } else {
        log({
          exchange: 'parser',
          test: testCase.name,
          status: 'FAIL',
          message: data.message || 'Failed to parse signal',
        });
      }
    } catch (error) {
      log({
        exchange: 'parser',
        test: testCase.name,
        status: 'FAIL',
        message: String(error),
      });
    }
  }
}

async function testPositionSync() {
  console.log('\n🔄 === POSITION SYNC TESTS ===\n');

  // Test via API endpoint
  try {
    const response = await fetch('http://localhost:3000/api/positions/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (data.success) {
      log({
        exchange: 'all',
        test: 'Position Sync',
        status: 'PASS',
        message: `Synced ${data.accountsChecked || 0} accounts, found ${data.newPositions || 0} new positions`,
        data,
      });
    } else {
      log({
        exchange: 'all',
        test: 'Position Sync',
        status: data.error?.includes('No accounts') ? 'SKIP' : 'FAIL',
        message: data.error || 'Unknown error',
      });
    }
  } catch (error) {
    log({
      exchange: 'all',
      test: 'Position Sync',
      status: 'FAIL',
      message: String(error),
    });
  }
}

async function testTradeExecution() {
  console.log('\n💹 === TRADE EXECUTION TESTS ===\n');

  // Test virtual demo trade
  const testSignal = {
    symbol: 'BTCUSDT',
    direction: 'LONG',
    amount: 10,
    leverage: 5,
    isDemo: true,
    exchangeId: 'binance',
  };

  try {
    const response = await fetch('http://localhost:3000/api/trade/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testSignal),
    });

    const data = await response.json();

    if (data.success) {
      log({
        exchange: testSignal.exchangeId,
        test: 'Virtual Demo Trade',
        status: 'PASS',
        message: `Position opened: ${data.position?.symbol} ${data.position?.direction} @ $${data.position?.avgEntryPrice}`,
        data: data.position,
      });

      // Try to close the position
      if (data.position?.id) {
        const closeResponse = await fetch('http://localhost:3000/api/trade/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionId: data.position.id }),
        });

        const closeData = await closeResponse.json();

        log({
          exchange: testSignal.exchangeId,
          test: 'Close Position',
          status: closeData.success ? 'PASS' : 'FAIL',
          message: closeData.success 
            ? `Position closed, PnL: $${closeData.pnl?.value?.toFixed(2) || 0}` 
            : closeData.error || 'Failed to close',
        });
      }
    } else {
      log({
        exchange: testSignal.exchangeId,
        test: 'Virtual Demo Trade',
        status: 'FAIL',
        message: data.error || 'Unknown error',
      });
    }
  } catch (error) {
    log({
      exchange: testSignal.exchangeId,
      test: 'Virtual Demo Trade',
      status: 'FAIL',
      message: String(error),
    });
  }
}

async function testSignalFromChat() {
  console.log('\n💬 === CHAT SIGNAL TESTS ===\n');

  // Test "close all" command
  try {
    const response = await fetch('http://localhost:3000/api/chat/parse-signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'close all' }),
    });

    const data = await response.json();

    log({
      exchange: 'chat',
      test: 'Close All Command',
      status: data.success ? 'PASS' : 'FAIL',
      message: data.message || data.error || 'Unknown result',
    });
  } catch (error) {
    log({
      exchange: 'chat',
      test: 'Close All Command',
      status: 'FAIL',
      message: String(error),
    });
  }

  // Test "positions" command
  try {
    const response = await fetch('http://localhost:3000/api/chat/parse-signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'позиции' }),
    });

    const data = await response.json();

    log({
      exchange: 'chat',
      test: 'Positions Command',
      status: data.success ? 'PASS' : 'FAIL',
      message: data.count !== undefined ? `${data.count} open positions` : (data.message || 'Unknown result'),
    });
  } catch (error) {
    log({
      exchange: 'chat',
      test: 'Positions Command',
      status: 'FAIL',
      message: String(error),
    });
  }
}

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`📊 Total: ${results.length}`);
  console.log(`📈 Success Rate: ${((passed / (results.length - skipped)) * 100).toFixed(1)}%`);

  // Group by exchange
  console.log('\n📊 Results by Exchange:');
  const byExchange = results.reduce((acc, r) => {
    if (!acc[r.exchange]) acc[r.exchange] = { pass: 0, fail: 0, skip: 0 };
    acc[r.exchange][r.status.toLowerCase() as 'pass' | 'fail' | 'skip']++;
    return acc;
  }, {} as Record<string, { pass: number; fail: number; skip: number }>);

  for (const [exchange, counts] of Object.entries(byExchange)) {
    const total = counts.pass + counts.fail + counts.skip;
    console.log(`  ${exchange.toUpperCase()}: ${counts.pass}/${total - counts.skip} passed`);
  }

  console.log('\n' + '='.repeat(60));
}

async function main() {
  console.log('🚀 Starting Comprehensive Exchange Test');
  console.log('📅 ' + new Date().toISOString());
  console.log('='.repeat(60));

  await testMarketData();
  await testSignalParsing();
  await testPositionSync();
  await testTradeExecution();
  await testSignalFromChat();

  printSummary();
}

main().catch(console.error);

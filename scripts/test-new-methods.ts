/**
 * Test New Exchange Methods
 * 
 * Tests getMarkPrice, getOpenOrders, getOrderHistory, getBalanceHistory
 * for all 5 active exchanges
 */

const EXCHANGES = ['binance', 'bybit', 'okx', 'bitget', 'bingx'] as const;

interface TestResult {
  exchange: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  data?: unknown;
}

const results: TestResult[] = [];

function log(result: TestResult) {
  results.push(result);
  const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} [${result.exchange.toUpperCase()}] ${result.method}: ${result.message}`);
}

// ==================== MARK PRICE TESTS (PUBLIC) ====================

async function testMarkPrice() {
  console.log('\n💰 === MARK PRICE TESTS (PUBLIC) ===\n');

  const endpoints: Record<string, string> = {
    binance: 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',
    bybit: 'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
    okx: 'https://www.okx.com/api/v5/public/mark-price?instId=BTC-USDT-SWAP',
    bitget: 'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES&symbol=BTCUSDT',
    bingx: 'https://open-api.bingx.com/openApi/swap/v2/quote/price?symbol=BTC-USDT',
  };

  for (const exchange of EXCHANGES) {
    try {
      const start = Date.now();
      const response = await fetch(endpoints[exchange], {
        signal: AbortSignal.timeout(15000)
      });
      const duration = Date.now() - start;

      if (!response.ok) {
        log({ exchange, method: 'Mark Price', status: 'FAIL', message: `HTTP ${response.status}` });
        continue;
      }

      const data = await response.json();
      let markPrice = 0;
      let indexPrice = 0;

      // Parse based on exchange
      if (exchange === 'binance') {
        markPrice = parseFloat(data.markPrice);
        indexPrice = parseFloat(data.indexPrice);
      } else if (exchange === 'bybit') {
        const ticker = data.result?.list?.[0];
        markPrice = parseFloat(ticker?.markPrice || 0);
        indexPrice = parseFloat(ticker?.indexPrice || 0);
      } else if (exchange === 'okx') {
        const markData = data.data?.[0];
        markPrice = parseFloat(markData?.markPx || 0);
        indexPrice = parseFloat(markData?.idxPx || 0);
      } else if (exchange === 'bitget') {
        const ticker = data.data?.[0];
        markPrice = parseFloat(ticker?.markPrice || 0);
        indexPrice = parseFloat(ticker?.indexPrice || 0);
      } else if (exchange === 'bingx') {
        markPrice = parseFloat(data.data?.markPrice || data.data?.price || 0);
        indexPrice = parseFloat(data.data?.indexPrice || 0);
      }

      if (markPrice > 0) {
        log({
          exchange,
          method: 'Mark Price',
          status: 'PASS',
          message: `Mark: $${markPrice.toLocaleString()}, Index: $${indexPrice.toLocaleString()} (${duration}ms)`,
          data: { markPrice, indexPrice },
        });
      } else {
        log({ exchange, method: 'Mark Price', status: 'FAIL', message: 'No price data received' });
      }
    } catch (error) {
      log({ exchange, method: 'Mark Price', status: 'FAIL', message: String(error) });
    }
  }
}

// ==================== OPEN ORDERS TESTS (PRIVATE - NEED API) ====================

async function testOpenOrders() {
  console.log('\n📋 === OPEN ORDERS TESTS (PRIVATE) ===\n');

  // Test via local API endpoint
  for (const exchange of EXCHANGES) {
    try {
      const start = Date.now();
      const response = await fetch(`http://localhost:3000/api/trade/open-orders?exchange=${exchange}`, {
        signal: AbortSignal.timeout(15000)
      });
      const duration = Date.now() - start;

      if (!response.ok) {
        if (response.status === 404) {
          log({ exchange, method: 'Open Orders', status: 'SKIP', message: 'API endpoint not available' });
        } else {
          log({ exchange, method: 'Open Orders', status: 'FAIL', message: `HTTP ${response.status}` });
        }
        continue;
      }

      const data = await response.json();
      
      log({
        exchange,
        method: 'Open Orders',
        status: 'PASS',
        message: `${data.orders?.length || 0} open orders (${duration}ms)`,
        data: data.orders?.slice(0, 3),
      });
    } catch (error) {
      log({ exchange, method: 'Open Orders', status: 'FAIL', message: String(error) });
    }
  }
}

// ==================== ORDER HISTORY TESTS (PRIVATE - NEED API) ====================

async function testOrderHistory() {
  console.log('\n📜 === ORDER HISTORY TESTS (PRIVATE) ===\n');

  // Test via local API endpoint
  for (const exchange of EXCHANGES) {
    try {
      const start = Date.now();
      const response = await fetch(`http://localhost:3000/api/trade/order-history?exchange=${exchange}&limit=10`, {
        signal: AbortSignal.timeout(15000)
      });
      const duration = Date.now() - start;

      if (!response.ok) {
        if (response.status === 404) {
          log({ exchange, method: 'Order History', status: 'SKIP', message: 'API endpoint not available' });
        } else {
          log({ exchange, method: 'Order History', status: 'FAIL', message: `HTTP ${response.status}` });
        }
        continue;
      }

      const data = await response.json();
      
      log({
        exchange,
        method: 'Order History',
        status: 'PASS',
        message: `${data.orders?.length || 0} historical orders (${duration}ms)`,
        data: data.orders?.slice(0, 3),
      });
    } catch (error) {
      log({ exchange, method: 'Order History', status: 'FAIL', message: String(error) });
    }
  }
}

// ==================== BALANCE HISTORY TESTS (PRIVATE - NEED API) ====================

async function testBalanceHistory() {
  console.log('\n📊 === BALANCE HISTORY TESTS (PRIVATE) ===\n');

  // Test via local API endpoint
  for (const exchange of EXCHANGES) {
    try {
      const start = Date.now();
      const response = await fetch(`http://localhost:3000/api/trade/balance-history?exchange=${exchange}&limit=10`, {
        signal: AbortSignal.timeout(15000)
      });
      const duration = Date.now() - start;

      if (!response.ok) {
        if (response.status === 404) {
          log({ exchange, method: 'Balance History', status: 'SKIP', message: 'API endpoint not available' });
        } else {
          log({ exchange, method: 'Balance History', status: 'FAIL', message: `HTTP ${response.status}` });
        }
        continue;
      }

      const data = await response.json();
      
      log({
        exchange,
        method: 'Balance History',
        status: 'PASS',
        message: `${data.history?.length || 0} balance records (${duration}ms)`,
        data: data.history?.slice(0, 3),
      });
    } catch (error) {
      log({ exchange, method: 'Balance History', status: 'FAIL', message: String(error) });
    }
  }
}

// ==================== SUMMARY ====================

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

// ==================== MAIN ====================

async function main() {
  console.log('🚀 Starting New Exchange Methods Test');
  console.log('📅 ' + new Date().toISOString());
  console.log('='.repeat(60));

  await testMarkPrice();
  await testOpenOrders();
  await testOrderHistory();
  await testBalanceHistory();

  printSummary();
}

main().catch(console.error);

/**
 * Test script for getOpenInterest() method on all exchanges
 * Run with: bun run scripts/test-open-interest.ts
 */

const EXCHANGES = ['binance', 'bybit', 'okx', 'bitget', 'bingx'] as const;
const TEST_SYMBOL = 'BTCUSDT';

// Base URLs for public API calls
const BASE_URLS: Record<string, string> = {
  binance: 'https://fapi.binance.com',
  bybit: 'https://api.bybit.com',
  okx: 'https://www.okx.com',
  bitget: 'https://api.bitget.com',
  bingx: 'https://open-api.bingx.com',
};

interface OpenInterestResult {
  exchange: string;
  success: boolean;
  openInterest?: number;
  openInterestUsd?: number;
  timestamp?: string;
  error?: string;
  duration: number;
}

async function testBinance(): Promise<OpenInterestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URLS.binance}/fapi/v1/openInterest?symbol=${TEST_SYMBOL}`);
    const data = await response.json() as { openInterest?: string; time?: number; code?: number; msg?: string };
    
    if (!response.ok || data.code) {
      throw new Error(data.msg || `HTTP ${response.status}`);
    }
    
    const oi = parseFloat(data.openInterest || '0');
    return {
      exchange: 'binance',
      success: true,
      openInterest: oi,
      timestamp: new Date(data.time || Date.now()).toISOString(),
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      exchange: 'binance',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testBybit(): Promise<OpenInterestResult> {
  const start = Date.now();
  try {
    // Bybit requires intervalTime parameter and returns list of historical data
    const response = await fetch(`${BASE_URLS.bybit}/v5/market/open-interest?category=linear&symbol=${TEST_SYMBOL}&intervalTime=5min`);
    const data = await response.json() as { 
      retCode: number; 
      result?: { 
        list?: Array<{ openInterest: string; timestamp: string }> 
      }; 
      retMsg?: string 
    };
    
    if (data.retCode !== 0) {
      throw new Error(data.retMsg || `Code ${data.retCode}`);
    }
    
    // Get the most recent (first) entry
    const latestOi = data.result?.list?.[0];
    if (!latestOi) {
      throw new Error('No open interest data in response');
    }
    
    return {
      exchange: 'bybit',
      success: true,
      openInterest: parseFloat(latestOi.openInterest),
      timestamp: new Date(parseInt(latestOi.timestamp)).toISOString(),
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      exchange: 'bybit',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testOKX(): Promise<OpenInterestResult> {
  const start = Date.now();
  try {
    // OKX uses BTC-USDT-SWAP format
    const instId = 'BTC-USDT-SWAP';
    const response = await fetch(`${BASE_URLS.okx}/api/v5/public/open-interest?instType=SWAP&instId=${instId}`);
    const data = await response.json() as { code: string; data?: Array<{ oi: string; oiCcy: string; ts: string }>; msg?: string };
    
    if (data.code !== '0') {
      throw new Error(data.msg || `Code ${data.code}`);
    }
    
    const oiData = data.data?.[0];
    return {
      exchange: 'okx',
      success: true,
      openInterest: parseFloat(oiData?.oi || '0'),
      openInterestUsd: parseFloat(oiData?.oiCcy || '0'),
      timestamp: new Date(parseInt(oiData?.ts || '0')).toISOString(),
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      exchange: 'okx',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testBitget(): Promise<OpenInterestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URLS.bitget}/api/v2/mix/market/open-interest?productType=USDT-FUTURES&symbol=${TEST_SYMBOL}`);
    const data = await response.json() as { 
      code: string; 
      data?: { 
        openInterestList?: Array<{ size?: string; openInterest?: string }>;
        ts?: string;
      }; 
      msg?: string 
    };
    
    if (data.code !== '00000') {
      throw new Error(data.msg || `Code ${data.code}`);
    }
    
    const oiData = data.data?.openInterestList?.[0];
    const openInterest = parseFloat(oiData?.size || oiData?.openInterest || '0');
    
    return {
      exchange: 'bitget',
      success: true,
      openInterest,
      timestamp: data.data?.ts ? new Date(parseInt(data.data.ts)).toISOString() : new Date().toISOString(),
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      exchange: 'bitget',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testBingX(): Promise<OpenInterestResult> {
  const start = Date.now();
  try {
    // BingX has dedicated openInterest endpoint!
    const symbol = 'BTC-USDT';
    const response = await fetch(`${BASE_URLS.bingx}/openApi/swap/v2/quote/openInterest?symbol=${symbol}`);
    const data = await response.json() as { 
      code: number; 
      data?: { 
        openInterest: string;
        symbol: string;
        time: number;
      }; 
      msg?: string 
    };
    
    if (data.code !== 0) {
      throw new Error(data.msg || `Code ${data.code}`);
    }
    
    // BingX returns OI in USDT value
    const openInterestUsd = parseFloat(data.data?.openInterest || '0');
    
    return {
      exchange: 'bingx',
      success: true,
      openInterestUsd,
      timestamp: new Date(data.data?.time || Date.now()).toISOString(),
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      exchange: 'bingx',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Testing getOpenInterest() on all exchanges');
  console.log(`Symbol: ${TEST_SYMBOL}`);
  console.log('='.repeat(60));
  console.log();
  
  const results: OpenInterestResult[] = [];
  
  // Test all exchanges
  results.push(await testBinance());
  results.push(await testBybit());
  results.push(await testOKX());
  results.push(await testBitget());
  results.push(await testBingX());
  
  // Print results
  console.log('Results:');
  console.log('-'.repeat(60));
  
  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.exchange.toUpperCase()}`);
      console.log(`   Open Interest: ${result.openInterest?.toLocaleString()} contracts`);
      if (result.openInterestUsd) {
        console.log(`   Open Interest USD: $${result.openInterestUsd?.toLocaleString()}`);
      }
      console.log(`   Timestamp: ${result.timestamp}`);
      console.log(`   Duration: ${result.duration}ms`);
    } else {
      console.log(`❌ ${result.exchange.toUpperCase()}`);
      console.log(`   Error: ${result.error}`);
      console.log(`   Duration: ${result.duration}ms`);
    }
    console.log();
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('-'.repeat(60));
  console.log(`Summary: ${successful}/${results.length} exchanges working`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Exchanges with issues: ${results.filter(r => !r.success).map(r => r.exchange).join(', ')}`);
  }
}

main().catch(console.error);

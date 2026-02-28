/**
 * Test Bitget Funding Rate Endpoint
 */

async function testBitgetFunding() {
  console.log('🔍 Testing Bitget Funding Rate Endpoints\n');
  
  // Test 1: Ticker endpoint (where funding rate should be)
  console.log('1️⃣ Testing Ticker Endpoint:');
  try {
    const tickerUrl = 'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES&symbol=BTCUSDT';
    console.log(`   URL: ${tickerUrl}`);
    
    const start = Date.now();
    const response = await fetch(tickerUrl, {
      signal: AbortSignal.timeout(15000)
    });
    const duration = Date.now() - start;
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Duration: ${duration}ms`);
    
    const data = await response.json();
    console.log(`   Response code: ${data.code}`);
    
    if (data.data && data.data[0]) {
      const ticker = data.data[0];
      console.log(`   Symbol: ${ticker.symbol}`);
      console.log(`   Last Price: ${ticker.lastPr}`);
      console.log(`   Funding Rate: ${ticker.fundingRate || 'NOT PRESENT'}`);
      console.log(`   Next Funding Time: ${ticker.nextFundingTime || 'NOT PRESENT'}`);
      console.log(`   Available fields: ${Object.keys(ticker).join(', ')}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error}`);
  }
  
  // Test 2: Try old funding rate endpoint
  console.log('\n2️⃣ Testing Old Funding Rate Endpoint:');
  try {
    const oldUrl = 'https://api.bitget.com/api/v2/mix/market/current-funding-rate?productType=USDT-FUTURES&symbol=BTCUSDT';
    console.log(`   URL: ${oldUrl}`);
    
    const start = Date.now();
    const response = await fetch(oldUrl, {
      signal: AbortSignal.timeout(15000)
    });
    const duration = Date.now() - start;
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Duration: ${duration}ms`);
    
    const data = await response.json();
    console.log(`   Response code: ${data.code}`);
    console.log(`   Response msg: ${data.msg || 'N/A'}`);
    
    if (data.data) {
      console.log(`   Data: ${JSON.stringify(data.data, null, 2)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error}`);
  }
  
  // Test 3: Check Bitget API docs - try alternative endpoints
  console.log('\n3️⃣ Testing Alternative Endpoints:');
  
  const endpoints = [
    '/api/v2/mix/market/funding-rate?symbol=BTCUSDT&productType=USDT-FUTURES',
    '/api/mix/v1/market/current-funding-rate?symbol=BTCUSDT',
    '/api/v2/mix/market/history-funding-rate?symbol=BTCUSDT&productType=USDT-FUTURES&limit=1',
  ];
  
  for (const endpoint of endpoints) {
    try {
      const url = `https://api.bitget.com${endpoint}`;
      console.log(`\n   Testing: ${endpoint}`);
      
      const start = Date.now();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000)
      });
      const duration = Date.now() - start;
      
      console.log(`   Status: ${response.status} (${duration}ms)`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ SUCCESS! Code: ${data.code}`);
        if (data.data) {
          console.log(`   Data: ${JSON.stringify(data.data).substring(0, 200)}...`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }
  }
  
  console.log('\n✅ Test completed');
}

testBitgetFunding().catch(console.error);

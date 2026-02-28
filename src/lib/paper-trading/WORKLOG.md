# Paper Trading Engine Worklog

## 2026-01-XX - Initial Implementation

### Created Files
- `/src/lib/paper-trading/types.ts` - Types for virtual account, positions, trades
- `/src/lib/paper-trading/engine.ts` - PaperTradingEngine class
- `/src/lib/paper-trading/index.ts` - Module exports

### Architecture

```
Paper Trading Engine
├── types.ts
│   ├── PaperTradingConfig   - Configuration for paper account
│   ├── PaperAccount         - Virtual trading account
│   ├── PaperPosition        - Open position tracking
│   ├── PaperTrade           - Completed trade record
│   ├── PaperTradingMetrics  - Performance metrics
│   └── PaperTradingEvent    - Event system for callbacks
│
└── engine.ts
    └── PaperTradingEngine
        ├── createAccount()       - Create virtual account
        ├── start() / stop()      - Control trading
        ├── updatePrices()        - Update with real prices
        ├── processCandles()      - Analyze and execute signals
        ├── openPosition()        - Manual position opening
        ├── closePosition()       - Close position
        ├── closeAllPositions()   - Emergency close all
        └── subscribe()           - Event subscription
```

### Key Features

1. **Virtual Account Management**
   - Multiple accounts support
   - Real-time balance tracking
   - Equity and margin calculation
   - Drawdown monitoring

2. **Position Tracking**
   - Entry/Exit recording
   - PnL calculation
   - Leverage support
   - Liquidation price tracking

3. **Tactics Integration**
   - SL/TP from tactics
   - Trailing stop execution
   - Partial closes
   - DCA support

4. **Event System**
   - POSITION_OPENED
   - POSITION_CLOSED
   - POSITION_UPDATED
   - SIGNAL_GENERATED
   - MAX_DRAWDOWN_REACHED
   - ERROR

### Example Usage

```typescript
import { getPaperTradingEngine } from '@/lib/paper-trading';

const engine = getPaperTradingEngine();

// Create account
const account = engine.createAccount({
  id: 'paper-1',
  name: 'Test Account',
  initialBalance: 10000,
  currency: 'USDT',
  exchange: 'binance',
  symbols: ['BTCUSDT', 'ETHUSDT'],
  timeframe: '1h',
  strategyId: 'rsi-reversal',
  tacticsSets: [tacticsSet],
  autoTrading: true,
  maxRiskPerTrade: 2,
  maxDrawdown: 20,
  maxOpenPositions: 3,
});

// Start trading
engine.start(account.id);

// Update with real prices (from WebSocket)
engine.updatePrices({
  'BTCUSDT': 45000,
  'ETHUSDT': 3000,
});

// Or process candles
await engine.processCandles(account.id, 'BTCUSDT', candles);

// Subscribe to events
engine.subscribe((event) => {
  if (event.type === 'POSITION_OPENED') {
    console.log('New position:', event.data.position);
  }
});
```

### Integration Points

1. **Strategy Framework** - Signal generation
2. **Tactics** - Position management rules
3. **Real Price Feeds** - From exchange WebSocket
4. **Notifications** - Via event system

### Differences from Backtesting

| Feature | Backtesting | Paper Trading |
|---------|-------------|---------------|
| Data | Historical | Real-time |
| Speed | Fast (batch) | Real-time |
| Slippage | Simulated | Actual |
| Purpose | Strategy testing | Live simulation |

### Next Steps

- [ ] Connect to real exchange WebSocket
- [ ] Add persistence (database)
- [ ] Implement order queue
- [ ] Add multi-exchange support

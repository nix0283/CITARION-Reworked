/**
 * TradingView Webhook API Endpoint
 * 
 * Receives and processes trading signals from TradingView alerts
 * 
 * Security:
 * - HMAC-SHA256 signature validation
 * - Rate limiting
 * - Payload validation
 * 
 * @see https://core.telegram.org/bots/api
 * @see https://www.okx.com/docs-v5/en/#trading-account
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { validateRequest, TradingViewWebhookSchema, validationErrorResponse } from '@/lib/validation';



/**
 * Validate TradingView webhook signature
 */
function validateSignature(payload: string, signature: string | null): boolean {
  if (!signature) {
    return false;
  }
  
  const secret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('[TradingView] Webhook secret not configured');
    return false;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}



/**
 * POST /api/webhook/tradingview
 * 
 * Receives trading signals from TradingView alerts
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  
  try {
    // Rate limiting is now handled by middleware.ts
    
    logger.info({ ip, userAgent: request.headers.get('user-agent')?.substring(0, 50) }, 'TradingView webhook received');
    
    // Get raw body for signature validation
    const rawBody = await request.text();
    const signature = request.headers.get('X-TradingView-Signature');
    
    // Validate signature (if secret is configured)
    if (process.env.TRADINGVIEW_WEBHOOK_SECRET) {
      if (!validateSignature(rawBody, signature)) {
        logger.warn({ ip, signature: signature?.substring(0, 20) }, 'TradingView webhook: invalid signature');
        await logWebhook({
          status: 'REJECTED',
          parseError: 'Invalid signature',
          ipAddress: ip,
          rawPayload: rawBody.substring(0, 500),
        });
        
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }
    
    // Parse JSON payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      logger.warn({ ip, error: 'Invalid JSON' }, 'TradingView webhook parse failed');
      await logWebhook({
        status: 'FAILED',
        parseError: 'Invalid JSON',
        ipAddress: ip,
        rawPayload: rawBody.substring(0, 500),
      });
      
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    
    // Validate payload structure with Zod
    const validation = validateRequest(TradingViewWebhookSchema, payload);
    if (!validation.success) {
      logger.warn({ error: validation.details, ip }, 'TradingView webhook: Zod validation failed');
      await logWebhook({
        status: 'FAILED',
        parseError: JSON.stringify(validation.details),
        ipAddress: ip,
        rawPayload: rawBody.substring(0, 500),
      });
      
      return NextResponse.json(
        validationErrorResponse(validation.details),
        { status: 400 }
      );
    }
    
    // Use validated data
    const validatedPayload = validation.data;
    
    // Extract user from API key (if provided)
    const apiKey = request.headers.get('X-API-Key');
    let userId: string | undefined;
    
    if (apiKey) {
      const user = await db.user.findFirst({
        where: { apiKey },
      });
      userId = user?.id;
    }
    
    // Log webhook
    const webhookLog = await logWebhook({
      status: 'RECEIVED',
      symbol: validatedPayload.symbol,
      action: validatedPayload.action,
      direction: validatedPayload.direction,
      price: validatedPayload.price,
      stopLoss: validatedPayload.stopLoss,
      takeProfit: validatedPayload.takeProfit,
      takeProfits: validatedPayload.takeProfits,
      leverage: validatedPayload.leverage,
      ipAddress: ip,
      rawPayload: rawBody.substring(0, 5000),
      userId,
    });
    
    logger.info({ webhookId: webhookLog.id, symbol: validatedPayload.symbol, action: validatedPayload.action }, 'TradingView webhook validated');
    
    // Process signal (execute trade)
    try {
      // Import trade execution logic
      const { executeTradingViewSignal } = await import('@/lib/tradingview-parser');
      
      const result = await executeTradingViewSignal({
        payload: validatedPayload,
        userId,
      });
      
      if (result.success) {
        // Update webhook log with success
        await db.tradingViewWebhookLog.update({
          where: { id: webhookLog.id },
          data: {
            status: 'EXECUTED',
            tradeId: result.tradeId,
            processedAt: new Date(),
          },
        });
        
        logger.info({ webhookId: webhookLog.id, tradeId: result.tradeId }, 'TradingView signal executed');
        
        return NextResponse.json({
          success: true,
          message: 'Signal executed successfully',
          tradeId: result.tradeId,
          webhookId: webhookLog.id,
        });
      } else {
        await db.tradingViewWebhookLog.update({
          where: { id: webhookLog.id },
          data: {
            status: 'FAILED',
            errorMessage: result.error,
          },
        });
        
        logger.warn({ webhookId: webhookLog.id, error: result.error }, 'TradingView signal execution failed');
        
        return NextResponse.json(
          { error: 'Signal execution failed', details: result.error },
          { status: 400 }
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await db.tradingViewWebhookLog.update({
        where: { id: webhookLog.id },
        data: {
          status: 'FAILED',
          errorMessage,
        },
      });
      
      logger.error(error, 'TradingView signal execution error');
      
      return NextResponse.json(
        { error: 'Internal server error', details: errorMessage },
        { status: 500 }
      );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(error, 'TradingView webhook error', { duration, ip });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Log webhook request to database
 */
async function logWebhook(data: {
  status: string;
  symbol?: string;
  action?: string;
  direction?: string;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  takeProfits?: string;
  leverage?: number;
  parseError?: string;
  errorMessage?: string;
  tradeId?: string;
  ipAddress?: string;
  rawPayload?: string;
  userId?: string;
}) {
  return db.tradingViewWebhookLog.create({
    data: {
      status: data.status,
      symbol: data.symbol,
      action: data.action,
      direction: data.direction,
      price: data.price,
      stopLoss: data.stopLoss,
      takeProfit: data.takeProfit,
      takeProfits: data.takeProfits,
      leverage: data.leverage,
      parseError: data.parseError,
      errorMessage: data.errorMessage,
      tradeId: data.tradeId,
      ipAddress: data.ipAddress,
      rawPayload: data.rawPayload || '',
      userId: data.userId,
    },
  });
}

/**
 * GET /api/webhook/tradingview
 * 
 * Get webhook logs (for debugging)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    
    const where: any = {};
    if (status) {
      where.status = status;
    }
    
    const logs = await db.tradingViewWebhookLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    
    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
    });
  } catch (error) {
    logger.error(error, 'TradingView webhook GET error');
    return NextResponse.json(
      { error: 'Failed to fetch webhook logs' },
      { status: 500 }
    );
  }
}

/**
 * Signal Confirmation Endpoint
 * 
 * POST /api/signals/[id]/confirm
 * 
 * Handles confirmation responses from external webhooks
 * Used for the confirmation workflow feature
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: signalId } = params;
  
  try {
    const body = await request.json();
    const { confirmed, token, reason, metadata } = body;
    
    // Verify confirmation token if provided
    if (token) {
      const valid = await verifyConfirmToken(signalId, token);
      if (!valid) {
        logger.warn({ signalId, token }, 'Invalid confirmation token');
        return NextResponse.json({ error: 'Invalid confirmation token' }, { status: 401 });
      }
    }
    
    // Get the signal
    const signal = await db.signal.findUnique({
      where: { id: signalId },
      include: { position: true },
    });
    
    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }
    
    if (confirmed) {
      // Update signal status to ready for execution
      await db.signal.update({
        where: { id: signalId },
        data: {
          status: 'ACTIVE',
          processedAt: new Date(),
        },
      });
      
      logger.info({ signalId, reason, metadata }, 'Signal confirmed for execution');
      
      return NextResponse.json({
        success: true,
        message: 'Signal confirmed',
        signalId,
      });
    } else {
      // Mark signal as declined/cancelled
      await db.signal.update({
        where: { id: signalId },
        data: {
          status: 'CANCELLED',
          closeReason: 'CONFIRMATION_DENIED',
          errorMessage: reason || 'Confirmation denied by webhook',
          closedAt: new Date(),
        },
      });
      
      logger.info({ signalId, reason }, 'Signal confirmation denied');
      
      return NextResponse.json({
        success: true,
        message: 'Signal confirmation denied',
        signalId,
        reason,
      });
    }
    
  } catch (error) {
    logger.error(error, 'Signal confirmation endpoint error');
    return NextResponse.json(
      { error: 'Failed to process confirmation', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Verify confirmation token
 * In production, this should use a secure token store
 */
async function verifyConfirmToken(signalId: string, token: string): Promise<boolean> {
  // Simplified: in production, store tokens in Redis/database with expiry
  return /^[a-f0-9-]{36}$/.test(token);
}

// GET endpoint for checking confirmation status
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: signalId } = params;
  
  try {
    const signal = await db.signal.findUnique({
      where: { id: signalId },
      select: {
        id: true,
        status: true,
        symbol: true,
        direction: true,
        entryPrices: true,
        stopLoss: true,
        takeProfits: true,
        processedAt: true,
        closedAt: true,
        closeReason: true,
      },
    });
    
    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }
    
    return NextResponse.json({
      signalId: signal.id,
      status: signal.status,
      symbol: signal.symbol,
      direction: signal.direction,
      confirmed: signal.status === 'ACTIVE',
      processedAt: signal.processedAt,
      closeReason: signal.closeReason,
    });
    
  } catch (error) {
    logger.error(error, 'Get signal status error');
    return NextResponse.json(
      { error: 'Failed to fetch signal status' },
      { status: 500 }
    );
  }
}

/**
 * WebSocket API Route
 * 
 * Handles WebSocket connections for real-time updates
 * 
 * @route /api/ws
 */

import { NextRequest } from 'next/server';
import { getWebSocketServer } from '@/lib/websocket/server';
import { logger } from '@/lib/logger';

// WebSocket server instance
let wsServer: ReturnType<typeof getWebSocketServer> | null = null;

/**
 * GET /api/ws
 * 
 * Get WebSocket server status
 */
export async function GET(request: NextRequest) {
  try {
    if (!wsServer) {
      wsServer = getWebSocketServer();
    }

    const stats = wsServer.getStats();

    return Response.json({
      success: true,
      stats: {
        connected: stats.connectedClients,
        authenticated: stats.authenticatedClients,
        running: wsServer.isServerRunning(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'WebSocket status error');
    return Response.json(
      { success: false, error: 'Failed to get WebSocket status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ws/broadcast
 * 
 * Broadcast message to all clients
 */
export async function POST(request: NextRequest) {
  try {
    if (!wsServer) {
      wsServer = getWebSocketServer();
    }

    const body = await request.json();
    const { type, payload, channel } = body;

    if (!type || !payload) {
      return Response.json(
        { success: false, error: 'Type and payload required' },
        { status: 400 }
      );
    }

    const message = {
      type,
      payload,
      timestamp: new Date(),
    };

    if (channel) {
      wsServer.broadcastToChannel(channel, message);
    } else {
      wsServer.broadcast(message);
    }

    return Response.json({
      success: true,
      message: 'Broadcast sent',
    });
  } catch (error) {
    logger.error({ error }, 'WebSocket broadcast error');
    return Response.json(
      { success: false, error: 'Failed to broadcast' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ws/user
 * 
 * Send message to specific user
 */
export async function POST(request: NextRequest) {
  try {
    if (!wsServer) {
      wsServer = getWebSocketServer();
    }

    const body = await request.json();
    const { userId, type, payload } = body;

    if (!userId || !type || !payload) {
      return Response.json(
        { success: false, error: 'UserId, type and payload required' },
        { status: 400 }
      );
    }

    const message = {
      type,
      payload,
      timestamp: new Date(),
    };

    wsServer.sendToUser(userId, message);

    return Response.json({
      success: true,
      message: 'Message sent to user',
    });
  } catch (error) {
    logger.error({ error }, 'WebSocket send to user error');
    return Response.json(
      { success: false, error: 'Failed to send message' },
      { status: 500 }
    );
  }
}

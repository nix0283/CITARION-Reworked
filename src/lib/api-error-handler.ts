/**
 * Centralized API Error Handler for Next.js Routes
 * 
 * Provides consistent error handling across all API endpoints:
 * - Structured error responses
 * - Automatic logging via Pino
 * - Safe error messages (no sensitive data leakage)
 * - HTTP status code mapping
 * 
 * Usage:
 * ```typescript
 * import { withApiHandler } from '@/lib/api-error-handler';
 * 
 * export const POST = withApiHandler(async (request: NextRequest) => {
 *   // Your handler logic
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';

// ==================== ERROR TYPES ====================

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  statusCode?: number;
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  message?: string;
  details?: unknown;
  timestamp: string;
  requestId?: string;
}

// ==================== ERROR CODES ====================

export const ERROR_CODES = {
  // Client errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',
  
  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXCHANGE_ERROR: 'EXCHANGE_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  
  // Trading-specific errors
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_ORDER: 'INVALID_ORDER',
  POSITION_NOT_FOUND: 'POSITION_NOT_FOUND',
  SIGNAL_EXECUTION_FAILED: 'SIGNAL_EXECUTION_FAILED',
} as const;

// ==================== STATUS CODE MAPPING ====================

const ERROR_STATUS_MAP: Record<string, number> = {
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.DATABASE_ERROR]: 503,
  [ERROR_CODES.EXCHANGE_ERROR]: 502,
  [ERROR_CODES.TIMEOUT_ERROR]: 504,
  [ERROR_CODES.INSUFFICIENT_BALANCE]: 400,
  [ERROR_CODES.INVALID_ORDER]: 400,
  [ERROR_CODES.POSITION_NOT_FOUND]: 404,
  [ERROR_CODES.SIGNAL_EXECUTION_FAILED]: 400,
};

// ==================== ERROR CREATION ====================

/**
 * Create a standardized API error
 */
export function createApiError(
  code: keyof typeof ERROR_CODES,
  message: string,
  details?: unknown
): ApiError {
  return {
    code,
    message,
    details,
    statusCode: ERROR_STATUS_MAP[code] || 500,
  };
}

/**
 * Create error response object
 */
export function createErrorResponse(
  error: ApiError | Error | unknown,
  requestId?: string
): ApiErrorResponse {
  const timestamp = new Date().toISOString();
  
  if (error instanceof Error) {
    return {
      error: error.name || 'Error',
      code: ERROR_CODES.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production' 
        ? 'An internal error occurred' 
        : error.message,
      details: process.env.NODE_ENV === 'development' 
        ? { stack: error.stack } 
        : undefined,
      timestamp,
      requestId,
    };
  }
  
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const apiError = error as ApiError;
    return {
      error: apiError.code,
      code: apiError.code,
      message: process.env.NODE_ENV === 'production' && apiError.statusCode >= 500
        ? 'An internal error occurred'
        : apiError.message,
      details: process.env.NODE_ENV === 'development' ? apiError.details : undefined,
      timestamp,
      requestId,
    };
  }
  
  // Fallback for unknown errors
  return {
    error: 'UNKNOWN_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : String(error),
    timestamp,
    requestId,
  };
}

// ==================== REDACTION ====================

/**
 * Redact sensitive data from error details
 */
function redactSensitiveData(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sensitiveKeys = [
    'apiKey', 'apiSecret', 'api_passphrase', 'apiUid',
    'password', 'secret', 'token', 'authorization',
    'privateKey', 'mnemonic', 'seed',
  ];
  
  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }
  
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

// ==================== MAIN HANDLER ====================

/**
 * Wrap an API handler with centralized error handling
 * 
 * @param handler - The async handler function
 * @param options - Optional configuration
 * @returns Wrapped handler with error handling
 */
export function withApiHandler<T extends NextRequest>(
  handler: (request: T, context?: any) => Promise<NextResponse>,
  options?: {
    logErrors?: boolean;
    redactDetails?: boolean;
    customErrorHandler?: (error: unknown, request: T) => Promise<NextResponse> | NextResponse;
  }
) {
  return async (request: T, context?: any): Promise<NextResponse> => {
    const requestId = request.headers.get('x-request-id') || 
                      crypto.randomUUID?.() || 
                      Date.now().toString();
    
    const startTime = Date.now();
    const method = request.method;
    const url = request.url;
    
    try {
      const response = await handler(request, context);
      const duration = Date.now() - startTime;
      
      // Log successful requests (only in debug mode to avoid spam)
      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug(
          { method, url, statusCode: response.status, duration, requestId },
          `API ${method} ${url} - ${response.status}`
        );
      }
      
      return response;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Custom error handler if provided
      if (options?.customErrorHandler) {
        try {
          const customResponse = await Promise.resolve(
            options.customErrorHandler(error, request)
          );
          return customResponse;
        } catch (customError) {
          // Fall through to default handler if custom handler fails
          logger.error(customError, 'Custom error handler failed');
        }
      }
      
      // Log the error
      if (options?.logErrors !== false) {
        const logData: Record<string, unknown> = {
          method,
          url,
          duration,
          requestId,
          userAgent: request.headers.get('user-agent')?.substring(0, 100),
        };
        
        if (options?.redactDetails !== false) {
          logData.error = redactSensitiveData(error);
        } else {
          logData.error = error;
        }
        
        // Determine log level based on error type
        const statusCode = error instanceof Error 
          ? (error as any).statusCode 
          : ERROR_STATUS_MAP[(error as ApiError)?.code] || 500;
        
        if (statusCode >= 500) {
          logger.error(logData, `API ${method} ${url} - ${statusCode}`);
        } else if (statusCode >= 400) {
          logger.warn(logData, `API ${method} ${url} - ${statusCode}`);
        } else {
          logger.info(logData, `API ${method} ${url} - ${statusCode}`);
        }
      }
      
      // Create and return error response
      const errorResponse = createErrorResponse(error, requestId);
      const statusCode = (error as ApiError)?.statusCode || 500;
      
      return NextResponse.json(errorResponse, {
        status: statusCode,
        headers: {
          'X-Request-Id': requestId,
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if error is a known API error
 */
export function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && 
         error !== null && 
         'code' in error && 
         typeof (error as ApiError).code === 'string';
}

/**
 * Get HTTP status code for an error
 */
export function getErrorStatusCode(error: unknown): number {
  if (isApiError(error) && error.statusCode) {
    return error.statusCode;
  }
  if (error instanceof Error && 'statusCode' in error) {
    return (error as any).statusCode;
  }
  return 500;
}

// ==================== EXPORTS ====================

export default {
  withApiHandler,
  createApiError,
  createErrorResponse,
  ERROR_CODES,
  isApiError,
  getErrorStatusCode,
  generateRequestId,
};

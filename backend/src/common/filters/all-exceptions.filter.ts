import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global Exception Filter
 * 
 * Catches all unhandled exceptions, logs them with structured context,
 * and returns consistent JSON error responses.
 * 
 * Features:
 * - Logs full error details (stack trace, request info) for debugging
 * - Returns sanitized error message to client (no internal details leaked)
 * - Tracks error_id for correlating client reports with server logs
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger('ExceptionFilter');

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const errorId = `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Đã xảy ra lỗi hệ thống';
        let errorDetail: string | undefined;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exResponse = exception.getResponse();
            message = typeof exResponse === 'string'
                ? exResponse
                : (exResponse as Record<string, unknown>).message as string || exception.message;

            // Don't log 4xx as errors (they're client mistakes, not server errors)
            if (status >= 500) {
                this.logger.error(
                    `[${errorId}] ${request.method} ${request.url} → ${status}`,
                    exception.stack,
                );
            } else {
                this.logger.warn(
                    `[${errorId}] ${request.method} ${request.url} → ${status}: ${message}`,
                );
            }
        } else {
            // Unknown error — always log with full context
            const err = exception instanceof Error ? exception : new Error(String(exception));
            errorDetail = err.message;

            this.logger.error(
                `[${errorId}] UNHANDLED ${request.method} ${request.url}`,
                err.stack,
                JSON.stringify({
                    body: request.body,
                    query: request.query,
                    params: request.params,
                    user: (request as any).user?.id,
                    ip: request.ip,
                }),
            );
        }

        // Sanitized response — never expose stack traces or internal details
        const responseBody: Record<string, unknown> = {
            success: false,
            error: status >= 500 ? 'Đã xảy ra lỗi hệ thống' : message,
            errorId,
            statusCode: status,
            timestamp: new Date().toISOString(),
        };

        // In development, include error detail for debugging
        if (process.env.NODE_ENV !== 'production' && errorDetail) {
            responseBody.debug = errorDetail;
        }

        response.status(status).json(responseBody);
    }
}

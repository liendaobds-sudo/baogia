import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Khoá bị che khi ghi log ngữ cảnh request (so khớp KHÔNG phân biệt hoa/thường, theo chuỗi con). */
const SENSITIVE_KEY_PATTERNS = [
    'password', 'pass', 'pwd', 'secret', 'token', 'authorization', 'auth',
    'apikey', 'api_key', 'key', 'credential', 'cookie', 'otp', 'refresh',
];

const isSensitiveKey = (key: string): boolean => {
    const k = key.toLowerCase();
    return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p));
};

/**
 * Che dữ liệu nhạy cảm trước khi đưa vào log (audit 2026-07-25).
 *
 * Trước đây filter log NGUYÊN `request.body`, nên một lỗi 500 ở `POST /auth/login` là đủ để
 * mật khẩu plaintext nằm trong log file/stdout. Hàm này giữ nguyên hình dạng dữ liệu (để log
 * vẫn hữu ích cho chẩn đoán) nhưng thay giá trị của các khoá nhạy cảm bằng '[REDACTED]'.
 *
 * Thuần, không mutate đầu vào; có chặn độ sâu để không đệ quy vô hạn trên payload lạ.
 */
export function redactSensitive(input: unknown, depth = 0): unknown {
    if (input == null || depth > 4) return input;
    if (Array.isArray(input)) return input.map((v) => redactSensitive(v, depth + 1));
    if (typeof input !== 'object') return input;

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        out[k] = isSensitiveKey(k) ? '[REDACTED]' : redactSensitive(v, depth + 1);
    }
    return out;
}

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
                    // Audit 2026-07-25: trước đây log NGUYÊN `request.body` ⇒ 500 tại
                    // POST /auth/login đưa mật khẩu plaintext (và token/khoá API) vào log.
                    body: redactSensitive(request.body),
                    query: redactSensitive(request.query),
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

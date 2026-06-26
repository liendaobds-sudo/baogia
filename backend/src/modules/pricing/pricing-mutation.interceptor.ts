import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Phát sự kiện 'pricing.changed' sau khi MỘT request GHI (POST/PUT/PATCH/DELETE) vào
 * route master-data giá thành công. QuoteService nghe sự kiện này để XOÁ cache giá +
 * master-data → khách không nhận giá cũ sau khi admin sửa bảng giá.
 *
 * Đặt ở tầng request nên bắt được mọi kiểu ghi (repo.save / repo.update / repo.delete /
 * raw SQL) — tránh giới hạn của TypeORM EntitySubscriber với update/delete query-based.
 */
const PRICE_PATH_SEGMENTS = [
    'pricing-tiers',
    'large-format-pricing',
    'processing-pricing',
    'processing-options',
    'materials',
    'paper-sizes',
    'print-types',
    'pricing-config',
    'setup-fees',
    'accessories',
    'binding',
    'offset', // offset master-data (machine/plate/waste/products/fees/materials)
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class PricingMutationInterceptor implements NestInterceptor {
    private readonly logger = new Logger(PricingMutationInterceptor.name);

    constructor(private readonly eventEmitter: EventEmitter2) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const method: string = req?.method || '';
        const url: string = req?.url || req?.originalUrl || '';

        const isPriceWrite =
            WRITE_METHODS.has(method) &&
            PRICE_PATH_SEGMENTS.some((seg) => url.includes(seg));

        return next.handle().pipe(
            tap(() => {
                if (isPriceWrite) {
                    this.eventEmitter.emit('pricing.changed', { url, method });
                }
            }),
        );
    }
}

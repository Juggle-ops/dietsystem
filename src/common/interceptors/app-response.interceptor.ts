import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

type StandardResponse = {
  data: unknown;
  meta: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
};

@Injectable()
export class AppResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request | undefined>();

    return next.handle().pipe(
      map((body) => {
        if (this.isAlreadyFormatted(body)) {
          return body;
        }

        const response: StandardResponse = {
          data: body ?? null,
          meta: this.buildMeta(request),
          error: null,
        };
        return response;
      }),
    );
  }

  private isAlreadyFormatted(payload: unknown): payload is StandardResponse {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    return 'data' in payload && 'error' in payload;
  }

  private buildMeta(request?: Request) {
    if (!request) {
      return null;
    }
    const requestId = (request.headers as Record<string, string | undefined>)?.[
      'x-request-id'
    ];
    const storeId = (request.headers as Record<string, string | undefined>)?.[
      'x-store-id'
    ];

    if (!requestId && !storeId) {
      return null;
    }

    return {
      requestId,
      storeId,
    };
  }
}

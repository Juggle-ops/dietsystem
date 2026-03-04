import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { HttpAdapterHost } from '@nestjs/core';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

type NormalizedError = {
  code: string;
  message: string;
  details?: unknown;
};

type ErrorResolution = {
  status: number;
  error: NormalizedError;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const { status, error } = this.resolveErrorPayload(exception);

    this.logger.error(
      {
        err: exception,
        path: request?.url,
        method: request?.method,
        status,
      },
      error.message,
    );

    const body = {
      data: null,
      meta: this.buildMeta(request),
      error,
    };

    httpAdapter.reply(response, body, status);
  }

  private resolveErrorPayload(exception: unknown): ErrorResolution {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message = this.extractMessage(response);
      return {
        status: exception.getStatus(),
        error: {
          code: exception.name,
          message,
          details: this.extractDetails(response),
        },
      };
    }

    if (isPrismaKnownError(exception)) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: {
          code: exception.code,
          message: this.prismaMessage(exception),
          details: exception.meta,
        },
      };
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: {
          code: exception.name || 'Error',
          message: exception.message,
          details:
            process.env.NODE_ENV === 'production'
              ? undefined
              : { stack: exception.stack },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'Unexpected system error',
        details: undefined,
      },
    };
  }

  private extractMessage(response: unknown) {
    if (typeof response === 'string') {
      return response;
    }
    if (
      response &&
      typeof response === 'object' &&
      'message' in response &&
      response.message
    ) {
      const message = (response as { message: unknown }).message;
      if (Array.isArray(message)) {
        return message.join('; ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return 'Request failed';
  }

  private extractDetails(response: unknown) {
    if (response && typeof response === 'object') {
      const rest = { ...(response as Record<string, unknown>) };
      delete rest.message;
      return Object.keys(rest).length ? rest : undefined;
    }
    return undefined;
  }

  private prismaMessage(exception: PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return 'Duplicate resource detected';
      case 'P2003':
        return 'Related resource missing for this operation';
      default:
        return 'Database operation failed';
    }
  }

  private buildMeta(request: Request) {
    const header = request.headers['x-request-id'];
    if (typeof header === 'string') {
      return { requestId: header };
    }
    if (Array.isArray(header) && header.length > 0) {
      return { requestId: header[0] };
    }
    return null;
  }
}

function isPrismaKnownError(
  error: unknown,
): error is PrismaClientKnownRequestError {
  return error instanceof PrismaClientKnownRequestError;
}

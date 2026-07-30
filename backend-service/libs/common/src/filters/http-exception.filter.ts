import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorDto } from '../dto/api-response.dto';
import { AuthenticatedRequest } from '../types/auth.types';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<AuthenticatedRequest>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const source =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const parsed = this.parseResponse(source, exception);

    if (status >= 500) {
      this.logger.error(
        parsed.message,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiErrorDto = {
      success: false,
      error: {
        code: parsed.code,
        message: parsed.message,
        ...(parsed.details === undefined ? {} : { details: parsed.details }),
      },
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };
    response.status(status).json(body);
  }

  private parseResponse(
    source: string | object | undefined,
    exception: unknown,
  ): { code: string; message: string; details?: unknown } {
    if (typeof source === 'string') {
      return { code: 'HTTP_ERROR', message: source };
    }
    if (source && 'message' in source) {
      const record = source as {
        message: string | string[];
        error?: string;
        [key: string]: unknown;
      };
      const { message, error, ...details } = record;
      const hasDetails = Object.keys(details).length > 0;
      return {
        code: error?.toUpperCase().replaceAll(' ', '_') ?? 'HTTP_ERROR',
        message: Array.isArray(message) ? 'Request validation failed' : message,
        ...(Array.isArray(message)
          ? { details: message }
          : hasDetails
            ? { details }
            : {}),
      };
    }
    return {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        exception instanceof Error ? exception.message : 'Unexpected error',
    };
  }
}

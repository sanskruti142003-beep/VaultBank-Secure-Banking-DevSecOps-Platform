import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  isAxiosError,
} from 'axios';
import axiosRetry from 'axios-retry';
import { CorrelationContext } from '../correlation/correlation.context';

export abstract class BaseHttpService {
  private readonly logger = new Logger(BaseHttpService.name);
  private consecutiveFailures = 0;
  private circuitOpenedAt: number | null = null;

  protected constructor(
    protected readonly http: HttpService,
    private readonly baseUrl: string,
  ) {
    axiosRetry(this.http.axiosRef, {
      retries: 3,
      retryDelay: (count) => 100 * 2 ** (count - 1),
      retryCondition: (error) =>
        axiosRetry.isNetworkError(error) ||
        (error.response?.status !== undefined && error.response.status >= 500),
    });
  }

  protected get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    return this.execute(() =>
      this.http.axiosRef.get<T>(this.url(path), this.withHeaders(config)),
    );
  }

  protected post<T>(
    path: string,
    body: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.execute(() =>
      this.http.axiosRef.post<T>(
        this.url(path),
        body,
        this.withHeaders(config),
      ),
    );
  }

  protected patch<T>(
    path: string,
    body: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.execute(() =>
      this.http.axiosRef.patch<T>(
        this.url(path),
        body,
        this.withHeaders(config),
      ),
    );
  }

  private async execute<T>(
    request: () => Promise<AxiosResponse<T>>,
  ): Promise<T> {
    this.ensureCircuitClosed();
    try {
      const response = await request();
      this.consecutiveFailures = 0;
      return response.data;
    } catch (error: unknown) {
      const dependencyStatus = this.dependencyStatus(error);
      if (dependencyStatus !== undefined && dependencyStatus < 500) {
        this.consecutiveFailures = 0;
        this.logger.warn(this.describe(error));
        throw new HttpException(
          this.dependencyMessage(error),
          dependencyStatus,
        );
      }
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= 5) {
        this.circuitOpenedAt = Date.now();
      }
      this.logger.error(this.describe(error));
      throw new ServiceUnavailableException(
        'Upstream service is temporarily unavailable',
      );
    }
  }

  private ensureCircuitClosed(): void {
    if (this.circuitOpenedAt === null) {
      return;
    }
    if (Date.now() - this.circuitOpenedAt >= 30_000) {
      this.circuitOpenedAt = null;
      this.consecutiveFailures = 0;
      return;
    }
    throw new ServiceUnavailableException('Upstream circuit breaker is open');
  }

  private withHeaders(config?: AxiosRequestConfig): AxiosRequestConfig {
    return {
      ...config,
      timeout: config?.timeout ?? 5000,
      headers: {
        ...config?.headers,
        'x-correlation-id': CorrelationContext.getId(),
      },
    };
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  private describe(error: unknown): string {
    if (isAxiosError(error)) {
      const axiosError = error as AxiosError;
      return `HTTP dependency failed: ${axiosError.message}`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private dependencyStatus(error: unknown): number | undefined {
    if (!isAxiosError(error)) {
      return undefined;
    }
    return error.response?.status;
  }

  private dependencyMessage(error: unknown): string {
    if (!isAxiosError(error)) {
      return 'Dependency request failed';
    }
    const body = error.response?.data;
    if (typeof body === 'string' && body.trim()) {
      return body;
    }
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      const envelopeError = record.error;
      if (typeof envelopeError === 'object' && envelopeError !== null) {
        const message = (envelopeError as Record<string, unknown>).message;
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
      const message = record.message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
      if (Array.isArray(message) && message.length > 0) {
        return message.join(', ');
      }
    }
    return error.response?.statusText ?? 'Dependency request failed';
  }
}

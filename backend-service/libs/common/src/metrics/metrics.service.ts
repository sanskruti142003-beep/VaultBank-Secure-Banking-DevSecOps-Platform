import { Injectable } from '@nestjs/common';

interface HttpMetricLabels {
  method: string;
  path: string;
  service: string;
  statusCode: string;
}

interface HttpMetricRecord {
  count: number;
  durationSeconds: number;
  labels: HttpMetricLabels;
}

@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly httpRequests = new Map<string, HttpMetricRecord>();

  recordHttpRequest(input: {
    durationMs: number;
    method: string;
    path: string;
    statusCode: number;
  }): void {
    const labels: HttpMetricLabels = {
      method: input.method.toUpperCase(),
      path: input.path,
      service: process.env.SERVICE_NAME ?? 'unknown-service',
      statusCode: String(input.statusCode),
    };
    const key = JSON.stringify(labels);
    const current = this.httpRequests.get(key) ?? {
      count: 0,
      durationSeconds: 0,
      labels,
    };
    current.count += 1;
    current.durationSeconds += input.durationMs / 1000;
    this.httpRequests.set(key, current);
  }

  scrape(): string {
    const service = process.env.SERVICE_NAME ?? 'unknown-service';
    const memory = process.memoryUsage();
    const lines = [
      '# HELP vaultbank_service_info Service identity for this process.',
      '# TYPE vaultbank_service_info gauge',
      `vaultbank_service_info{service="${this.escapeLabel(service)}"} 1`,
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${((Date.now() - this.startedAt) / 1000).toFixed(3)}`,
      '# HELP nodejs_heap_used_bytes Node.js heap currently used.',
      '# TYPE nodejs_heap_used_bytes gauge',
      `nodejs_heap_used_bytes ${memory.heapUsed}`,
      '# HELP nodejs_resident_memory_bytes Node.js resident set size.',
      '# TYPE nodejs_resident_memory_bytes gauge',
      `nodejs_resident_memory_bytes ${memory.rss}`,
      '# HELP http_requests_total Total HTTP requests handled.',
      '# TYPE http_requests_total counter',
    ];

    for (const metric of this.httpRequests.values()) {
      lines.push(
        `http_requests_total${this.formatLabels(metric.labels)} ${metric.count}`,
      );
    }

    lines.push(
      '# HELP http_request_duration_seconds Total HTTP request duration in seconds.',
      '# TYPE http_request_duration_seconds summary',
    );
    for (const metric of this.httpRequests.values()) {
      lines.push(
        `http_request_duration_seconds_count${this.formatLabels(metric.labels)} ${metric.count}`,
        `http_request_duration_seconds_sum${this.formatLabels(metric.labels)} ${metric.durationSeconds.toFixed(6)}`,
      );
    }

    return `${lines.join('\n')}\n`;
  }

  private formatLabels(labels: HttpMetricLabels): string {
    const pairs = Object.entries(labels).map(
      ([key, value]) => `${key}="${this.escapeLabel(value)}"`,
    );
    return `{${pairs.join(',')}}`;
  }

  private escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}

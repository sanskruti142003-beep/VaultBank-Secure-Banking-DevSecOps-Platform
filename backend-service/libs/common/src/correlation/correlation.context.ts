import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

interface CorrelationStore {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

export class CorrelationContext {
  static run<T>(correlationId: string | undefined, callback: () => T): T {
    return storage.run(
      { correlationId: correlationId?.trim() || randomUUID() },
      callback,
    );
  }

  static getId(): string {
    return storage.getStore()?.correlationId ?? randomUUID();
  }
}

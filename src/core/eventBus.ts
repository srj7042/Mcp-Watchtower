import { WatchtowerEvents } from '../models/events.js';
import { IDisposable } from '../utils/disposable.js';

export type EventCallback<T> = (data: T) => void | Promise<void>;

export class EventBus implements IDisposable {
  private listeners: Map<keyof WatchtowerEvents, Set<EventCallback<unknown>>> = new Map();

  public on<K extends keyof WatchtowerEvents>(
    event: K,
    callback: EventCallback<WatchtowerEvents[K]>
  ): IDisposable {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const typedCallback = callback as EventCallback<unknown>;
    set.add(typedCallback);

    return {
      dispose: () => {
        set?.delete(typedCallback);
      },
    };
  }

  public emit<K extends keyof WatchtowerEvents>(event: K, data: WatchtowerEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) {
      return;
    }

    for (const callback of set) {
      try {
        const result = callback(data);
        if (result instanceof Promise) {
          result.catch((err) => {
            // eslint-disable-next-line no-console
            console.error(`[EventBus] Error in async event listener for ${String(event)}:`, err);
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[EventBus] Error in sync event listener for ${String(event)}:`, err);
      }
    }
  }

  public dispose(): void {
    this.listeners.clear();
  }
}


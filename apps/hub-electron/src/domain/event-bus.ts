export type EventListener<T> = (event: T) => void;

export class EventBus<T> {
  private listeners = new Set<EventListener<T>>();

  subscribe(listener: EventListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

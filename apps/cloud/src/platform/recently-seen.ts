export class RecentlySeen {
  private readonly capacity: number;
  private readonly keys = new Set<string>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  firstSighting(key: string): boolean {
    if (this.keys.has(key)) {
      return false;
    }
    this.keys.add(key);
    if (this.keys.size > this.capacity) {
      const [oldest] = this.keys;
      if (oldest !== undefined) {
        this.keys.delete(oldest);
      }
    }
    return true;
  }
}

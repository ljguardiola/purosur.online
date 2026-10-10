interface Timer {
  delay: number;
  run: () => void;
}

export class ManualTimers {
  private timers = new Set<Timer>();

  after = (delay: number, run: () => void): (() => void) => {
    const timer: Timer = { delay, run };
    this.timers.add(timer);
    return () => {
      this.timers.delete(timer);
    };
  };

  pending(delay: number): number {
    return [...this.timers].filter((timer) => timer.delay === delay).length;
  }

  fire(delay: number): void {
    const due = [...this.timers].filter((timer) => timer.delay === delay);
    for (const timer of due) {
      this.timers.delete(timer);
      timer.run();
    }
  }
}

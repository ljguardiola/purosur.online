export function withReadsCounted<T extends object, K extends keyof T>(
  items: readonly T[],
  property: K,
) {
  let reads = 0;
  return {
    items: items.map((item) =>
      Object.defineProperty({ ...item }, property, {
        enumerable: true,
        get: () => {
          reads += 1;
          return item[property];
        },
      }),
    ),
    reads: () => reads,
    resetReads: () => {
      reads = 0;
    },
  };
}

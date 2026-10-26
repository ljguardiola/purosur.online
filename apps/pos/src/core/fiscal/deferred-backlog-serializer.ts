export type DeferredBacklogSerializer = <TResult>(run: () => Promise<TResult>) => Promise<TResult>;

export function createDeferredBacklogSerializer(): DeferredBacklogSerializer {
  let last: Promise<unknown> = Promise.resolve();
  return (run) => {
    const result = last.then(run);
    last = result.catch(() => undefined);
    return result;
  };
}

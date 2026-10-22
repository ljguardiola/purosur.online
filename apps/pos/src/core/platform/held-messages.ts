export interface HeldMessages<TMessage> {
  receive(message: TMessage): void;
  deliverTo(handle: (message: TMessage) => void): void;
}

export function createHeldMessages<TMessage>(
  takeEarly: (message: TMessage) => boolean = () => false,
): HeldMessages<TMessage> {
  const held: { message: TMessage }[] = [];
  let handler: ((message: TMessage) => void) | undefined;

  return {
    receive(message) {
      if (handler === undefined) {
        if (takeEarly(message)) {
          return;
        }
        held.push({ message });
        return;
      }
      handler(message);
    },
    deliverTo(handle) {
      for (let next = held.shift(); next !== undefined; next = held.shift()) {
        handle(next.message);
      }
      handler = handle;
    },
  };
}

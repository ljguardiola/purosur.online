export interface SignedInPerson {
  userId(): string | undefined;
  set(userId: string): void;
  clear(): void;
}

export function createSignedInPerson(): SignedInPerson {
  let current: string | undefined;
  return {
    userId: () => current,
    set: (userId) => {
      current = userId;
    },
    clear: () => {
      current = undefined;
    },
  };
}

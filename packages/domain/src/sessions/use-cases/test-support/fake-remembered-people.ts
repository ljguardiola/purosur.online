import type { RememberedPeople } from "../remembered-people.js";

export function fakeRememberedPeople(
  people: { id: string; firstName: string }[],
): RememberedPeople {
  const remembered: string[] = [];
  let lastActive: string | undefined;
  return {
    remember(userId) {
      if (!remembered.includes(userId)) {
        remembered.push(userId);
      }
    },
    markLastActive(userId) {
      lastActive = userId;
    },
    signInCandidates() {
      return people
        .filter(({ id }) => remembered.includes(id))
        .map(({ id, firstName }) => ({ id, firstName, lastActive: id === lastActive }));
    },
  };
}

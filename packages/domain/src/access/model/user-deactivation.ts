export function isUserDeactivatable(
  target: { id: string; holdsAdministratorRole: boolean },
  actorId: string,
): boolean {
  return !target.holdsAdministratorRole && target.id !== actorId;
}

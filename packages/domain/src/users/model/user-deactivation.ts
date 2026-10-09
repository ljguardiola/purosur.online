export function isUserDeactivatable(
  target: { id: string; holdsAdministratorRole: boolean; active: boolean },
  actorId: string,
): boolean {
  return target.active && !target.holdsAdministratorRole && target.id !== actorId;
}

export function isUserReactivatable(target: { active: boolean }): boolean {
  return !target.active;
}

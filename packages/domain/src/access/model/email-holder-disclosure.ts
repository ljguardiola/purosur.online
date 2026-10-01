export function isReactivationOffered(
  holder: { active: boolean; locationId: string },
  requester: { locationId: string; mayReactivateUsers: boolean },
): boolean {
  return (
    !holder.active && holder.locationId === requester.locationId && requester.mayReactivateUsers
  );
}

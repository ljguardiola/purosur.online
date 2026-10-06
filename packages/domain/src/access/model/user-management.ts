import type { RoleAccess } from "./access-increase.js";
import { grantsCapability } from "./capability-permissions.js";
import { isUserDeactivatable } from "./user-deactivation.js";

type Actor = { id: string } & RoleAccess;

export function mayEditUser(actor: Actor, target: { active: boolean }): boolean {
  return target.active && grantsCapability(actor, "manage_users");
}

export function mayRemovePasskeyOf(actorId: string, target: { id: string }): boolean {
  return target.id !== actorId;
}

export function mayRemoveUserPasskey(
  actor: Actor,
  target: { id: string; active: boolean },
): boolean {
  return (
    target.active && grantsCapability(actor, "manage_users") && mayRemovePasskeyOf(actor.id, target)
  );
}

export function mayDeactivateUser(
  actor: Actor,
  target: { id: string; isAdministrator: boolean; active: boolean },
): boolean {
  return (
    target.active &&
    grantsCapability(actor, "deactivate_users") &&
    isUserDeactivatable({ id: target.id, holdsAdministratorRole: target.isAdministrator }, actor.id)
  );
}

export function mayReactivateUser(actor: Actor, target: { active: boolean }): boolean {
  return !target.active && grantsCapability(actor, "reactivate_users");
}

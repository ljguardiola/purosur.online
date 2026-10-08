import type { RoleAccess } from "../../permissions/index.js";
import { grantsCapability } from "../../permissions/index.js";
import { isUserDeactivatable, isUserReactivatable } from "./user-deactivation.js";

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
    grantsCapability(actor, "deactivate_users") &&
    isUserDeactivatable(
      { id: target.id, holdsAdministratorRole: target.isAdministrator, active: target.active },
      actor.id,
    )
  );
}

export function mayReactivateUser(actor: Actor, target: { active: boolean }): boolean {
  return grantsCapability(actor, "reactivate_users") && isUserReactivatable(target);
}

import type { PermissionCatalogWire } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { combineCloudData } from "../platform/combine-cloud-data";
import type { fetchPermissionCatalog } from "../platform/permission-catalog-api";
import type { fetchRoles, RoleSummary } from "../platform/roles-api";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchRole, RoleDetail } from "./roles-api";

const permissionsKey = ["permissions"] as const;

const permissionsKeys = {
  roles: [...permissionsKey, "roles"] as const,
  permissionCatalog: [...permissionsKey, "permission-catalog"] as const,
  role: (id: string) => [...permissionsKey, "role", id] as const,
};

function useRolesQuery(params: { fetchRoles: typeof fetchRoles; onSessionEnded: () => void }) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<RoleSummary[]>({
    queryKey: permissionsKeys.roles,
    read: params.fetchRoles,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function usePermissionCatalogQuery(params: {
  fetchPermissionCatalog: typeof fetchPermissionCatalog;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<PermissionCatalogWire>({
    queryKey: permissionsKeys.permissionCatalog,
    read: params.fetchPermissionCatalog,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useRolesWithPermissionCatalogQuery(params: {
  fetchRoles: typeof fetchRoles;
  fetchPermissionCatalog: typeof fetchPermissionCatalog;
  onSessionEnded: () => void;
}) {
  const roles = useRolesQuery({
    fetchRoles: params.fetchRoles,
    onSessionEnded: params.onSessionEnded,
  });
  const catalog = usePermissionCatalogQuery({
    fetchPermissionCatalog: params.fetchPermissionCatalog,
    onSessionEnded: params.onSessionEnded,
  });
  return combineCloudData(roles, catalog);
}

export type RoleRead = { kind: "found"; role: RoleDetail } | { kind: "not_found" };

function readRole(
  fetchRoleById: typeof fetchRole,
  roleId: string,
): () => Promise<CloudReadOutcome<RoleRead>> {
  return async () => {
    const outcome = await fetchRoleById(roleId);
    if (outcome.kind === "ok") {
      return { kind: "ok", value: { kind: "found", role: outcome.value } };
    }
    return outcome.kind === "not_found" ? { kind: "ok", value: { kind: "not_found" } } : outcome;
  };
}

// The editor seeds its form, and whether saving asks to confirm for the assigned people, from the
// read made when it opens, so a closed editor leaves no role behind for the next opening.
export function useRoleQuery(params: {
  roleId: string;
  fetchRole: typeof fetchRole;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<RoleRead>({
    queryKey: permissionsKeys.role(params.roleId),
    read: readRole(params.fetchRole, params.roleId),
    gcTime: 0,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useReloadRole(params: {
  fetchRole: typeof fetchRole;
}): (roleId: string) => Promise<CloudReadOutcome<RoleRead>> {
  const client = useQueryClient();
  return async (roleId) => {
    void client.invalidateQueries({ queryKey: permissionsKey });
    return fetchCloudQuery(client, {
      queryKey: permissionsKeys.role(roleId),
      read: readRole(params.fetchRole, roleId),
    });
  };
}

export function useRefreshPermissions(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: permissionsKey });
}

import type { PermissionCatalogWire } from "@purosur/contracts";
import { actionsColumn, Button, dataColumn, plural, Table, useTableModel } from "@purosur/ui";
import { Copy, Lock, Pencil, Plus, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { combineCloudData } from "../platform/combine-cloud-data";
import { roleDisplayName } from "../platform/role-display-name";
import type { RoleSummary } from "../platform/roles-api";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { permissionsOf } from "./permission-catalog";
import {
  usePermissionCatalogQuery,
  useRefreshPermissions,
  useRolesQuery,
} from "./permissions-queries";
import { RoleEditorModal, type RoleEditorRequest } from "./role-editor-modal";
import type { RolesListScreenServices } from "./roles-list-services";

export type RolesListScreenProps = {
  onSessionEnded: () => void;
  services: RolesListScreenServices;
};

const NOTHING_LOADED: [RoleSummary[], PermissionCatalogWire] = [[], []];

function permissionsCellContent(role: RoleSummary, permissionCount: number) {
  return role.isAdministrator
    ? "Todos los permisos"
    : `${role.permissionKeys.length} de ${permissionCount} permisos`;
}

function columnsFor(openEditor: (request: RoleEditorRequest) => void, permissionCount: number) {
  return [
    dataColumn({
      id: "role",
      header: "Rol",
      render: (item: RoleSummary) =>
        item.isAdministrator ? (
          <span className="flex items-center gap-1.5">
            <Lock aria-hidden="true" className="size-icon-sm" />
            {roleDisplayName(item)}
          </span>
        ) : (
          roleDisplayName(item)
        ),
    }),
    dataColumn({
      id: "permissions",
      header: "Permisos",
      render: (item: RoleSummary) => permissionsCellContent(item, permissionCount),
    }),
    dataColumn({
      id: "users",
      header: "Usuarios",
      render: (item: RoleSummary) =>
        item.userCount === 0
          ? "Sin usuarios"
          : plural(item.userCount, { one: "1 usuario", other: `${item.userCount} usuarios` }),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        // Administrator included: duplicating it is how an ordinary role starts from every
        // permission in the catalog.
        (item: RoleSummary) => ({
          icon: <Copy />,
          "aria-label": `Duplicar el rol ${roleDisplayName(item)}`,
          onPress: () => openEditor({ kind: "duplicate", source: item }),
        }),
        (item: RoleSummary) =>
          item.mayEdit
            ? {
                icon: <Pencil />,
                "aria-label": `Editar el rol ${roleDisplayName(item)}`,
                onPress: () => openEditor({ kind: "edit", roleId: item.id }),
              }
            : undefined,
      ],
    }),
  ] as const;
}

export function RolesListScreen({ onSessionEnded, services }: RolesListScreenProps) {
  const { fetchRoles, fetchPermissionCatalog, roleEditorModal } = services;
  const data = combineCloudData(
    useRolesQuery({ fetchRoles, onSessionEnded }),
    usePermissionCatalogQuery({ fetchPermissionCatalog, onSessionEnded }),
  );
  const refreshPermissions = useRefreshPermissions();
  const [editorRequest, setEditorRequest] = useState<RoleEditorRequest | null>(null);

  useEffect(() => {
    if (data.status === "failed") {
      setEditorRequest((request) => (request?.kind === "new" ? request : null));
    }
  }, [data.status]);

  const [roles, catalog] = data.status === "loaded" ? data.value : NOTHING_LOADED;
  const table = useTableModel({
    items: roles,
    id: (role) => role.id,
    columns: columnsFor(setEditorRequest, permissionsOf(catalog).length),
  });

  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
          <div className="flex flex-col justify-center">
            <p className="text-text-subtle text-detail">Configuración</p>
            <ScreenTitle>Roles</ScreenTitle>
          </div>
          <Button
            variant="primary"
            icon={<Plus />}
            onPress={() => setEditorRequest({ kind: "new" })}
          >
            Nuevo rol
          </Button>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      <Table
        aria-label="Roles"
        table={table}
        {...cloudTableState(data, "los roles")}
        empty={{
          icon: <Shield />,
          title: "Todavía no hay roles",
          description: "Creá el primero para poder asignárselo a un usuario.",
          variant: "blank",
        }}
        footer={
          roles.length === 0 ? undefined : (
            <p className="text-text-subtle text-detail">
              {plural(roles.length, { one: "1 rol", other: `${roles.length} roles` })}
            </p>
          )
        }
      />
      <RoleEditorModal
        request={editorRequest}
        onClose={() => setEditorRequest(null)}
        onSaved={() => {
          setEditorRequest(null);
          void refreshPermissions();
        }}
        onSessionEnded={onSessionEnded}
        {...(roleEditorModal ? { services: roleEditorModal } : {})}
      />
    </ScreenLayout>
  );
}

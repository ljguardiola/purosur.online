import { PERMISSION_KEYS } from "@purosur/domain";
import { Button, InlineNotice, plural, Table } from "@purosur/ui";
import { Copy, Lock, Pencil, Plus, ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { roleDisplayName } from "./role-display";
import { RoleEditorModal, type RoleEditorRequest } from "./role-editor-modal";
import type { RoleSummary } from "./roles-api";
import type { RolesListScreenServices } from "./roles-list-services";
import { useSendToMyAccount } from "./send-to-my-account";

export type RolesListScreenProps = {
  onSessionEnded: () => void;
  services: RolesListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; roles: RoleSummary[] };

function permissionsCellContent(role: RoleSummary) {
  return role.isAdministrator
    ? "Todos los permisos"
    : `${role.permissionKeys.length} de ${PERMISSION_KEYS.length} permisos`;
}

function columnsFor(openEditor: (request: RoleEditorRequest) => void) {
  return [
    {
      key: "role",
      title: "Rol",
      render: (item: RoleSummary) =>
        item.isAdministrator ? (
          <span className="flex items-center gap-1.5">
            <Lock aria-hidden="true" className="size-icon-sm" />
            {roleDisplayName(item)}
          </span>
        ) : (
          roleDisplayName(item)
        ),
    },
    {
      key: "permissions",
      title: "Permisos",
      render: (item: RoleSummary) => permissionsCellContent(item),
    },
    {
      key: "users",
      title: "Usuarios",
      render: (item: RoleSummary) =>
        item.userCount === 0
          ? "Sin usuarios"
          : plural(item.userCount, { one: "1 usuario", other: `${item.userCount} usuarios` }),
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Acciones",
      actions: [
        // Administrator included: duplicating it is how an ordinary role starts from every
        // permission in the catalog.
        (item: RoleSummary) => ({
          icon: <Copy />,
          "aria-label": `Duplicar el rol ${roleDisplayName(item)}`,
          onPress: () => openEditor({ kind: "duplicate", source: item }),
        }),
        // The server refuses to edit the Administrator role regardless, so no edit action is offered.
        (item: RoleSummary) =>
          item.isAdministrator
            ? undefined
            : {
                icon: <Pencil />,
                "aria-label": `Editar el rol ${roleDisplayName(item)}`,
                onPress: () => openEditor({ kind: "edit", roleId: item.id }),
              },
      ],
    },
  ] as const;
}

export function RolesListScreen({ onSessionEnded, services }: RolesListScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const { fetchRoles, roleEditorModal } = services;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [editorRequest, setEditorRequest] = useState<RoleEditorRequest | null>(null);

  const onSessionEndedRef = useLatestRef(onSessionEnded);

  const load = useCallback(async () => {
    setList({ kind: "loading" });
    const outcome = await fetchRoles();
    if (outcome.kind === "ok") {
      setList({ kind: "loaded", roles: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchRoles, onSessionEndedRef, sendToMyAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  const roles = list.kind === "loaded" ? list.roles : [];
  const columns = columnsFor(setEditorRequest);

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
      {list.kind === "loadError" && (
        <>
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No pudimos abrir los roles"
            description="Probá de nuevo en unos minutos."
          />
          <Button variant="secondary" onPress={() => void load()}>
            Reintentar
          </Button>
        </>
      )}
      {list.kind === "rate_limited" && (
        <>
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title="Demasiadas solicitudes"
            description={retryAfterDetail(list.retryAfterSeconds)}
          />
          <Button variant="secondary" onPress={() => void load()}>
            Reintentar
          </Button>
        </>
      )}
      {(list.kind === "loading" || list.kind === "loaded") && (
        <Table
          aria-label="Roles"
          columns={columns}
          loading={list.kind === "loading" ? "initial" : false}
          rows={roles.map((role) => ({ id: role.id, item: role }))}
          footer={
            <p className="text-text-subtle text-detail">
              {plural(roles.length, { one: "1 rol", other: `${roles.length} roles` })}
            </p>
          }
        />
      )}
      <RoleEditorModal
        request={editorRequest}
        onClose={() => setEditorRequest(null)}
        onSaved={() => {
          setEditorRequest(null);
          void load();
        }}
        onSessionEnded={onSessionEnded}
        {...(roleEditorModal ? { services: roleEditorModal } : {})}
      />
    </ScreenLayout>
  );
}

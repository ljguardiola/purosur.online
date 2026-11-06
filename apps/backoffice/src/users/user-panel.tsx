import {
  Button,
  DetailPanel,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  type LoadStatus,
  Tab,
  Tabs,
} from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Pencil, UserCheck, UserX } from "lucide-react";
import { type ComponentType, Suspense, useEffect, useState } from "react";
import type { BranchUserRole } from "../platform/branch-users-api";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { combineCloudData } from "../platform/combine-cloud-data";
import type { RoleCreationModal } from "../platform/creation-parts";
import { landingPart, type PagePart, pagePartsFor } from "../platform/page-parts";
import type { CloudData } from "../platform/use-cloud-query";
import { type BackofficeAccess, canManageUsers, canSeeRolesArea } from "../shell/backoffice-access";
import { DeactivateUserModal } from "./deactivate-user-modal";
import { EditUserModal } from "./edit-user-modal";
import { ReactivateUserModal } from "./reactivate-user-modal";
import { isSameUserId } from "./same-user-id";
import { UserDataFields } from "./user-data-fields";
import type { UserPanelServices } from "./user-panel-services";
import {
  type UserRead,
  useRefreshUsers,
  useReloadUser,
  useRolesQuery,
  useUserQuery,
} from "./users-queries";

export type UserCredentialSectionsProps = {
  userId: string;
  user: { id: string; firstName: string; mayRemovePasskey: boolean } | undefined;
  dataStatus: LoadStatus;
  showsPasskeys: boolean;
  showsPin: boolean;
  onSessionEnded: () => void;
  onUserOutdated: () => void;
};

export type UserPanelProps = {
  userId: string;
  signedInUserId: string;
  access: BackofficeAccess;
  roleCreationModal: RoleCreationModal;
  onSessionEnded: () => void;
  credentialSections: ComponentType<UserCredentialSectionsProps>;
  services: UserPanelServices;
  tab?: string | undefined;
  onClose: () => void;
};

type UserPanelTab = "data" | "credentials" | "status";

const USER_PANEL_TABS: readonly PagePart<{ showsCredentials: boolean }, UserPanelTab>[] = [
  { key: "data", isVisibleTo: () => true },
  { key: "credentials", isVisibleTo: ({ showsCredentials }) => showsCredentials },
  { key: "status", isVisibleTo: () => true },
];

const UserTabLink = createLink(Tab);

const NO_ROLES: BranchUserRole[] = [];

export function UserPanel(props: UserPanelProps) {
  return canManageUsers(props.access) ? (
    <AdministratorUserPanel {...props} />
  ) : (
    <ReaderUserPanel {...props} />
  );
}

function AdministratorUserPanel(props: UserPanelProps) {
  const { userId, onSessionEnded } = props;
  const { fetchUser, fetchRoles } = props.services;
  const data = combineCloudData(
    useUserQuery({ userId, fetchUser, onSessionEnded }),
    useRolesQuery({ fetchRoles, onSessionEnded }),
  );
  const [userRead, roles] = data.status === "loaded" ? data.value : [undefined, NO_ROLES];
  return <UserPanelView {...props} data={data} userRead={userRead} roles={roles} showsPasskeys />;
}

function ReaderUserPanel(props: UserPanelProps) {
  const { userId, onSessionEnded } = props;
  const data = useUserQuery({ userId, fetchUser: props.services.fetchUser, onSessionEnded });
  return (
    <UserPanelView
      {...props}
      data={data}
      userRead={data.status === "loaded" ? data.value : undefined}
      roles={NO_ROLES}
    />
  );
}

type UserPanelViewProps = UserPanelProps & {
  data: CloudData<unknown>;
  userRead: UserRead | undefined;
  roles: BranchUserRole[];
  showsPasskeys?: boolean;
};

function UserPanelView({
  userId,
  signedInUserId,
  access,
  roleCreationModal,
  onSessionEnded,
  services,
  data,
  userRead,
  roles,
  tab,
  onClose,
  showsPasskeys = false,
  credentialSections: CredentialSections,
}: UserPanelViewProps) {
  const { fetchUser } = services;
  const refreshUsers = useRefreshUsers();
  const reloadUser = useReloadUser({ fetchUser });
  const [modalOpen, setModalOpen] = useState(false);
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);

  const user = userRead?.kind === "found" ? userRead.user : undefined;
  const notFound = userRead?.kind === "not_found";

  useEffect(() => {
    if (!user) {
      setModalOpen(false);
    }
  }, [user]);

  const isOwnAccount = isSameUserId(signedInUserId, userId);
  const showsPinSection = user ? user.mayEmitPinCode : isOwnAccount && access.mayEmitOwnPinCode;
  const showsCredentials = showsPasskeys || showsPinSection;
  const parts = pagePartsFor({ showsCredentials }, USER_PANEL_TABS);
  const selectedTab = parts.kind === "shown" ? landingPart(parts, tab) : "data";

  return (
    <>
      <DetailPanel
        open
        onClose={onClose}
        recordKey={userId}
        title={user ? user.firstName : "Usuario"}
      >
        {notFound ? (
          <InlineNotice tone="error" icon={<UserX />} title="No encontramos este usuario" />
        ) : (
          <Tabs
            label="Secciones del usuario"
            selectedTab={selectedTab}
            tabs={[
              <UserTabLink
                key="data"
                from="/people/users"
                to="/people/users"
                search={(previous) => ({ ...previous, user: userId, tab: "data" })}
                value="data"
                label="Datos"
              />,
              ...(showsCredentials
                ? [
                    <UserTabLink
                      key="credentials"
                      from="/people/users"
                      to="/people/users"
                      search={(previous) => ({ ...previous, user: userId, tab: "credentials" })}
                      value="credentials"
                      label="Passkeys y PIN"
                    />,
                  ]
                : []),
              <UserTabLink
                key="status"
                from="/people/users"
                to="/people/users"
                search={(previous) => ({ ...previous, user: userId, tab: "status" })}
                value="status"
                label="Estado"
              />,
            ]}
          >
            <div className="flex flex-col gap-4 pt-4">
              {selectedTab === "data" && (
                <>
                  <UserRecordState data={data} />
                  {user ? (
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <UserDataFields user={user} />
                      </div>
                      {user.mayEdit === true ? (
                        <Button
                          variant="secondary"
                          size="small"
                          icon={<Pencil />}
                          dataStatus={data.status}
                          onPress={() => setModalOpen(true)}
                        >
                          Editar
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
              {selectedTab === "credentials" && (
                <>
                  <UserRecordState data={data} />
                  <Suspense fallback={<LoadingPlaceholder variant="card" lines={2} />}>
                    <CredentialSections
                      userId={userId}
                      user={user}
                      dataStatus={data.status}
                      showsPasskeys={showsPasskeys}
                      showsPin={showsPinSection}
                      onSessionEnded={onSessionEnded}
                      onUserOutdated={() => void refreshUsers()}
                    />
                  </Suspense>
                </>
              )}
              {selectedTab === "status" && (
                <>
                  <UserRecordState data={data} />
                  {user ? (
                    <p className="font-semibold text-body text-text">
                      {user.active === false ? "Inactivo" : "Activo"}
                    </p>
                  ) : null}
                  {user?.mayDeactivate === true && (
                    <div className="flex flex-col gap-3">
                      <p className="text-text-subtle text-detail">
                        {`Al desactivar a ${user.firstName}, deja de poder entrar a la caja y al backoffice; su historial queda igual.`}
                      </p>
                      <div>
                        <Button
                          variant="secondary"
                          size="small"
                          destructive
                          icon={<UserX />}
                          dataStatus={data.status}
                          onPress={() => setDeactivateModalOpen(true)}
                        >
                          {`Desactivar a ${user.firstName}`}
                        </Button>
                      </div>
                    </div>
                  )}
                  {user?.mayReactivate === true && (
                    <div className="flex flex-col gap-3">
                      <p className="text-text-subtle text-detail">
                        {`Al reactivar a ${user.firstName}, vuelve a entrar a la caja y al backoffice con su misma cuenta: mismo correo, rol y passkeys.`}
                      </p>
                      <div>
                        <Button
                          variant="secondary"
                          size="small"
                          icon={<UserCheck />}
                          dataStatus={data.status}
                          onPress={() => setReactivateModalOpen(true)}
                        >
                          {`Reactivar a ${user.firstName}`}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Tabs>
        )}
      </DetailPanel>
      {user ? (
        <EditUserModal
          open={modalOpen}
          user={user}
          roles={roles}
          {...(canSeeRolesArea(access) ? { roleCreationModal } : {})}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void refreshUsers();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadUser}
          services={services}
        />
      ) : null}
      {user ? (
        <DeactivateUserModal
          open={deactivateModalOpen}
          user={user}
          onClose={() => setDeactivateModalOpen(false)}
          onDeactivated={() => {
            setDeactivateModalOpen(false);
            void refreshUsers();
            onClose();
          }}
          onVanished={() => {
            setDeactivateModalOpen(false);
            void refreshUsers();
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      ) : null}
      {user ? (
        <ReactivateUserModal
          open={reactivateModalOpen}
          user={user}
          onClose={() => setReactivateModalOpen(false)}
          onReactivated={() => {
            setReactivateModalOpen(false);
            void refreshUsers();
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      ) : null}
    </>
  );
}

function UserRecordState({ data }: { data: CloudData<unknown> }) {
  return (
    <>
      {data.status === "loading" && <LoadingPlaceholder variant="form" fields={2} />}
      {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "este usuario")} />}
    </>
  );
}

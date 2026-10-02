import {
  Button,
  EmptyState,
  IconButton,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Tag,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, Laptop, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { combineCloudData } from "../platform/combine-cloud-data";
import type { CloudData } from "../platform/use-cloud-query";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  type PasskeyList,
  type UserRead,
  useRefreshAccess,
  useReloadUser,
  useRolesQuery,
  useUserPasskeysQuery,
  useUserQuery,
} from "./access-queries";
import {
  type BackofficeAccess,
  canDeactivateUser,
  canReactivateUser,
  canResetUserPin,
} from "./backoffice-access";
import { DeactivateUserModal } from "./deactivate-user-modal";
import { EditUserModal } from "./edit-user-modal";
import type { Passkey } from "./passkey-api";
import { passkeyRowDetail } from "./passkey-row-detail";
import { ReactivateUserModal } from "./reactivate-user-modal";
import { RemoveUserPasskeyModal } from "./remove-user-passkey-modal";
import { roleDisplayName } from "./role-display";
import type { UserDetailScreenServices } from "./user-detail-services";
import { UserPinSection } from "./user-pin-section";
import type { BranchUserRole } from "./users-api";

export type UserDetailScreenProps = {
  userId: string;
  signedInUserId: string;
  access: BackofficeAccess;
  onSessionEnded: () => void;
  now?: () => Date;
  services: UserDetailScreenServices;
};

const NO_ROLES: BranchUserRole[] = [];

export function UserDetailScreen(props: UserDetailScreenProps) {
  return props.access.isAdministrator ? (
    <AdministratorUserDetail {...props} />
  ) : (
    <ReaderUserDetail {...props} />
  );
}

function AdministratorUserDetail(props: UserDetailScreenProps) {
  const { userId, onSessionEnded, now } = props;
  const { fetchUser, fetchRoles, fetchUserPasskeys } = props.services;
  const data = combineCloudData(
    useUserQuery({ userId, fetchUser, onSessionEnded }),
    useRolesQuery({ fetchRoles, onSessionEnded }),
  );
  const passkeys = useUserPasskeysQuery({
    userId,
    fetchUserPasskeys,
    now: now ?? (() => new Date()),
    onSessionEnded,
  });
  const [userRead, roles] = data.status === "loaded" ? data.value : [undefined, NO_ROLES];
  return (
    <UserDetailView {...props} data={data} userRead={userRead} roles={roles} passkeys={passkeys} />
  );
}

function ReaderUserDetail(props: UserDetailScreenProps) {
  const { userId, onSessionEnded } = props;
  const data = useUserQuery({ userId, fetchUser: props.services.fetchUser, onSessionEnded });
  return (
    <UserDetailView
      {...props}
      data={data}
      userRead={data.status === "loaded" ? data.value : undefined}
      roles={NO_ROLES}
    />
  );
}

type UserDetailViewProps = UserDetailScreenProps & {
  data: CloudData<unknown>;
  userRead: UserRead | undefined;
  roles: BranchUserRole[];
  passkeys?: CloudData<PasskeyList>;
};

function UserDetailView({
  userId,
  signedInUserId,
  access,
  onSessionEnded,
  services,
  data,
  userRead,
  roles,
  passkeys,
}: UserDetailViewProps) {
  const navigate = useNavigate();
  const { fetchUser } = services;
  const refreshAccess = useRefreshAccess();
  const reloadUser = useReloadUser({ fetchUser });
  const [removeTarget, setRemoveTarget] = useState<Passkey | null>(null);
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

  const heading = user ? user.firstName : "Usuario";
  // The cloud accepts a user id in any letter case, so the URL's id may differ in case from the
  // session's own.
  const isOwnAccount = signedInUserId.toLowerCase() === userId.toLowerCase();
  const isInactive = user?.active === false;
  const showsPinSection = user
    ? canResetUserPin(access, signedInUserId, {
        ...user,
        isAdministrator: user.role.isAdministrator,
      })
    : canResetUserPin(access, signedInUserId, { id: userId, isAdministrator: false });

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Configuración · Usuarios</p>
              <div className="flex items-center gap-3">
                <ScreenTitle>{heading}</ScreenTitle>
                {isInactive ? <Tag tone="neutral">Inactivo</Tag> : null}
              </div>
            </div>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {notFound ? (
          <>
            <InlineNotice tone="error" icon={<UserX />} title="No encontramos este usuario" />
            <Button variant="secondary" onPress={() => navigate({ to: "/users" })}>
              Volver a Usuarios
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <h2 className="flex-1 text-subheading text-text-accent">Datos</h2>
                {access.isAdministrator && !isInactive && (
                  <Button
                    variant="secondary"
                    size="small"
                    icon={<Pencil />}
                    dataStatus={data.status}
                    onPress={() => setModalOpen(true)}
                  >
                    Editar
                  </Button>
                )}
              </div>
              {data.status === "loading" && <LoadingPlaceholder variant="form" fields={2} />}
              {data.status === "failed" && (
                <LoadFailure {...cloudLoadFailure(data, "este usuario")} />
              )}
              {user ? (
                <div className="flex gap-8">
                  <div className="flex flex-col gap-1">
                    <p className="font-bold text-text-subtle text-detail">Rol</p>
                    <p className="font-semibold text-body text-text">
                      {roleDisplayName(user.role)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-bold text-text-subtle text-detail">Correo</p>
                    <p className="font-semibold text-body text-text">{user.email}</p>
                  </div>
                </div>
              ) : null}
            </div>
            {passkeys ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <h2 className="flex-1 text-subheading text-text-accent">Passkeys</h2>
                </div>
                {passkeys.status === "loading" && <LoadingPlaceholder variant="list" items={2} />}
                {passkeys.status === "failed" && (
                  <LoadFailure {...cloudLoadFailure(passkeys, "las passkeys")} />
                )}
                {passkeys.status === "loaded" &&
                  (passkeys.value.passkeys.length === 0 ? (
                    <EmptyState
                      icon={<KeyRound />}
                      title="No tiene ninguna passkey registrada."
                      variant="blank"
                    />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {passkeys.value.passkeys.map((passkey) => (
                        <li key={passkey.id} className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="inline-flex size-icon-lg shrink-0 text-text-subtle"
                          >
                            <Laptop />
                          </span>
                          <div className="flex flex-1 flex-col gap-1">
                            <p className="font-semibold text-body text-text">{passkey.name}</p>
                            <p className="text-text-subtle text-detail">
                              {passkeyRowDetail(passkey, passkeys.value.loadedAt)}
                            </p>
                          </div>
                          {user && access.isAdministrator && !isOwnAccount && !isInactive && (
                            <IconButton
                              icon={<Trash2 />}
                              aria-label={`Dar de baja la passkey «${passkey.name}»`}
                              onPress={() => setRemoveTarget(passkey)}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  ))}
              </div>
            ) : null}
            {showsPinSection ? (
              <UserPinSection
                user={user}
                dataStatus={data.status}
                onSessionEnded={onSessionEnded}
                services={services}
              />
            ) : null}
            {!user &&
              (canReactivateUser(access) || access.capabilities.includes("deactivate_users")) &&
              !isOwnAccount && (
                <div className="flex items-center justify-end">
                  <Button
                    variant="secondary"
                    size="small"
                    destructive
                    icon={<UserX />}
                    dataStatus={data.status}
                  >
                    Desactivar
                  </Button>
                </div>
              )}
            {user && !isInactive && canDeactivateUser(access, user.role) && !isOwnAccount && (
              <div className="flex items-center gap-3">
                <p className="flex-1 text-text-subtle text-detail">
                  {`Al desactivar a ${user.firstName}, deja de poder entrar a la caja y al backoffice; su historial queda igual.`}
                </p>
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
            )}
            {user && isInactive && canReactivateUser(access) && (
              <div className="flex items-center gap-3">
                <p className="flex-1 text-text-subtle text-detail">
                  {`Al reactivar a ${user.firstName}, vuelve a entrar a la caja y al backoffice con su misma cuenta: mismo correo, rol y passkeys.`}
                </p>
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
            )}
          </>
        )}
      </ScreenLayout>
      {user ? (
        <RemoveUserPasskeyModal
          target={removeTarget}
          userId={userId}
          userName={user.firstName}
          isOnlyPasskey={passkeys?.status === "loaded" && passkeys.value.passkeys.length === 1}
          onClose={() => setRemoveTarget(null)}
          onRemoved={() => {
            setRemoveTarget(null);
            void refreshAccess();
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      ) : null}
      {user ? (
        <EditUserModal
          open={modalOpen}
          user={user}
          roles={roles}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void refreshAccess();
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
            void refreshAccess();
            void navigate({ to: "/users" });
          }}
          onVanished={() => {
            setDeactivateModalOpen(false);
            void refreshAccess();
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
            void refreshAccess();
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      ) : null}
    </>
  );
}

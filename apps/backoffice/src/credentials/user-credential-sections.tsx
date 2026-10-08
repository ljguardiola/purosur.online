import {
  EmptyState,
  IconButton,
  LoadFailure,
  LoadingPlaceholder,
  type LoadStatus,
} from "@purosur/ui";
import { getRouteApi } from "@tanstack/react-router";
import { KeyRound, Laptop, Trash2 } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { useRefreshCredentials, useUserPasskeysQuery } from "./credentials-queries";
import type { Passkey } from "./passkey-list";
import { passkeyRowDetail } from "./passkey-row-detail";
import { RemoveUserPasskeyModal } from "./remove-user-passkey-modal";
import type { UserCredentialSectionsServices } from "./user-credential-sections-services";
import { UserPinSection } from "./user-pin-section";

const route = getRouteApi("/signed-in/settings-area/users/$userId");

export type UserCredentialSectionsProps = {
  userId: string;
  user: { id: string; firstName: string; mayRemovePasskey: boolean } | undefined;
  dataStatus: LoadStatus;
  showsPasskeys: boolean;
  showsPin: boolean;
  onSessionEnded: () => void;
  onUserOutdated: () => void;
  now?: () => Date;
};

export function UserCredentialSections(props: UserCredentialSectionsProps) {
  const { services } = route.useRouteContext();
  const { user, dataStatus, showsPasskeys, showsPin, onSessionEnded, onUserOutdated } = props;
  return (
    <>
      {showsPasskeys ? (
        <UserPasskeysSection {...props} services={services.userCredentialSections} />
      ) : null}
      {showsPin ? (
        <UserPinSection
          user={user}
          dataStatus={dataStatus}
          onSessionEnded={onSessionEnded}
          onUserOutdated={onUserOutdated}
          services={services.userCredentialSections}
        />
      ) : null}
    </>
  );
}

function UserPasskeysSection({
  userId,
  user,
  onSessionEnded,
  onUserOutdated,
  now,
  services,
}: UserCredentialSectionsProps & { services: UserCredentialSectionsServices }) {
  const refreshCredentials = useRefreshCredentials();
  const [removeTarget, setRemoveTarget] = useState<Passkey | null>(null);
  const passkeys = useUserPasskeysQuery({
    userId,
    fetchUserPasskeys: services.fetchUserPasskeys,
    now: now ?? (() => new Date()),
    onSessionEnded,
  });

  return (
    <>
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
                  {user?.mayRemovePasskey === true && (
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
      {user ? (
        <RemoveUserPasskeyModal
          target={removeTarget}
          userId={userId}
          userName={user.firstName}
          isOnlyPasskey={passkeys.status === "loaded" && passkeys.value.passkeys.length === 1}
          onClose={() => setRemoveTarget(null)}
          onRemoved={() => {
            setRemoveTarget(null);
            void refreshCredentials();
            onUserOutdated();
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      ) : null}
    </>
  );
}

import type { Authorization, AuthorizationRefusal, SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { sortedItems, textOrder } from "@purosur/ui";
import type { RefObject } from "react";
import { useRef, useState } from "react";
import type { CoreData } from "../platform/use-core-query";
import { useCountdown } from "../platform/use-countdown";
import { useAuthorizersQuery, useResetAuthorizers } from "../sessions/sessions-queries";

export type ShownRefusal =
  | Exclude<AuthorizationRefusal, { kind: "lacks_permission" | "locked" }>
  | { kind: "lacks_permission"; userId: string | null; firstName: string | undefined }
  | {
      kind: "locked";
      userId: string | null;
      firstName: string | undefined;
      consecutiveFailures: number;
    };

export function sortedAuthorizers(users: readonly SignInUser[]): SignInUser[] {
  return sortedItems(users, {
    order: textOrder((user: SignInUser) => user.first_name),
    direction: "ascending",
  });
}

export type UseAuthorizationInput = {
  permission: AuthorizablePermissionKey;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  required: boolean;
};

export type AuthorizationState = {
  required: boolean;
  ready: boolean;
  asking: boolean;
  ask: () => void;
  cancel: () => void;
  dismiss: () => void;
  value: Authorization | undefined;
  refuse: (refusal: AuthorizationRefusal) => void;
  performed: () => void;
  authorizers: CoreData<SignInUser[]>;
  chosen: string | null;
  choose: (userId: string) => void;
  pin: string;
  secondsLeft: number;
  type: (digits: string) => void;
  refusal: ShownRefusal | undefined;
  pinInput: RefObject<HTMLInputElement | null>;
};

export function useAuthorization({
  permission,
  loadAuthorizers,
  required,
}: UseAuthorizationInput): AuthorizationState {
  const pinInput = useRef<HTMLInputElement>(null);
  const authorizers = useAuthorizersQuery({
    permission,
    read: () => loadAuthorizers(permission),
    enabled: required,
  });
  const refreshAuthorizers = useResetAuthorizers(permission);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [refusal, setRefusal] = useState<ShownRefusal>();
  const [wait, setWait] = useState<{ seconds: number }>();
  const secondsLeft = useCountdown(wait);
  const [authorizersFor, setAuthorizersFor] = useState(permission);
  const [asking, setAsking] = useState(false);

  if (authorizersFor !== permission) {
    setAuthorizersFor(permission);
    setChosen(null);
    setPin("");
    setRefusal(undefined);
    setWait(undefined);
    setAsking(false);
  }

  const offered =
    required && authorizers.status === "loaded" ? sortedAuthorizers(authorizers.value) : [];
  const chosenUser = offered.some((user) => user.id === chosen) ? chosen : (offered[0]?.id ?? null);
  const ready = !required || (chosenUser !== null && pin !== "");

  function forget() {
    setChosen(null);
    setPin("");
    setRefusal(undefined);
    setWait(undefined);
  }

  return {
    required,
    ready,
    asking,
    ask() {
      setAsking(true);
    },
    cancel() {
      forget();
      setAsking(false);
    },
    dismiss() {
      setAsking(false);
    },
    value: required && chosenUser !== null && pin !== "" ? { user_id: chosenUser, pin } : undefined,
    refuse(refused) {
      setAsking(true);
      if (refused.kind === "lacks_permission" || refused.kind === "locked") {
        const refusedUser =
          authorizers.status === "loaded"
            ? authorizers.value.find((user) => user.id === chosenUser)
            : undefined;
        setRefusal(
          refused.kind === "locked"
            ? {
                kind: "locked",
                userId: chosenUser,
                firstName: refusedUser?.first_name,
                consecutiveFailures: refused.consecutive_failures,
              }
            : { kind: "lacks_permission", userId: chosenUser, firstName: refusedUser?.first_name },
        );
        setChosen(chosenUser);
        setPin("");
        setWait(undefined);
        if (refused.kind === "lacks_permission") {
          refreshAuthorizers();
        }
        return;
      }
      setRefusal(refused);
      if (refused.kind === "wrong_pin" || refused.kind === "rate_limited") {
        setPin("");
        if (refused.retry_after_seconds > 0) {
          setWait({ seconds: refused.retry_after_seconds });
        }
      }
    },
    performed() {
      setPin("");
      setWait(undefined);
      setRefusal(undefined);
      setAsking(false);
    },
    authorizers,
    chosen: chosenUser,
    choose(userId) {
      setChosen(userId);
      setPin("");
      setWait(undefined);
      setRefusal(undefined);
    },
    pin,
    secondsLeft,
    type(digits) {
      setPin(digits);
      setRefusal(undefined);
    },
    refusal,
    pinInput,
  };
}

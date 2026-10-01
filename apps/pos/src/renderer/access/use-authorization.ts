import type { Authorization, AuthorizationRefusal, SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import type { RefObject } from "react";
import { useRef, useState } from "react";
import type { CoreData } from "../platform/use-core-query";
import { useCountdown } from "../platform/use-countdown";
import { useAuthorizersQuery, useResetAuthorizers } from "./access-queries";
import type { SignedInPerson } from "./signed-in-person";

export type ShownRefusal =
  | Exclude<AuthorizationRefusal, { kind: "lacks_permission" | "locked" }>
  | { kind: "lacks_permission"; firstName: string | undefined }
  | { kind: "locked"; firstName: string | undefined; consecutiveFailures: number };

export type UseAuthorizationInput = {
  person: SignedInPerson;
  permission: AuthorizablePermissionKey;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
} & ({ required: boolean; applies?: never } | { required?: never; applies?: boolean });

export type AuthorizationState = {
  person: SignedInPerson;
  required: boolean;
  ready: boolean;
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
  person,
  permission,
  loadAuthorizers,
  required: decided,
  applies = true,
}: UseAuthorizationInput): AuthorizationState {
  const required = decided ?? (applies && !person.permission_keys.includes(permission));
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

  if (authorizersFor !== permission) {
    setAuthorizersFor(permission);
    setChosen(null);
    setPin("");
    setRefusal(undefined);
    setWait(undefined);
  }

  const ready = !required || (chosen !== null && pin !== "");

  return {
    person,
    required,
    ready,
    value: required && chosen !== null && pin !== "" ? { user_id: chosen, pin } : undefined,
    refuse(refused) {
      if (refused.kind === "lacks_permission" || refused.kind === "locked") {
        const refusedUser =
          authorizers.status === "loaded"
            ? authorizers.value.find((user) => user.id === chosen)
            : undefined;
        setRefusal(
          refused.kind === "locked"
            ? {
                kind: "locked",
                firstName: refusedUser?.first_name,
                consecutiveFailures: refused.consecutive_failures,
              }
            : { kind: "lacks_permission", firstName: refusedUser?.first_name },
        );
        setChosen(null);
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
    },
    authorizers,
    chosen,
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

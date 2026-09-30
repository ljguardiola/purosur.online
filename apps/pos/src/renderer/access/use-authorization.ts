import type { Authorization, AuthorizationRefusal, SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { SignedInPerson } from "./signed-in-person";

type LoadedAuthorizers =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; users: SignInUser[] };

export type UseAuthorizationInput = {
  person: SignedInPerson;
  permission: AuthorizablePermissionKey;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
};

export type AuthorizationState = {
  person: SignedInPerson;
  required: boolean;
  ready: boolean;
  value: Authorization | undefined;
  refuse: (refusal: AuthorizationRefusal) => void;
  authorizers: LoadedAuthorizers;
  retryLoading: () => void;
  chosen: string | null;
  choose: (userId: string) => void;
  pin: string;
  type: (digits: string) => void;
  refusal: AuthorizationRefusal | undefined;
  pinInput: RefObject<HTMLInputElement | null>;
};

export function useAuthorization({
  person,
  permission,
  loadAuthorizers,
}: UseAuthorizationInput): AuthorizationState {
  const required = !person.permission_keys.includes(permission);
  const pinInput = useRef<HTMLInputElement>(null);
  const [authorizers, setAuthorizers] = useState<LoadedAuthorizers>({ status: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [refusal, setRefusal] = useState<AuthorizationRefusal>();

  useEffect(() => {
    if (!required || authorizers.status !== "loading") {
      return;
    }
    let current = true;
    loadAuthorizers(permission).then(
      (users) => {
        if (current) {
          setAuthorizers({ status: "loaded", users });
        }
      },
      () => {
        if (current) {
          setAuthorizers({ status: "failed" });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [required, permission, loadAuthorizers, authorizers.status]);

  const ready = !required || (chosen !== null && pin !== "");

  return {
    person,
    required,
    ready,
    value: required && chosen !== null && pin !== "" ? { user_id: chosen, pin } : undefined,
    refuse(refused) {
      setRefusal(refused);
      if (refused.kind === "wrong_pin") {
        setPin("");
      }
    },
    authorizers,
    retryLoading() {
      setAuthorizers({ status: "loading" });
    },
    chosen,
    choose(userId) {
      setChosen(userId);
      setPin("");
      setRefusal(undefined);
    },
    pin,
    type(digits) {
      setPin(digits);
      setRefusal(undefined);
    },
    refusal,
    pinInput,
  };
}

import type { startAuthentication } from "@simplewebauthn/browser";
import { useEffect, useRef, useState } from "react";
import { useAuthorization } from "./authorization-modal";
import { useSendToMyAccount } from "./send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "./session-authorization-api";

export type AuthorizedAttemptServices = {
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export type AttemptNotice<Specific extends string = never> =
  | { kind: Specific }
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type SharedOutcome =
  | { kind: "cancelled" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "authorization_required" }
  | { kind: "failed" };

function isSharedOutcome(outcome: { kind: string }): outcome is SharedOutcome {
  return [
    "cancelled",
    "unauthenticated",
    "forbidden",
    "rate_limited",
    "authorization_required",
    "failed",
  ].includes(outcome.kind);
}

type Opening<Specific extends string> = {
  current: boolean;
  showNotice: (kind: Specific) => void;
};

export function useAuthorizedAttempt<Outcome extends { kind: string }, Specific extends string>({
  open,
  actionName,
  onSessionEnded,
  services,
}: {
  open: boolean;
  actionName: string;
  onSessionEnded: () => void;
  services: AuthorizedAttemptServices;
}) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<AttemptNotice<Specific> | null>(null);
  const [running, setRunning] = useState(false);
  const { run, modal } = useAuthorization<Outcome | SharedOutcome>({
    actionName,
    onSessionEnded,
    services,
  });
  const openingRef = useRef(0);

  useEffect(() => {
    openingRef.current += 1;
    if (open) {
      setNotice(null);
      setRunning(false);
    }
  }, [open]);

  async function attempt(
    request: () => Promise<Outcome | SharedOutcome>,
    settle: (outcome: Outcome, opening: Opening<Specific>) => void,
  ) {
    setNotice(null);
    setRunning(true);
    const opening = openingRef.current;
    const outcome = await run(request);
    const current = opening === openingRef.current;
    if (current) {
      setRunning(false);
    }
    const showNotice = (shown: AttemptNotice<Specific>) => {
      if (current) {
        setNotice(shown);
      }
    };
    if (!isSharedOutcome(outcome)) {
      settle(outcome, { current, showNotice: (kind) => showNotice({ kind }) });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "rate_limited") {
      showNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind !== "cancelled") {
      showNotice({ kind: "attemptFailed" });
    }
  }

  return { attempt, running, notice, modal };
}

import type { SignInOutcome } from "@purosur/contracts";
import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useCountdown } from "../platform/use-countdown";
import type { Refusal } from "./pin-refusal";
import { noticeFor } from "./pin-refusal";

export type PinTarget = {
  id: string;
  firstName: string;
  signIn: (pin: string) => Promise<SignInOutcome>;
};

export function usePinAttempt(target: PinTarget | null) {
  const noticeId = useId();
  const pinInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const wasLocked = useRef(false);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<Refusal>();
  const [wait, setWait] = useState<{ seconds: number }>();
  const secondsLeft = useCountdown(wait);
  const locked = refusal?.kind === "locked";
  const targetId = target?.id;

  useEffect(() => {
    if (targetId !== undefined) {
      pinInput.current?.focus();
    }
  }, [targetId]);

  useEffect(() => {
    if (!submitting && refusal !== undefined) {
      pinInput.current?.focus();
    }
  }, [submitting, refusal]);

  useEffect(() => {
    if (locked !== wasLocked.current) {
      wasLocked.current = locked;
      heading.current?.focus();
    }
  }, [locked]);

  function reset() {
    setPin("");
    setRefusal(undefined);
    setWait(undefined);
  }

  function type(digits: string) {
    setPin(digits);
    if (secondsLeft === 0) {
      setRefusal(undefined);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || secondsLeft > 0 || target === null || pin === "") {
      return;
    }
    setRefusal(undefined);
    setSubmitting(true);
    const outcome = await target.signIn(pin).catch((): SignInOutcome => ({ kind: "unavailable" }));
    setSubmitting(false);
    if (outcome.kind === "unavailable") {
      setRefusal(outcome);
      return;
    }
    setPin("");
    if (outcome.kind === "locked") {
      setRefusal({
        kind: "locked",
        firstName: target.firstName,
        consecutiveFailures: outcome.consecutive_failures,
      });
    } else if (outcome.kind !== "signed_in") {
      setRefusal(outcome);
    }
    if (
      (outcome.kind === "wrong_pin" || outcome.kind === "rate_limited") &&
      outcome.retry_after_seconds > 0
    ) {
      setWait({ seconds: outcome.retry_after_seconds });
    }
  }

  const notice = refusal === undefined ? undefined : noticeFor(refusal, secondsLeft);

  return {
    pin,
    type,
    submit,
    reset,
    submitting,
    refusal,
    locked,
    secondsLeft,
    notice,
    pinRefused: notice !== undefined && refusal?.kind !== "unavailable",
    canSubmit: target !== null && pin !== "" && !submitting && secondsLeft === 0,
    noticeId,
    pinInput,
    heading,
  };
}

export type PinAttempt = ReturnType<typeof usePinAttempt>;

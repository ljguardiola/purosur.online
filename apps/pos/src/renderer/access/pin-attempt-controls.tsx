import { Button, InlineNotice } from "@purosur/ui";
import { ArrowRight } from "lucide-react";
import type { Ref } from "react";
import { PinField } from "./pin-field";
import type { PinAttempt } from "./use-pin-attempt";

export function PinAttemptControls({
  attempt,
  pinInput,
  disabled = false,
}: {
  attempt: Omit<PinAttempt, "pinInput" | "heading">;
  pinInput: Ref<HTMLInputElement>;
  disabled?: boolean;
}) {
  const { notice, noticeId } = attempt;

  return (
    <>
      <PinField
        ref={pinInput}
        value={attempt.pin}
        onChange={attempt.type}
        disabled={attempt.submitting || disabled}
        {...(attempt.pinRefused ? { errorMessageId: noticeId } : {})}
      />
      {notice === undefined ? null : (
        <div id={noticeId}>
          <InlineNotice
            tone="error"
            icon={notice.icon}
            title={notice.title}
            description={notice.description}
          />
        </div>
      )}
      <Button type="submit" fullWidth icon={<ArrowRight />} disabled={!attempt.canSubmit}>
        {attempt.secondsLeft > 0 ? `Entrar en ${attempt.secondsLeft} s` : "Entrar"}
      </Button>
    </>
  );
}

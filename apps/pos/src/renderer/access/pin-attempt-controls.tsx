import { Button, InlineNotice } from "@purosur/ui";
import { ArrowRight } from "lucide-react";
import type { Ref } from "react";
import { PinField } from "./pin-field";
import type { PinAttempt } from "./use-pin-attempt";

export function PinAttemptControls({
  attempt,
  pinInput,
  disabled = false,
  submitLabel = "Entrar",
}: {
  attempt: Omit<PinAttempt, "pinInput" | "heading">;
  pinInput: Ref<HTMLInputElement>;
  disabled?: boolean;
  submitLabel?: string;
}) {
  const { notice, noticeId } = attempt;
  const submitText =
    attempt.secondsLeft > 0 ? `${submitLabel} en ${attempt.secondsLeft} s` : submitLabel;

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
        {submitText}
      </Button>
    </>
  );
}

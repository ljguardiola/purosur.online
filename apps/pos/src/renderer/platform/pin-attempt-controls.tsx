import type { Icon } from "@purosur/ui";
import { Button, InlineNotice, PinDotsField } from "@purosur/ui";
import { ArrowRight } from "lucide-react";
import type { Ref } from "react";
import type { PinNotice } from "./pin-refusal";
import type { PinAttempt } from "./use-pin-attempt";

export function PinAttemptControls({
  attempt,
  pinInput,
  disabled = false,
  submitLabel = "Entrar",
  submitIcon,
  notice: screenNotice,
}: {
  attempt: Omit<PinAttempt, "pinInput" | "heading">;
  pinInput: Ref<HTMLInputElement>;
  disabled?: boolean;
  submitLabel?: string;
  submitIcon?: Icon;
  notice?: PinNotice | undefined;
}) {
  const { noticeId } = attempt;
  const notice = screenNotice ?? attempt.notice;
  const submitText =
    attempt.secondsLeft > 0 ? `${submitLabel} en ${attempt.secondsLeft} s` : submitLabel;

  return (
    <>
      <PinDotsField
        ref={pinInput}
        label="PIN"
        value={attempt.pin}
        onChange={attempt.type}
        autoFocus
        errorRingWhileFocused
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
      <Button
        type="submit"
        fullWidth
        icon={submitIcon ?? <ArrowRight />}
        iconPosition="start"
        keycap="Enter"
        disabled={!attempt.canSubmit}
      >
        {submitText}
      </Button>
    </>
  );
}

import type { FirstPinCodeRequestOutcome, SignInUser } from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import { KeyRound, Mail } from "lucide-react";
import { useKeys } from "../platform/key-layer";
import { useEscapeToSignIn } from "../platform/use-escape-to-sign-in";
import { BrandPanelCard } from "../shell/brand-panel-card";
import { useFirstPinCodeRequest } from "./use-first-pin-code-request";

export type FirstSignInNoPinProps = {
  person: SignInUser;
  requestCode: (userId: string) => Promise<FirstPinCodeRequestOutcome>;
  onSent: () => void;
};

export function FirstSignInNoPin({ person, requestCode, onSent }: FirstSignInNoPinProps) {
  const { ask, asking, notice } = useFirstPinCodeRequest({
    request: () => requestCode(person.id),
    onSent,
  });
  useEscapeToSignIn();
  useKeys([{ key: "Enter", run: () => void ask(), enabled: !asking }]);

  return (
    <BrandPanelCard
      icon={<KeyRound />}
      eyebrow={person.first_name}
      title="No tenés PIN todavía"
      escapeKeycap
    >
      {notice === undefined ? null : (
        <InlineNotice
          tone="error"
          icon={notice.icon}
          title={notice.title}
          description={notice.description}
        />
      )}
      <Button
        fullWidth
        icon={<Mail />}
        iconPosition="start"
        keycap="Enter"
        disabled={asking}
        onPress={ask}
      >
        Mandarme un código por correo
      </Button>
    </BrandPanelCard>
  );
}

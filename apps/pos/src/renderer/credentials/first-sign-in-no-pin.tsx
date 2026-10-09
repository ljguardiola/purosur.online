import type { FirstPinCodeRequestOutcome, SignInUser } from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import { ArrowLeft, Mail } from "lucide-react";
import { FirstSignInPanel } from "../shell/first-sign-in-panel";
import { ScreenLink } from "../shell/screen-link";
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

  return (
    <FirstSignInPanel eyebrow={person.first_name} title="No tenés PIN todavía">
      {notice === undefined ? null : (
        <InlineNotice
          tone="error"
          icon={notice.icon}
          title={notice.title}
          description={notice.description}
        />
      )}
      <Button fullWidth icon={<Mail />} disabled={asking} onPress={ask}>
        Mandarme un código por correo
      </Button>
      <ScreenLink to="/sign-in" icon={<ArrowLeft />} label="Volver" />
    </FirstSignInPanel>
  );
}

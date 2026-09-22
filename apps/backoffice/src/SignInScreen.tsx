import { LifeBuoy } from "lucide-react";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";
import { ACCOUNT_RECOVERY_PATH } from "./accessRoutes";
import { messages } from "./messages";

export function SignInScreen() {
  return (
    <AccessLayout>
      <AccessHeader
        eyebrow={messages.access.signIn.eyebrow}
        heading={messages.access.signIn.heading}
        description={messages.access.signIn.description}
      />
      <AccessFooterLink
        to={ACCOUNT_RECOVERY_PATH}
        icon={<LifeBuoy />}
        label={messages.access.signIn.recoverLink}
      />
    </AccessLayout>
  );
}

import { LifeBuoy } from "lucide-react";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";
import { RECUPERAR_PATH } from "./accessRoutes";
import { messages } from "./messages";

/** design.pen `Backoffice / Acceso · Ingresar` (L3KghW), without the "Ingresar con passkey" button (#168). */
export function IngresarScreen() {
  return (
    <AccessLayout>
      <AccessHeader
        eyebrow={messages.access.ingresar.eyebrow}
        heading={messages.access.ingresar.heading}
        description={messages.access.ingresar.description}
      />
      <AccessFooterLink
        to={RECUPERAR_PATH}
        icon={<LifeBuoy />}
        label={messages.access.ingresar.recoverLink}
      />
    </AccessLayout>
  );
}

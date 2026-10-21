import { Button, HighlightedNotice, ScreenHeader } from "@purosur/ui";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import type { EnrollmentScreenProps } from "./enrollment-screen";
import { EnrollmentScreen } from "./enrollment-screen";

export function RestoreRequiredScreen({
  registerName,
  checkCode,
  enroll,
}: EnrollmentScreenProps & { registerName: string | null }) {
  const [enrolling, setEnrolling] = useState(false);

  if (enrolling) {
    return <EnrollmentScreen checkCode={checkCode} enroll={enroll} />;
  }

  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader
          eyebrow={registerName === null ? "CAJA" : registerName.toUpperCase()}
          title="La caja tiene que volver a darse de alta"
          description="Sus datos quedaron atrás de los de la nube, así que no puede vender hasta restaurarse."
        />
        <HighlightedNotice
          tone="warning"
          icon={<KeyRound />}
          title="Pedí un código de alta"
          description="Un Administrador lo genera desde el backoffice. Las ventas guardadas en esta notebook se conservan."
        />
        <Button fullWidth onPress={() => setEnrolling(true)}>
          Dar de alta la caja
        </Button>
      </main>
    </BrandPanelScreen>
  );
}

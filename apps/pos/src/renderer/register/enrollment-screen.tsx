import type { EnrollmentOutcome } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import {
  Button,
  fieldErrorMessage,
  InlineNotice,
  ScreenHeader,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { ShieldX, TriangleAlert, WifiOff } from "lucide-react";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { retryAfterText } from "../shell/retry-after-text";
import {
  EMPTY_ENROLLMENT_FORM,
  enrollmentRequestFrom,
  enrollmentRequestSchema,
  INCOMPLETE_CODE_MESSAGE,
} from "./enrollment-form";

type Notice = { icon: Icon; title: string; description: string };

const UNAVAILABLE_NOTICE: Notice = {
  icon: <TriangleAlert />,
  title: "No se pudo dar de alta la caja",
  description: "Puro Sur no responde en este momento. Probá de nuevo en unos minutos.",
};

function noticeFor(outcome: EnrollmentOutcome): Notice | undefined {
  switch (outcome.kind) {
    case "enrolled":
    case "invalid_input":
      return undefined;
    case "code_rejected":
      return {
        icon: <ShieldX />,
        title: "El código ya no sirve",
        description:
          "Venció, ya se usó o se escribió mal varias veces. Pedí un código nuevo en el backoffice.",
      };
    case "rate_limited":
      return {
        icon: <ShieldX />,
        title: "Demasiadas solicitudes",
        description: retryAfterText(outcome.retry_after_seconds),
      };
    case "unreachable":
      return {
        icon: <WifiOff />,
        title: "No hay conexión a internet",
        description: "Revisá que esta notebook esté conectada y probá de nuevo.",
      };
    case "unavailable":
      return UNAVAILABLE_NOTICE;
    case "storage_unavailable":
      return {
        icon: <TriangleAlert />,
        title: "Esta notebook no puede guardar el alta",
        description:
          "El código no se usó. Reiniciá la notebook y probá de nuevo; si sigue igual, avisá al Administrador.",
      };
    case "not_stored":
      return {
        icon: <TriangleAlert />,
        title: "No se pudo guardar el alta en esta notebook",
        description: "El código ya se usó. Avisá al Administrador: hace falta un código nuevo.",
      };
  }
}

export type EnrollmentScreenProps = {
  checkCode: (typedCode: string) => Promise<"code"[]>;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
};

export function EnrollmentScreen({ checkCode, enroll }: EnrollmentScreenProps) {
  const [outcome, setOutcome] = useState<EnrollmentOutcome>();
  const noticeId = useId();
  const { form, submit, submitting } = useRequestForm({
    defaultValues: EMPTY_ENROLLMENT_FORM,
    request: { schema: enrollmentRequestSchema, from: enrollmentRequestFrom },
    fields: { code: "code" },
    messages: { code: INCOMPLETE_CODE_MESSAGE },
    check: ({ code }) => checkCode(code),
    onSubmit: async ({ code }, { showWireFieldError }) => {
      const answer = await enroll(code).catch((): EnrollmentOutcome => ({ kind: "unavailable" }));
      if (answer.kind === "invalid_input") {
        answer.fields.forEach(showWireFieldError);
        return;
      }
      setOutcome(answer);
    },
  });

  const notice = outcome === undefined ? undefined : noticeFor(outcome);
  const codeRejected = outcome?.kind === "code_rejected";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setOutcome(undefined);
    void submit();
  }

  return (
    <BrandPanelScreen status="Sin dar de alta">
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader
          eyebrow="NOTEBOOK NUEVA"
          title="Dar de alta esta caja"
          description="Escribí el código de alta que se genera en el backoffice, en Cajas registradoras. Vale 15 minutos y hace falta internet."
        />
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <form.AppField name="code">
            {(code) => {
              const message = fieldErrorMessage(code.state.meta.errors);
              return (
                <TextField
                  kind="plain-text"
                  label="Código de alta"
                  value={code.state.value}
                  onChange={code.handleChange}
                  {...(message === undefined && codeRejected
                    ? { errorMessageId: noticeId }
                    : { errorMessage: message })}
                />
              );
            }}
          </form.AppField>
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
          <Button type="submit" fullWidth disabled={submitting}>
            Dar de alta
          </Button>
        </form>
      </main>
    </BrandPanelScreen>
  );
}

import type { EnrollmentOutcome } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import {
  Button,
  ElevatedPanel,
  fieldErrorMessage,
  InlineNotice,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { Check, ShieldCheck, ShieldX, TriangleAlert, WifiOff } from "lucide-react";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { registerEyebrow } from "../shell/register-eyebrow";
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

type EnrollmentRequests = {
  checkCode: (typedCode: string) => Promise<"code"[]>;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
};

export function EnrollmentScreen({
  checkCode,
  enroll,
  version,
}: EnrollmentRequests & { version: string | null }) {
  return (
    <EnrollmentPanel
      eyebrow="NOTEBOOK NUEVA"
      title="Dar de alta esta caja"
      version={version}
      status="Sin dar de alta"
      checkCode={checkCode}
      enroll={enroll}
    />
  );
}

export function ReEnrollmentScreen({
  registerName,
  checkCode,
  enroll,
  onBack,
  version,
}: EnrollmentRequests & {
  registerName: string | null;
  onBack: () => void;
  version: string | null;
}) {
  return (
    <EnrollmentPanel
      eyebrow={registerEyebrow(registerName)}
      title="Dar de alta de nuevo"
      version={version}
      status="Dar de alta de nuevo"
      checkCode={checkCode}
      enroll={enroll}
      onBack={onBack}
    />
  );
}

function EnrollmentPanel({
  eyebrow,
  title,
  status,
  version,
  checkCode,
  enroll,
  onBack,
}: EnrollmentRequests & {
  eyebrow: string;
  title: string;
  status: string;
  version?: string | null;
  onBack?: () => void;
}) {
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

  useKeys([
    { key: "Enter", run: () => void submitCode() },
    { key: "Escape", run: () => onBack?.(), enabled: onBack !== undefined },
  ]);

  const notice = outcome === undefined ? undefined : noticeFor(outcome);
  const codeRejected = outcome?.kind === "code_rejected";

  function submitCode() {
    if (submitting) {
      return;
    }
    setOutcome(undefined);
    void submit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitCode();
  }

  return (
    <BrandPanelScreen status={status} version={version}>
      <main className="w-full max-w-110">
        <ElevatedPanel
          eyebrow={eyebrow}
          title={title}
          icon={<ShieldCheck />}
          {...(onBack === undefined
            ? {}
            : { escapeKey: { name: "Volver con Esc", onPress: onBack } })}
        >
          <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
            <form.AppField name="code">
              {(code) => {
                const message = fieldErrorMessage(code.state.meta.errors);
                return (
                  <TextField
                    kind="plain-text"
                    label="Código de alta"
                    placeholder="Escribí el código del backoffice"
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
            <Button
              type="submit"
              size="large"
              fullWidth
              icon={<Check />}
              iconPosition="start"
              keycap="Enter"
              disabled={submitting}
            >
              Dar de alta
            </Button>
          </form>
        </ElevatedPanel>
      </main>
    </BrandPanelScreen>
  );
}

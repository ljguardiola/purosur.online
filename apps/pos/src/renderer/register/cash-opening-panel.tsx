import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { Button, InlineNotice, SidePanel, useRequestForm } from "@purosur/ui";
import { LockOpen, TriangleAlert, UserX, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  EMPTY_OPENING_FLOAT_FORM,
  INVALID_OPENING_FLOAT_MESSAGE,
  openCashSessionRequestSchema,
  openingFloatMessage,
  openingFloatRequestFrom,
} from "./opening-float-form";

type Notice = { title: string; icon: "permission" | "failure" };

const NOT_PERMITTED: Notice = { title: "No tenés permiso para abrir la caja.", icon: "permission" };
const FAILED: Notice = { title: "No se pudo abrir la caja. Probá de nuevo.", icon: "failure" };

export type CashOpeningPanelProps = {
  firstName: string;
  canOpen: boolean;
  open: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
};

function OpeningForm({
  open,
  onCancel,
}: {
  open: CashOpeningPanelProps["open"];
  onCancel: () => void;
}) {
  const field = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>();
  const { form, submit, submitting } = useRequestForm({
    defaultValues: EMPTY_OPENING_FLOAT_FORM,
    request: { schema: openCashSessionRequestSchema, from: openingFloatRequestFrom },
    fields: { opening_float: "openingFloat" },
    messages: { openingFloat: openingFloatMessage },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await open(request.opening_float).catch(
        (): OpenCashSessionOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "invalid_opening_float":
          showFieldError("openingFloat", INVALID_OPENING_FLOAT_MESSAGE);
          break;
        case "not_permitted":
          setNotice(NOT_PERMITTED);
          break;
        case "unavailable":
          setNotice(FAILED);
          break;
        case "opened":
        case "already_open":
        case "not_signed_in":
          break;
      }
    },
  });

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setNotice(undefined);
    void submit();
  }

  return (
    <form className="flex flex-1 flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-heading font-bold text-text">Abrí la caja</h2>
        <p className="text-body text-text-subtle">
          Contá el efectivo que hay en el cajón antes de empezar.
        </p>
      </div>
      <div ref={field}>
        <form.AppField name="openingFloat" listeners={{ onChange: () => setNotice(undefined) }}>
          {(openingFloat) => (
            <openingFloat.TextField
              kind="amount"
              prefix="$"
              label="Fondo inicial"
              inputMode="numeric"
              disabled={submitting}
            />
          )}
        </form.AppField>
      </div>
      {notice === undefined ? null : (
        <InlineNotice
          tone="error"
          icon={notice.icon === "permission" ? <UserX /> : <TriangleAlert />}
          title={notice.title}
        />
      )}
      <div className="flex-1" />
      <Button type="submit" size="large" fullWidth icon={<LockOpen />} disabled={submitting}>
        Abrir la caja
      </Button>
      <Button
        variant="secondary"
        size="large"
        fullWidth
        icon={<X />}
        disabled={submitting}
        onPress={onCancel}
      >
        Cancelar
      </Button>
    </form>
  );
}

export function CashOpeningPanel({ firstName, canOpen, open }: CashOpeningPanelProps) {
  const [opening, setOpening] = useState(false);

  if (canOpen && opening) {
    return (
      <SidePanel>
        <OpeningForm open={open} onCancel={() => setOpening(false)} />
      </SidePanel>
    );
  }
  return (
    <SidePanel
      footer={
        canOpen ? (
          <>
            <p className="text-body text-text-subtle">
              Para vender, cobrar, devolver o mover efectivo, abrí la caja.
            </p>
            <Button size="large" fullWidth icon={<LockOpen />} onPress={() => setOpening(true)}>
              Abrir caja
            </Button>
          </>
        ) : undefined
      }
    >
      <h2 className="text-display font-bold text-text-accent">{firstName}</h2>
    </SidePanel>
  );
}

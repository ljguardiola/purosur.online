import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { openingFloatSchema, parseAmountCents } from "@purosur/contracts";
import { Button, InlineNotice, TextField } from "@purosur/ui";
import { LockOpen, TriangleAlert, UserX, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

const REQUIRED_MESSAGE = "Ingresá el fondo inicial.";
const INVALID_MESSAGE = "Ingresá un importe válido, por ejemplo 20.000,00.";

type Notice = { title: string; icon: "permission" | "failure" };

const NOT_PERMITTED: Notice = { title: "No tenés permiso para abrir la caja.", icon: "permission" };
const FAILED: Notice = { title: "No se pudo abrir la caja. Probá de nuevo.", icon: "failure" };

function openingFloatFrom(typed: string): { cents: number } | { message: string } {
  if (typed.trim() === "") {
    return { message: REQUIRED_MESSAGE };
  }
  const cents = parseAmountCents(typed);
  const opening = openingFloatSchema.safeParse(cents);
  return opening.success ? { cents: opening.data } : { message: INVALID_MESSAGE };
}

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
  const [typed, setTyped] = useState("");
  const [fieldMessage, setFieldMessage] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  function type(value: string) {
    setTyped(value);
    setFieldMessage(undefined);
    setNotice(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setNotice(undefined);
    const openingFloat = openingFloatFrom(typed);
    if ("message" in openingFloat) {
      setFieldMessage(openingFloat.message);
      return;
    }
    setFieldMessage(undefined);
    setSubmitting(true);
    const outcome = await open(openingFloat.cents).catch(
      (): OpenCashSessionOutcome => ({ kind: "unavailable" }),
    );
    setSubmitting(false);
    switch (outcome.kind) {
      case "invalid_opening_float":
        setFieldMessage(INVALID_MESSAGE);
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
  }

  return (
    <form className="flex flex-1 flex-col gap-4" noValidate onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-heading font-bold text-text">Abrí la caja</h2>
        <p className="text-body text-text-subtle">
          Contá el efectivo que hay en el cajón antes de empezar.
        </p>
      </div>
      <div ref={field}>
        <TextField
          kind="amount"
          prefix="$"
          label="Fondo inicial"
          inputMode="numeric"
          value={typed}
          onChange={type}
          disabled={submitting}
          errorMessage={fieldMessage}
        />
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
  const panelClassName =
    "flex h-full w-98 shrink-0 flex-col gap-4 border-l border-border bg-surface p-6";

  if (canOpen && opening) {
    return (
      <aside className={panelClassName}>
        <OpeningForm open={open} onCancel={() => setOpening(false)} />
      </aside>
    );
  }
  return (
    <aside className={panelClassName}>
      <h2 className="text-display font-bold text-text-accent">{firstName}</h2>
      {canOpen ? (
        <>
          <div className="flex-1" />
          <p className="text-body text-text-subtle">
            Para vender, cobrar, devolver o mover efectivo, abrí la caja.
          </p>
          <Button size="large" fullWidth icon={<LockOpen />} onPress={() => setOpening(true)}>
            Abrir caja
          </Button>
        </>
      ) : null}
    </aside>
  );
}

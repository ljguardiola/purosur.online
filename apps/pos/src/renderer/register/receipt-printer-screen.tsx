import type { ReadReceiptPrinterOutcome, SetReceiptPrinterOutcome } from "@purosur/contracts";
import type { ReceiptPrinterAddress } from "@purosur/domain";
import {
  Button,
  Card,
  EmptyState,
  FloatingNotification,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  ScreenHeader,
  useRequestForm,
} from "@purosur/ui";
import { House, Lock, Printer, TriangleAlert, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import type { ActionEntry } from "../shell/action-entries";
import { entriesFor } from "../shell/action-entries";
import { NavigationRail } from "../shell/navigation-rail";
import { SignOutModal } from "../shell/sign-out-modal";
import type { SignedInPerson } from "../shell/signed-in-person";
import {
  receiptPrinterAddressText,
  receiptPrinterFormFrom,
  receiptPrinterMessage,
  receiptPrinterRequestFrom,
  receiptPrinterRequestSchema,
} from "./receipt-printer-form";
import { useReceiptPrinterQuery, useRefreshReceiptPrinter } from "./register-queries";

type Notice = { title: string; icon: "permission" | "failure" };

const NO_LONGER_PERMITTED: Notice = {
  title: "Ya no tenés permiso para configurar la impresora.",
  icon: "permission",
};
const NOT_SAVED: Notice = {
  title: "No se pudo guardar la dirección. Probá de nuevo.",
  icon: "failure",
};

export type ReceiptPrinterScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  entries: readonly ActionEntry[];
  signOut: () => void;
  readReceiptPrinter: () => Promise<ReadReceiptPrinterOutcome>;
  setReceiptPrinter: (address: string) => Promise<SetReceiptPrinterOutcome>;
  onSessionInvalid: () => void;
};

type ReceiptPrinterFormProps = {
  stored: ReceiptPrinterAddress | null;
  setReceiptPrinter: ReceiptPrinterScreenProps["setReceiptPrinter"];
  onSaved: (address: ReceiptPrinterAddress) => void;
  onSessionInvalid: () => void;
};

function ReceiptPrinterForm({
  stored,
  setReceiptPrinter,
  onSaved,
  onSessionInvalid,
}: ReceiptPrinterFormProps) {
  const [notice, setNotice] = useState<Notice>();
  const { form, submit, submitting } = useRequestForm({
    defaultValues: receiptPrinterFormFrom(stored),
    request: { schema: receiptPrinterRequestSchema, from: receiptPrinterRequestFrom },
    fields: { address: "address" },
    messages: { address: receiptPrinterMessage },
    onSubmit: async ({ address }, { values, showFieldError }) => {
      const outcome = await setReceiptPrinter(address).catch(
        (): SetReceiptPrinterOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "saved":
          onSaved(outcome.address);
          break;
        case "invalid_address":
          showFieldError("address", receiptPrinterMessage(values));
          break;
        case "lacks_permission":
          setNotice(NO_LONGER_PERMITTED);
          break;
        case "not_signed_in":
          onSessionInvalid();
          break;
        case "unavailable":
          setNotice(NOT_SAVED);
          break;
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setNotice(undefined);
    void submit();
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      {stored === null ? (
        <InlineNotice tone="warning" icon={<Printer />} title="La impresora no está configurada." />
      ) : null}
      <form.AppField name="address" listeners={{ onChange: () => setNotice(undefined) }}>
        {(address) => (
          <address.TextField kind="plain-text" label="Dirección" disabled={submitting} />
        )}
      </form.AppField>
      {notice === undefined ? null : (
        <InlineNotice
          tone="error"
          icon={notice.icon === "permission" ? <UserX /> : <TriangleAlert />}
          title={notice.title}
        />
      )}
      <div className="self-start">
        <Button type="submit" dataStatus={submitting ? "loading" : "loaded"}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

export function ReceiptPrinterScreen({
  person,
  registerName,
  entries,
  signOut,
  readReceiptPrinter,
  setReceiptPrinter,
  onSessionInvalid,
}: ReceiptPrinterScreenProps) {
  const [leaving, setLeaving] = useState(false);
  const [saved, setSaved] = useState<ReceiptPrinterAddress>();
  const printer = useReceiptPrinterQuery(readReceiptPrinter);
  const refreshPrinter = useRefreshReceiptPrinter();

  const stored =
    printer.status === "loaded" && printer.value.kind === "configured"
      ? printer.value.address
      : null;

  return (
    <div className="flex h-full w-full bg-surface">
      <NavigationRail
        entries={entriesFor(entries, person.abilities)}
        current="/receipt-printer"
        home={{ label: "Inicio", icon: House, to: "/" }}
        onSignOut={() => setLeaving(true)}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-8">
        <ScreenHeader eyebrow={registerName ?? undefined} title="Impresora de tickets" />
        {printer.status === "loading" ? <LoadingPlaceholder variant="form" fields={1} /> : null}
        {printer.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo leer la dirección de la impresora"
            description="Volvé a intentarlo en unos segundos."
            onRetry={printer.retry}
          />
        ) : null}
        {printer.status === "loaded" && printer.value.kind === "lacks_permission" ? (
          <EmptyState
            variant="blank"
            icon={<Lock />}
            title="No tenés permiso para configurar la impresora"
          />
        ) : null}
        {printer.status === "loaded" && printer.value.kind === "not_signed_in" ? (
          <EmptyState
            variant="blank"
            icon={<TriangleAlert />}
            title="La sesión terminó. Volvé a ingresar para configurar la impresora"
          />
        ) : null}
        {printer.status === "loaded" &&
        (printer.value.kind === "configured" || printer.value.kind === "not_configured") ? (
          <div className="max-w-110">
            <Card>
              <ReceiptPrinterForm
                stored={stored}
                setReceiptPrinter={setReceiptPrinter}
                onSaved={(address) => {
                  setSaved(address);
                  void refreshPrinter();
                }}
                onSessionInvalid={onSessionInvalid}
              />
            </Card>
          </div>
        ) : null}
      </main>
      {saved === undefined ? null : (
        <FloatingNotification
          tone="success"
          icon={<Printer />}
          title="Dirección guardada"
          description={`La caja imprime en ${receiptPrinterAddressText(saved)} desde el próximo ticket.`}
          onDismiss={() => setSaved(undefined)}
        />
      )}
      <SignOutModal
        open={leaving}
        firstName={person.first_name}
        onClose={() => setLeaving(false)}
        onSignOut={signOut}
      />
    </div>
  );
}

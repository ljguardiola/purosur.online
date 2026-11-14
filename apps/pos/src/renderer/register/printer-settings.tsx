import type { SetReceiptPrinterOutcome } from "@purosur/contracts";
import type { ReceiptPrinterAddress } from "@purosur/domain";
import {
  EmptyState,
  Eyebrow,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  useRequestForm,
} from "@purosur/ui";
import { Lock, Printer, TriangleAlert, UserX } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { focusFirstInput } from "../platform/focus-first-input";
import type { CoreData } from "../platform/use-core-query";
import {
  receiptPrinterAddressText,
  receiptPrinterFormFrom,
  receiptPrinterMessage,
  receiptPrinterRequestFrom,
  receiptPrinterRequestSchema,
} from "./receipt-printer-form";
import type { ShownReceiptPrinter } from "./register-queries";
import { useRefreshReceiptPrinter } from "./register-queries";
import type { SettingsChrome } from "./settings-page";
import { SettingsPage, sectionArrows } from "./settings-page";
import { SaveButton, SettingsPanel } from "./settings-panel";

const TITLE = "Impresora de tickets";

type Notice = { title: string; kind: "permission" | "failure" };

const NO_LONGER_PERMITTED: Notice = {
  title: "No tenés permiso para configurar la impresora.",
  kind: "permission",
};
const NOT_SAVED: Notice = {
  title: "No se pudo guardar la dirección. Probá de nuevo.",
  kind: "failure",
};

export type PrinterSettingsProps = {
  chrome: SettingsChrome;
  onClose: () => void;
  printer: CoreData<ShownReceiptPrinter>;
  setReceiptPrinter: (address: string) => Promise<SetReceiptPrinterOutcome>;
  onSessionInvalid: () => void;
};

type PrinterFormProps = Omit<PrinterSettingsProps, "printer"> & {
  stored: ReceiptPrinterAddress | null;
  toasts: ComponentProps<typeof SettingsPage>["toasts"];
  onSaved: (address: ReceiptPrinterAddress) => void;
};

function PrinterForm({
  chrome,
  onClose,
  stored,
  toasts,
  setReceiptPrinter,
  onSaved,
  onSessionInvalid,
}: PrinterFormProps) {
  const [notice, setNotice] = useState<Notice>();
  const { form, submit, submitting, dirty, failing, reset } = useRequestForm({
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
          reset(receiptPrinterFormFrom(outcome.address));
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
  const lacksPermission = notice?.kind === "permission";

  function save() {
    if (submitting) {
      return;
    }
    setNotice(undefined);
    void submit();
  }

  const canSave = dirty && !failing && notice === undefined && !submitting;

  return (
    <SettingsPage
      chrome={chrome}
      bindings={[
        sectionArrows(chrome.moveSection),
        { key: "Enter", label: "Guardar", run: save, enabled: canSave },
      ]}
      toasts={toasts}
      aside={
        <SettingsPanel
          icon={<Printer />}
          title={TITLE}
          onClose={onClose}
          footer={<SaveButton onPress={save} disabled={lacksPermission} submitting={submitting} />}
        >
          <div ref={focusFirstInput} className="flex flex-col gap-4">
            {stored === null ? (
              <InlineNotice
                tone="warning"
                icon={<Printer />}
                title="La impresora no está configurada."
              />
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Eyebrow text="DIRECCIÓN" />
              <form.AppField name="address" listeners={{ onChange: () => setNotice(undefined) }}>
                {(address) => (
                  <address.TextField
                    kind="plain-text"
                    label="Dirección"
                    labelVisuallyHidden
                    placeholder="Dirección de la impresora"
                    disabled={lacksPermission}
                  />
                )}
              </form.AppField>
            </div>
            {notice === undefined ? null : (
              <InlineNotice
                tone="error"
                icon={notice.kind === "permission" ? <UserX /> : <TriangleAlert />}
                title={notice.title}
              />
            )}
          </div>
        </SettingsPanel>
      }
    />
  );
}

export function PrinterSettings({ printer, ...props }: PrinterSettingsProps) {
  const [saved, setSaved] = useState<ReceiptPrinterAddress>();
  const refreshPrinter = useRefreshReceiptPrinter();
  const { chrome, onClose } = props;

  const toasts =
    saved === undefined
      ? []
      : [
          {
            id: "saved",
            tone: "success" as const,
            icon: <Printer />,
            title: "Dirección guardada",
            description: `La caja imprime en ${receiptPrinterAddressText(saved)} desde el próximo ticket.`,
            onDismiss: () => setSaved(undefined),
          },
        ];

  if (printer.status === "loaded") {
    const read = printer.value;
    if (read.kind === "configured" || read.kind === "not_configured") {
      return (
        <PrinterForm
          {...props}
          stored={read.kind === "configured" ? read.address : null}
          toasts={toasts}
          onSaved={(address) => {
            setSaved(address);
            void refreshPrinter();
          }}
        />
      );
    }
  }

  return (
    <SettingsPage
      chrome={chrome}
      bindings={[sectionArrows(chrome.moveSection)]}
      toasts={toasts}
      aside={
        <SettingsPanel icon={<Printer />} title={TITLE} onClose={onClose}>
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
        </SettingsPanel>
      }
    />
  );
}

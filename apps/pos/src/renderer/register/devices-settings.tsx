import type { RegisterSerialDevicesOutcome } from "@purosur/contracts";
import {
  dataColumn,
  EmptyState,
  Eyebrow,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Select,
  StatusIndicator,
  Table,
  useRequestForm,
  useTableModel,
} from "@purosur/ui";
import { Check, Lock, TriangleAlert, Usb } from "lucide-react";
import type { ComponentProps, FocusEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import type { SerialDevicesToRegister } from "../platform/core-client";
import type { KeyBinding } from "../platform/key-layer";
import type { ShownSerialDevices } from "./register-queries";
import { useRefreshSerialDevices, useSerialDevicesQuery } from "./register-queries";
import { serialDeviceStandingIndicator } from "./serial-device-standing";
import {
  SAME_SERIAL_DEVICE_MESSAGE,
  savedSerialDevicesDescription,
  serialDeviceOptions,
  serialDevicesFormFrom,
  serialDevicesRequestFrom,
  serialDevicesRequestSchema,
} from "./serial-devices-form";
import type { SettingsChrome } from "./settings-page";
import { SettingsPage, sectionArrows } from "./settings-page";
import { SaveButton, SettingsPanel } from "./settings-panel";

const TITLE = "Balanza y lector";

type Read = Extract<ShownSerialDevices, { kind: "read" }>;
type DetectedDevice = Read["detected"][number];
type Role = "scale" | "reader";
type Toasts = ComponentProps<typeof SettingsPage>["toasts"];

type Notice = { title: string; kind: "permission" | "failure" };

const NO_LONGER_PERMITTED: Notice = {
  title: "Ya no tenés permiso para configurar la balanza y el lector.",
  kind: "permission",
};
const NOT_SAVED: Notice = {
  title: "No se pudieron guardar los dispositivos. Probá de nuevo.",
  kind: "failure",
};

const ROLE_LABELS: Record<Role, string> = { scale: "Balanza", reader: "Lector" };
const ROLES: readonly Role[] = ["scale", "reader"];

export type DevicesSettingsProps = {
  chrome: SettingsChrome;
  onClose: () => void;
  closeLabel?: string | undefined;
  readSerialDevices: Parameters<typeof useSerialDevicesQuery>[0];
  registerSerialDevices: (
    devices: SerialDevicesToRegister,
  ) => Promise<RegisterSerialDevicesOutcome>;
  onSessionInvalid: () => void;
};

type PanelProps = Pick<DevicesSettingsProps, "chrome" | "onClose" | "closeLabel">;

function registeredRoleOf(standings: Read["standings"], path: string): string {
  if (standings.scale.kind === "matching" && standings.scale.path === path) {
    return ROLE_LABELS.scale;
  }
  if (standings.reader.kind === "matching" && standings.reader.path === path) {
    return ROLE_LABELS.reader;
  }
  return "";
}

function StandingChips({ standings }: { standings: Read["standings"] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ROLES.map((role) => {
        const { tone, text } = serialDeviceStandingIndicator(role, standings[role].kind);
        return (
          <StatusIndicator key={role} tone={tone}>
            {text}
          </StatusIndicator>
        );
      })}
    </div>
  );
}

function DetectedDevices({ read }: { read: Read }) {
  const columns = [
    dataColumn({
      id: "device",
      header: "Dispositivo",
      render: (device: DetectedDevice) =>
        `${device.vendor_id}:${device.product_id} · ${device.path}`,
    }),
    dataColumn({
      id: "registered",
      header: "Registrado como",
      align: "end",
      render: (device: DetectedDevice) => registeredRoleOf(read.standings, device.path),
    }),
  ] as const;
  const table = useTableModel({ items: read.detected, id: (device) => device.path, columns });
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-4">
      <Eyebrow text="DISPOSITIVOS SERIE DETECTADOS" />
      <Table aria-label="Dispositivos serie detectados" table={table} variant="nested" />
    </div>
  );
}

function NoDeviceDetected({ chrome, onClose, closeLabel }: PanelProps) {
  return (
    <SettingsPage
      chrome={chrome}
      bindings={[sectionArrows(chrome.moveSection)]}
      aside={
        <SettingsPanel
          icon={<Usb />}
          title={TITLE}
          onClose={onClose}
          closeLabel={closeLabel}
          footer={<SaveButton onPress={() => {}} disabled />}
        >
          <Eyebrow text="DISPOSITIVOS SERIE DETECTADOS" />
          <InlineNotice
            tone="info"
            icon={<Usb />}
            title="No se detecta ningún dispositivo serie conectado."
          />
          {ROLES.map((role) => (
            <div key={role} className="flex flex-col gap-1.5">
              <Eyebrow text={ROLE_LABELS[role].toUpperCase()} />
              <Select
                name={role}
                label={ROLE_LABELS[role]}
                labelVisuallyHidden
                options={[{ value: "none", label: "Sin dispositivo" }]}
                value="none"
                onChange={() => {}}
                disabled
              />
            </div>
          ))}
        </SettingsPanel>
      }
    />
  );
}

type DevicesFormProps = PanelProps &
  Pick<DevicesSettingsProps, "registerSerialDevices" | "onSessionInvalid"> & {
    read: Read;
    toasts: Toasts;
    onSaved: (devices: Read["registered"]) => void;
  };

type Focus = { role: Role; inList: boolean } | undefined;

function isTrigger(target: EventTarget): target is HTMLElement {
  return target instanceof HTMLElement && target.getAttribute("aria-haspopup") === "listbox";
}

function DevicesForm({
  chrome,
  onClose,
  closeLabel,
  read,
  toasts,
  registerSerialDevices,
  onSaved,
  onSessionInvalid,
}: DevicesFormProps) {
  const fields = useRef<HTMLFieldSetElement>(null);
  const [focus, setFocus] = useState<Focus>();
  const [notice, setNotice] = useState<Notice>();
  const { form, submit, submitting, clearFieldError, dirty, failing, reset } = useRequestForm({
    defaultValues: serialDevicesFormFrom(read.registered),
    request: { schema: serialDevicesRequestSchema, from: serialDevicesRequestFrom },
    fields: { devices: "reader" },
    messages: { reader: SAME_SERIAL_DEVICE_MESSAGE },
    onSubmit: async ({ devices }, { showFieldError }) => {
      const outcome = await registerSerialDevices(devices).catch(
        (): RegisterSerialDevicesOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "registered":
          reset(serialDevicesFormFrom(outcome.devices));
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          onSaved(outcome.devices);
          break;
        case "same_identity_for_both":
          showFieldError("reader", SAME_SERIAL_DEVICE_MESSAGE);
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
  const canSave = dirty && !failing && notice === undefined && !submitting;

  function save() {
    if (submitting) {
      return;
    }
    setNotice(undefined);
    void submit();
  }

  function focusRole(role: Role) {
    fields.current
      ?.querySelectorAll<HTMLElement>('[aria-haspopup="listbox"]')
      [ROLES.indexOf(role)]?.focus();
  }

  function changeDevice(role: Role, pressed: string) {
    const options = serialDeviceOptions(role, read);
    const at = options.findIndex((option) => option.value === form.getFieldValue(role));
    const next = options[pressed === "ArrowUp" ? Math.max(at - 1, 0) : at + 1];
    if (next !== undefined) {
      form.setFieldValue(role, next.value);
    }
  }

  function triggers(): HTMLElement[] {
    return Array.from(
      fields.current?.querySelectorAll<HTMLElement>('[aria-haspopup="listbox"]') ?? [],
    );
  }

  function trackFocus(event: FocusEvent<HTMLElement>) {
    const role = ROLES[triggers().indexOf(event.target)];
    if (role !== undefined) {
      setFocus({ role, inList: false });
    } else {
      setFocus((previous) => previous && { ...previous, inList: true });
    }
  }

  function trackBlur(event: FocusEvent<HTMLElement>) {
    const to = event.relatedTarget;
    const staysOnFields =
      to instanceof Element &&
      (fields.current?.contains(to) === true || to.closest('[role="listbox"]') !== null);
    if (!staysOnFields) {
      setFocus(undefined);
    }
  }

  function saveFromTrigger(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" && canSave && isTrigger(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      save();
    }
  }

  const onFields = focus !== undefined && !focus.inList;
  const bindings: KeyBinding[] = [
    focus === undefined
      ? sectionArrows(chrome.moveSection)
      : {
          key: "ArrowUpDown",
          label: "Dispositivo",
          run: (pressed) => changeDevice(focus.role, pressed),
          enabled: onFields,
        },
    {
      key: "Tab",
      label: "Campo",
      run: () => focusRole(focus?.role === "scale" ? "reader" : "scale"),
      enabled: focus === undefined || onFields,
    },
    { key: "Enter", label: "Guardar", run: save, enabled: onFields && canSave },
  ];
  const lacksPermission = notice?.kind === "permission";

  return (
    <SettingsPage
      chrome={chrome}
      bindings={bindings}
      toasts={toasts}
      aside={
        <SettingsPanel
          icon={<Usb />}
          title={TITLE}
          onClose={onClose}
          closeLabel={closeLabel}
          footer={<SaveButton onPress={save} disabled={lacksPermission} submitting={submitting} />}
        >
          <StandingChips standings={read.standings} />
          <DetectedDevices read={read} />
          <fieldset
            ref={fields}
            className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0"
            onKeyDownCapture={saveFromTrigger}
            onFocus={trackFocus}
            onBlur={trackBlur}
          >
            <legend className="sr-only">Dispositivos</legend>
            <form.AppField
              name="scale"
              listeners={{
                onChange: () => {
                  setNotice(undefined);
                  clearFieldError("reader");
                },
              }}
            >
              {(scale) => (
                <div className="flex flex-col gap-1.5">
                  <Eyebrow text="BALANZA" />
                  <scale.Select
                    label="Balanza"
                    labelVisuallyHidden
                    options={serialDeviceOptions("scale", read)}
                  />
                </div>
              )}
            </form.AppField>
            <form.AppField name="reader" listeners={{ onChange: () => setNotice(undefined) }}>
              {(reader) => (
                <div className="flex flex-col gap-1.5">
                  <Eyebrow text="LECTOR" />
                  <reader.Select
                    label="Lector"
                    labelVisuallyHidden
                    options={serialDeviceOptions("reader", read)}
                  />
                </div>
              )}
            </form.AppField>
          </fieldset>
          {notice === undefined ? null : (
            <InlineNotice tone="error" icon={<TriangleAlert />} title={notice.title} />
          )}
        </SettingsPanel>
      }
    />
  );
}

export function DevicesSettings({
  readSerialDevices,
  registerSerialDevices,
  onSessionInvalid,
  ...panel
}: DevicesSettingsProps) {
  const [savedDescription, setSavedDescription] = useState<string>();
  const devices = useSerialDevicesQuery(readSerialDevices);
  const refreshDevices = useRefreshSerialDevices();
  const { chrome, onClose, closeLabel } = panel;

  const toasts =
    savedDescription === undefined
      ? []
      : [
          {
            id: "saved",
            tone: "success" as const,
            icon: <Check />,
            title: "Dispositivos guardados",
            description: savedDescription,
            onDismiss: () => setSavedDescription(undefined),
          },
        ];

  if (devices.status === "loaded" && devices.value.kind === "read") {
    const read = devices.value;
    if (read.detected.length === 0) {
      return <NoDeviceDetected {...panel} />;
    }
    return (
      <DevicesForm
        key={[...serialDeviceOptions("scale", read), ...serialDeviceOptions("reader", read)]
          .map((option) => option.value)
          .join(",")}
        {...panel}
        read={read}
        toasts={toasts}
        registerSerialDevices={registerSerialDevices}
        onSessionInvalid={onSessionInvalid}
        onSaved={(registered) => {
          setSavedDescription(savedSerialDevicesDescription(registered));
          void refreshDevices();
        }}
      />
    );
  }

  return (
    <SettingsPage
      chrome={chrome}
      bindings={[sectionArrows(chrome.moveSection)]}
      toasts={toasts}
      aside={
        <SettingsPanel icon={<Usb />} title={TITLE} onClose={onClose} closeLabel={closeLabel}>
          {devices.status === "loading" ? <LoadingPlaceholder variant="form" fields={2} /> : null}
          {devices.status === "failed" ? (
            <LoadFailure
              icon={<TriangleAlert />}
              title="No se pudieron leer los dispositivos"
              description="Volvé a intentarlo en unos segundos."
              onRetry={devices.retry}
            />
          ) : null}
          {devices.status === "loaded" && devices.value.kind === "lacks_permission" ? (
            <EmptyState
              variant="blank"
              icon={<Lock />}
              title="No tenés permiso para configurar la balanza y el lector"
            />
          ) : null}
          {devices.status === "loaded" && devices.value.kind === "not_signed_in" ? (
            <EmptyState
              variant="blank"
              icon={<TriangleAlert />}
              title="La sesión terminó. Volvé a ingresar para configurar la balanza y el lector"
            />
          ) : null}
        </SettingsPanel>
      }
    />
  );
}

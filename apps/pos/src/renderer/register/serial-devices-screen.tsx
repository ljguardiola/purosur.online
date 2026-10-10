import type { ReadSerialDevicesOutcome, RegisterSerialDevicesOutcome } from "@purosur/contracts";
import {
  Button,
  Card,
  dataColumn,
  EmptyState,
  FloatingNotification,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  ScreenHeader,
  StatusIndicator,
  Table,
  useRequestForm,
  useTableModel,
} from "@purosur/ui";
import { House, Lock, TriangleAlert, Usb, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import type { SerialDevicesToRegister } from "../platform/core-client";
import type { ActionEntry } from "../shell/action-entries";
import { entriesFor } from "../shell/action-entries";
import { NavigationRail } from "../shell/navigation-rail";
import { SignOutModal } from "../shell/sign-out-modal";
import type { SignedInPerson } from "../shell/signed-in-person";
import type { ShownSerialDevices } from "./register-queries";
import { useRefreshSerialDevices, useSerialDevicesQuery } from "./register-queries";
import { serialDeviceStandingIndicator } from "./serial-device-standing";
import {
  SAME_SERIAL_DEVICE_MESSAGE,
  serialDeviceOptions,
  serialDevicesFormFrom,
  serialDevicesRequestFrom,
  serialDevicesRequestSchema,
} from "./serial-devices-form";

type Read = Extract<ShownSerialDevices, { kind: "read" }>;
type DetectedDevice = Read["detected"][number];

type Notice = { title: string; icon: "permission" | "failure" };

const NO_LONGER_PERMITTED: Notice = {
  title: "Ya no tenés permiso para configurar la balanza y el lector.",
  icon: "permission",
};
const NOT_SAVED: Notice = {
  title: "No se pudieron guardar los dispositivos. Probá de nuevo.",
  icon: "failure",
};

export type SerialDevicesScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  entries: readonly ActionEntry[];
  signOut: () => void;
  readSerialDevices: () => Promise<ReadSerialDevicesOutcome>;
  registerSerialDevices: (
    devices: SerialDevicesToRegister,
  ) => Promise<RegisterSerialDevicesOutcome>;
  onSessionInvalid: () => void;
  onSkip?: () => void;
};

function registeredRoleOf(standings: Read["standings"], path: string): string {
  if (standings.scale.kind === "matching" && standings.scale.path === path) {
    return "Balanza";
  }
  if (standings.reader.kind === "matching" && standings.reader.path === path) {
    return "Lector";
  }
  return "—";
}

function DetectedDevicesTable({ read }: { read: Read }) {
  const columns = [
    dataColumn({
      id: "device",
      header: "Dispositivo",
      render: (device: DetectedDevice) => [device.vendor_id, device.product_id].join(":"),
    }),
    dataColumn({ id: "port", header: "Puerto", render: (device: DetectedDevice) => device.path }),
    dataColumn({
      id: "registered",
      header: "Registrado como",
      render: (device: DetectedDevice) => registeredRoleOf(read.standings, device.path),
    }),
  ] as const;
  const table = useTableModel({
    items: read.detected,
    id: (device) => device.path,
    columns,
  });
  return (
    <Table
      aria-label="Dispositivos serie detectados"
      table={table}
      empty={{
        icon: <Usb />,
        title: "No se detecta ningún dispositivo serie conectado.",
        variant: "blank",
      }}
    />
  );
}

type SerialDevicesFormProps = {
  read: Read;
  registerSerialDevices: SerialDevicesScreenProps["registerSerialDevices"];
  onSaved: () => void;
  onSessionInvalid: () => void;
};

function SerialDevicesForm({
  read,
  registerSerialDevices,
  onSaved,
  onSessionInvalid,
}: SerialDevicesFormProps) {
  const [notice, setNotice] = useState<Notice>();
  const options = serialDeviceOptions(read.detected);
  const { form, submit, submitting, clearFieldError } = useRequestForm({
    defaultValues: serialDevicesFormFrom(read.registered, read.detected),
    request: { schema: serialDevicesRequestSchema, from: serialDevicesRequestFrom },
    fields: { devices: "reader" },
    messages: { reader: SAME_SERIAL_DEVICE_MESSAGE },
    onSubmit: async ({ devices }, { showFieldError }) => {
      const outcome = await registerSerialDevices(devices).catch(
        (): RegisterSerialDevicesOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "registered":
          onSaved();
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
      <form.AppField
        name="scale"
        listeners={{
          onChange: () => {
            setNotice(undefined);
            clearFieldError("reader");
          },
        }}
      >
        {(scale) => <scale.Select label="Balanza" options={options} disabled={submitting} />}
      </form.AppField>
      <form.AppField name="reader" listeners={{ onChange: () => setNotice(undefined) }}>
        {(reader) => <reader.Select label="Lector" options={options} disabled={submitting} />}
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

function StandingIndicators({ standings }: { standings: Read["standings"] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {(["scale", "reader"] as const).map((role) => {
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

export function SerialDevicesScreen({
  person,
  registerName,
  entries,
  signOut,
  readSerialDevices,
  registerSerialDevices,
  onSessionInvalid,
  onSkip,
}: SerialDevicesScreenProps) {
  const [leaving, setLeaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const devices = useSerialDevicesQuery(readSerialDevices);
  const refreshDevices = useRefreshSerialDevices();

  const read = devices.status === "loaded" && devices.value.kind === "read" ? devices.value : null;

  return (
    <div className="flex h-full w-full bg-surface">
      <NavigationRail
        entries={entriesFor(entries, person.abilities)}
        current="/serial-devices"
        home={{ label: "Inicio", icon: House, to: "/" }}
        onSignOut={() => setLeaving(true)}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-8">
        <ScreenHeader eyebrow={registerName ?? undefined} title="Balanza y lector" />
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
        {read === null ? null : (
          <div className="flex max-w-160 flex-col gap-6">
            <StandingIndicators standings={read.standings} />
            <DetectedDevicesTable read={read} />
            {read.detected.length === 0 ? null : (
              <Card>
                <SerialDevicesForm
                  key={serialDeviceOptions(read.detected)
                    .map((option) => option.value)
                    .join(",")}
                  read={read}
                  registerSerialDevices={registerSerialDevices}
                  onSaved={() => {
                    setSaved(true);
                    void refreshDevices();
                  }}
                  onSessionInvalid={onSessionInvalid}
                />
              </Card>
            )}
          </div>
        )}
        {onSkip === undefined ? null : (
          <div className="self-start">
            <Button type="button" variant="text" onPress={onSkip}>
              Ahora no
            </Button>
          </div>
        )}
      </main>
      {saved ? (
        <FloatingNotification
          tone="success"
          icon={<Usb />}
          title="Dispositivos guardados"
          description="La caja reconoce la balanza y el lector elegidos."
          onDismiss={() => setSaved(false)}
        />
      ) : null}
      <SignOutModal
        open={leaving}
        firstName={person.first_name}
        onClose={() => setLeaving(false)}
        onSignOut={signOut}
      />
    </div>
  );
}

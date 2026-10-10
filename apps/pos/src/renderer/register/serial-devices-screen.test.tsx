import type { ReadSerialDevicesOutcome, RegisterSerialDevicesOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Usb } from "lucide-react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SerialDevicesToRegister } from "../platform/core-client";
import type { ActionEntry } from "../shell/action-entries";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { SAME_SERIAL_DEVICE_MESSAGE } from "./serial-devices-form";
import { SerialDevicesScreen } from "./serial-devices-screen";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Linus",
  abilities: ["configure_serial_devices"],
};

const DEVICES_ENTRY: ActionEntry = {
  label: "Balanza y lector",
  icon: Usb,
  ability: "configure_serial_devices",
  to: "/serial-devices",
};

const SCALE_IDENTITY = { vendor_id: "0403", product_id: "6001" };
const READER_IDENTITY = { vendor_id: "05e0", product_id: "1200" };
const DETECTED = [
  { path: "COM3", ...SCALE_IDENTITY },
  { path: "COM4", ...READER_IDENTITY },
];

const NOTHING_REGISTERED: ReadSerialDevicesOutcome = {
  kind: "read",
  registered: {},
  detected: DETECTED,
  standings: { scale: { kind: "not_registered" }, reader: { kind: "not_registered" } },
};
const BOTH_REGISTERED: ReadSerialDevicesOutcome = {
  kind: "read",
  registered: { scale: SCALE_IDENTITY, reader: READER_IDENTITY },
  detected: DETECTED,
  standings: {
    scale: { kind: "matching", path: "COM3" },
    reader: { kind: "matching", path: "COM4" },
  },
};
const REGISTERED: RegisterSerialDevicesOutcome = {
  kind: "registered",
  devices: { scale: SCALE_IDENTITY },
};

async function renderScreen({
  read = async (): Promise<ReadSerialDevicesOutcome> => NOTHING_REGISTERED,
  register = async (): Promise<RegisterSerialDevicesOutcome> => REGISTERED,
  registerName = "Caja 1",
  withSkip = false,
}: {
  read?: () => Promise<ReadSerialDevicesOutcome>;
  register?: (devices: SerialDevicesToRegister) => Promise<RegisterSerialDevicesOutcome>;
  registerName?: string | null;
  withSkip?: boolean;
} = {}) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const readSerialDevices = vi.fn(read);
  const registerSerialDevices = vi.fn(register);
  const onSessionInvalid = vi.fn();
  const onSkip = vi.fn();
  const screen = await render(
    <SerialDevicesScreen
      person={PERSON}
      registerName={registerName}
      entries={[DEVICES_ENTRY]}
      signOut={vi.fn()}
      readSerialDevices={readSerialDevices}
      registerSerialDevices={registerSerialDevices}
      onSessionInvalid={onSessionInvalid}
      {...(withSkip ? { onSkip } : {})}
    />,
  );
  return { screen, readSerialDevices, registerSerialDevices, onSessionInvalid, onSkip };
}

type Rendered = Awaited<ReturnType<typeof renderScreen>>;

async function choose(screen: Rendered["screen"], role: "Balanza" | "Lector", device: string) {
  await userEvent.click(screen.getByRole("button", { name: new RegExp(`${role}$`) }));
  await userEvent.click(screen.getByRole("option", { name: device }));
}

describe("SerialDevicesScreen", () => {
  it("is titled Balanza y lector and names the register in the eyebrow", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Balanza y lector" }))
      .toBeVisible();
    await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows a loading placeholder while the devices are read", async () => {
    const { screen } = await renderScreen({ read: () => new Promise(() => {}) });

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("fails to load when the core cannot answer, and reads again on Reintentar", async () => {
    const read = vi
      .fn<() => Promise<ReadSerialDevicesOutcome>>()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValue(NOTHING_REGISTERED);
    const { screen } = await renderScreen({ read });
    await expect.element(screen.getByText("No se pudieron leer los dispositivos")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByRole("button", { name: "Guardar" })).toBeVisible();
  });

  it("says the person may not configure the devices when the core refuses them", async () => {
    const { screen } = await renderScreen({ read: async () => ({ kind: "lacks_permission" }) });

    await expect
      .element(screen.getByText("No tenés permiso para configurar la balanza y el lector"))
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("says the session ended when the core says nobody is signed in", async () => {
    const { screen } = await renderScreen({ read: async () => ({ kind: "not_signed_in" }) });

    await expect
      .element(
        screen.getByText(
          "La sesión terminó. Volvé a ingresar para configurar la balanza y el lector",
        ),
      )
      .toBeVisible();
  });

  it("says no serial device is detected, and offers nothing to save", async () => {
    const { screen } = await renderScreen({
      read: async () => ({ ...NOTHING_REGISTERED, detected: [] }),
    });

    await expect
      .element(screen.getByText("No se detecta ningún dispositivo serie conectado."))
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("lists each detected device with its identity and port, and the role it is registered as", async () => {
    const { screen } = await renderScreen({ read: async () => BOTH_REGISTERED });

    const table = screen.getByRole("table", { name: "Dispositivos serie detectados" });
    await expect.element(table.getByRole("columnheader", { name: "Dispositivo" })).toBeVisible();
    await expect.element(table.getByRole("columnheader", { name: "Puerto" })).toBeVisible();
    await expect
      .element(table.getByRole("columnheader", { name: "Registrado como" }))
      .toBeVisible();
    await expect
      .element(table.getByRole("row", { name: /0403:6001.*COM3.*Balanza/ }))
      .toBeVisible();
    await expect.element(table.getByRole("row", { name: /05e0:1200.*COM4.*Lector/ })).toBeVisible();
  });

  it("leaves the registered role empty for a device registered as neither", async () => {
    const { screen } = await renderScreen();

    const row = screen.getByRole("row", { name: /0403:6001/ });
    await expect.element(row).toBeVisible();
    await expect.element(row.getByText("Balanza")).not.toBeInTheDocument();
    await expect.element(row.getByText("Lector")).not.toBeInTheDocument();
  });

  it("shows the standing of the scale and the reader", async () => {
    const { screen } = await renderScreen({
      read: async () => ({
        ...NOTHING_REGISTERED,
        standings: { scale: { kind: "not_detected" }, reader: { kind: "not_registered" } },
      }),
    });

    await expect.element(screen.getByText("Balanza no detectada")).toBeVisible();
    await expect.element(screen.getByText("Lector sin registrar")).toBeVisible();
  });

  it("chooses the registered devices for the scale and the reader", async () => {
    const { screen } = await renderScreen({ read: async () => BOTH_REGISTERED });

    await expect
      .element(screen.getByRole("button", { name: /Balanza$/ }).getByText("0403:6001 (COM3)"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /Lector$/ }).getByText("05e0:1200 (COM4)"))
      .toBeVisible();
  });

  it("keeps a registered device that is not connected chosen, and sends it with the other role", async () => {
    const { screen, registerSerialDevices } = await renderScreen({
      read: async () => ({
        kind: "read",
        registered: { scale: SCALE_IDENTITY },
        detected: [{ path: "COM4", ...READER_IDENTITY }],
        standings: { scale: { kind: "not_detected" }, reader: { kind: "not_registered" } },
      }),
    });
    await expect
      .element(
        screen.getByRole("button", { name: /Balanza$/ }).getByText("0403:6001 (no conectado)"),
      )
      .toBeVisible();

    await choose(screen, "Lector", "05e0:1200 (COM4)");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(registerSerialDevices).toHaveBeenCalledExactlyOnceWith({
      scale: SCALE_IDENTITY,
      reader: READER_IDENTITY,
    });
  });

  it("leaves a role unassigned when it has no device chosen", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("button", { name: /Balanza$/ }).getByText("Sin asignar"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /Lector$/ }).getByText("Sin asignar"))
      .toBeVisible();
  });

  it("sends only the roles that were assigned, tells they were saved, and reads the devices again", async () => {
    const { screen, registerSerialDevices, readSerialDevices } = await renderScreen();

    await choose(screen, "Balanza", "0403:6001 (COM3)");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(registerSerialDevices).toHaveBeenCalledExactlyOnceWith({ scale: SCALE_IDENTITY });
    await expect.element(screen.getByText("Dispositivos guardados")).toBeVisible();
    await expect.element(screen.getByText("La caja reconoce la balanza elegida.")).toBeVisible();
    await vi.waitFor(() => expect(readSerialDevices).toHaveBeenCalledTimes(2));
  });

  it("sends both roles when both were assigned", async () => {
    const { screen, registerSerialDevices } = await renderScreen();

    await choose(screen, "Balanza", "0403:6001 (COM3)");
    await choose(screen, "Lector", "05e0:1200 (COM4)");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(registerSerialDevices).toHaveBeenCalledExactlyOnceWith({
      scale: SCALE_IDENTITY,
      reader: READER_IDENTITY,
    });
  });

  it("tells that one device cannot be both the scale and the reader when the core refuses it", async () => {
    const { screen } = await renderScreen({
      register: async () => ({ kind: "same_identity_for_both" }),
    });

    await choose(screen, "Balanza", "0403:6001 (COM3)");
    await choose(screen, "Lector", "0403:6001 (COM3)");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await expect.element(screen.getByText(SAME_SERIAL_DEVICE_MESSAGE)).toBeVisible();
    await expect.element(screen.getByText("Dispositivos guardados")).not.toBeInTheDocument();
  });

  it("takes the refusal back once the other role's device changes", async () => {
    const { screen } = await renderScreen({
      register: async () => ({ kind: "same_identity_for_both" }),
    });
    await choose(screen, "Balanza", "0403:6001 (COM3)");
    await choose(screen, "Lector", "0403:6001 (COM3)");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await expect.element(screen.getByText(SAME_SERIAL_DEVICE_MESSAGE)).toBeVisible();

    await choose(screen, "Balanza", "05e0:1200 (COM4)");

    await expect.element(screen.getByText(SAME_SERIAL_DEVICE_MESSAGE)).not.toBeInTheDocument();
  });

  it("says the person may no longer configure the devices when the core refuses them", async () => {
    const { screen } = await renderScreen({ register: async () => ({ kind: "lacks_permission" }) });

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await expect
      .element(
        screen.getByText("Ya no tenés permiso para configurar la balanza y el lector.").first(),
      )
      .toBeVisible();
  });

  it("tells the register that the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      register: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it.each([
    {
      name: "the core cannot save them",
      register: async (): Promise<RegisterSerialDevicesOutcome> => ({ kind: "unavailable" }),
    },
    {
      name: "the request fails",
      register: async (): Promise<RegisterSerialDevicesOutcome> => {
        throw new Error("the connection was replaced");
      },
    },
  ])("asks to try again when $name", async ({ register }) => {
    const { screen } = await renderScreen({ register });

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await expect
      .element(screen.getByText("No se pudieron guardar los dispositivos. Probá de nuevo.").first())
      .toBeVisible();
  });

  it("offers Ahora no only when the screen is offered after signing in, and leaves through it", async () => {
    const without = await renderScreen();
    await expect.element(without.screen.getByRole("button", { name: "Guardar" })).toBeVisible();
    await expect
      .element(without.screen.getByRole("button", { name: "Ahora no" }))
      .not.toBeInTheDocument();
    await without.screen.unmount();

    const { screen, onSkip } = await renderScreen({ withSkip: true });
    await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));

    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("offers Ahora no even when no device is detected", async () => {
    const { screen } = await renderScreen({
      read: async () => ({ ...NOTHING_REGISTERED, detected: [] }),
      withSkip: true,
    });

    await expect.element(screen.getByRole("button", { name: "Ahora no" })).toBeVisible();
  });
});

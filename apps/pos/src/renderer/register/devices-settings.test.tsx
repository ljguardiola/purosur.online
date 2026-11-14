import type { ReadSerialDevicesOutcome, RegisterSerialDevicesOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { SAME_SERIAL_DEVICE_MESSAGE } from "./serial-devices-form";
import type { RenderedSettings, SettingsOptions } from "./test-support/settings-screen";
import {
  BOTH_REGISTERED,
  legendOf,
  NOTHING_REGISTERED,
  panelOf,
  READER_IDENTITY,
  renderSettings,
  SCALE_IDENTITY,
} from "./test-support/settings-screen";

async function renderDevices(options: SettingsOptions = {}) {
  return renderSettings({ section: "devices", ...options });
}

type Screen = RenderedSettings["screen"];

function panel(screen: Screen) {
  return panelOf(screen, "Balanza y lector");
}

function select(screen: Screen, role: "Balanza" | "Lector") {
  return panel(screen).getByRole("button", { name: new RegExp(`${role}$`) });
}

async function choose(screen: Screen, role: "Balanza" | "Lector", device: string) {
  await userEvent.click(select(screen, role));
  await userEvent.click(screen.getByRole("option", { name: device }));
}

const GUARDAR = "Guardar";

describe("the scale and reader's section of Ajustes", () => {
  it("is titled Balanza y lector with Esc, and labels its parts in capitals, with no letter key", async () => {
    const { screen } = await renderDevices();

    await expect
      .element(panel(screen).getByRole("heading", { name: "Balanza y lector" }))
      .toBeVisible();
    await expect
      .element(panel(screen).getByRole("button", { name: "Cerrar con Esc" }))
      .toBeVisible();
    for (const label of ["DISPOSITIVOS SERIE DETECTADOS", "BALANZA", "LECTOR"]) {
      await expect.element(panel(screen).getByText(label, { exact: true })).toBeVisible();
    }
    const keycaps = Array.from(panel(screen).element().querySelectorAll("kbd")).map(
      (key) => key.textContent,
    );
    expect(keycaps).toEqual(["Esc", "Enter"]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows a loading placeholder while the devices are read", async () => {
    const { screen } = await renderDevices({ readDevices: () => new Promise(() => {}) });

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: GUARDAR })).not.toBeInTheDocument();
  });

  it("fails to load when the core cannot answer, and reads again on Reintentar", async () => {
    const readDevices = vi
      .fn<() => Promise<ReadSerialDevicesOutcome>>()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValue(NOTHING_REGISTERED);
    const { screen } = await renderDevices({ readDevices });
    await expect.element(screen.getByText("No se pudieron leer los dispositivos")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByRole("button", { name: GUARDAR })).toBeVisible();
  });

  it("says the person may not configure the devices when the core refuses them", async () => {
    const { screen } = await renderDevices({
      readDevices: async () => ({ kind: "lacks_permission" }),
    });

    await expect
      .element(screen.getByText("No tenés permiso para configurar la balanza y el lector"))
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: GUARDAR })).not.toBeInTheDocument();
  });

  it("says the session ended when the core says nobody is signed in", async () => {
    const { screen } = await renderDevices({
      readDevices: async () => ({ kind: "not_signed_in" }),
    });

    await expect
      .element(
        screen.getByText(
          "La sesión terminó. Volvé a ingresar para configurar la balanza y el lector",
        ),
      )
      .toBeVisible();
  });

  it("tells, with a notice and nothing to choose, that no serial device is detected", async () => {
    const { screen } = await renderDevices({
      readDevices: async () => ({ ...NOTHING_REGISTERED, detected: [] }),
    });

    await expect
      .element(panel(screen).getByText("No se detecta ningún dispositivo serie conectado.").first())
      .toBeVisible();
    await expect
      .element(panel(screen).getByText("DISPOSITIVOS SERIE DETECTADOS", { exact: true }))
      .toBeVisible();
    for (const role of ["Balanza", "Lector"] as const) {
      await expect.element(select(screen, role)).toBeDisabled();
      await expect.element(select(screen, role).getByText("Sin dispositivo")).toBeVisible();
    }
    await expect.element(panel(screen).getByRole("button", { name: GUARDAR })).toBeDisabled();
    await expect.element(panel(screen).getByText("Balanza sin registrar")).not.toBeInTheDocument();
    expect(legendOf(screen)).toEqual(["↑↓Apartados"]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("lists each detected device by identity and port, with the role it is registered as at the right", async () => {
    const { screen } = await renderDevices({
      readDevices: async () => BOTH_REGISTERED,
      standings: { scale: "matching", reader: "matching" },
    });

    const list = panel(screen).getByRole("list", { name: "Dispositivos serie detectados" });
    await expect
      .element(list.getByRole("listitem").first())
      .toHaveTextContent("0403:6001 · COM3Balanza");
    await expect
      .element(list.getByRole("listitem").last())
      .toHaveTextContent("05e0:1200 · COM4Lector");
  });

  it("leaves the registered role empty for a device registered as neither", async () => {
    const { screen } = await renderDevices();

    const item = panel(screen).getByRole("listitem").filter({ hasText: "0403:6001" });
    await expect.element(item).toBeVisible();
    expect(item.element().textContent).toBe("0403:6001 · COM3");
  });

  it("shows the standing of the scale and the reader as chips", async () => {
    const { screen } = await renderDevices({
      readDevices: async () => ({
        ...NOTHING_REGISTERED,
        standings: { scale: { kind: "not_detected" }, reader: { kind: "not_registered" } },
      }),
    });

    await expect.element(panel(screen).getByText("Balanza sin conectar")).toBeVisible();
    await expect.element(panel(screen).getByText("Lector sin registrar")).toBeVisible();
  });

  it("chooses the registered devices for the scale and the reader", async () => {
    const { screen } = await renderDevices({ readDevices: async () => BOTH_REGISTERED });

    await expect.element(select(screen, "Balanza").getByText("0403:6001 (COM3)")).toBeVisible();
    await expect.element(select(screen, "Lector").getByText("05e0:1200 (COM4)")).toBeVisible();
  });

  it("keeps a registered device that is not connected chosen, and sends it with the other role", async () => {
    const { screen, registerSerialDevices } = await renderDevices({
      readDevices: async () => ({
        kind: "read",
        registered: { scale: SCALE_IDENTITY },
        detected: [{ path: "COM4", ...READER_IDENTITY }],
        standings: { scale: { kind: "not_detected" }, reader: { kind: "not_registered" } },
      }),
    });
    await expect
      .element(select(screen, "Balanza").getByText("0403:6001 (no conectado)"))
      .toBeVisible();

    await choose(screen, "Lector", "05e0:1200 (COM4)");
    await userEvent.click(screen.getByRole("button", { name: GUARDAR }));

    expect(registerSerialDevices).toHaveBeenCalledExactlyOnceWith({
      scale: SCALE_IDENTITY,
      reader: READER_IDENTITY,
    });
  });

  it("leaves a role unassigned when it has no device chosen", async () => {
    const { screen } = await renderDevices();

    await expect.element(select(screen, "Balanza").getByText("Sin asignar")).toBeVisible();
    await expect.element(select(screen, "Lector").getByText("Sin asignar")).toBeVisible();
  });

  it("sends only the roles that were assigned, tells they were saved, and reads the devices again", async () => {
    const { screen, registerSerialDevices, readSerialDevices } = await renderDevices();

    await choose(screen, "Balanza", "0403:6001 (COM3)");
    await userEvent.click(screen.getByRole("button", { name: GUARDAR }));

    expect(registerSerialDevices).toHaveBeenCalledExactlyOnceWith({ scale: SCALE_IDENTITY });
    await expect.element(screen.getByText("Dispositivos guardados")).toBeVisible();
    await expect.element(screen.getByText("La caja reconoce la balanza elegida.")).toBeVisible();
    await vi.waitFor(() => expect(readSerialDevices).toHaveBeenCalledTimes(2));
  });

  it("tells the scale and the reader were registered when both were assigned", async () => {
    const { screen, registerSerialDevices } = await renderDevices({
      registerDevices: async () => ({
        kind: "registered",
        devices: { scale: SCALE_IDENTITY, reader: READER_IDENTITY },
      }),
    });

    await choose(screen, "Balanza", "0403:6001 (COM3)");
    await choose(screen, "Lector", "05e0:1200 (COM4)");
    await userEvent.click(screen.getByRole("button", { name: GUARDAR }));

    expect(registerSerialDevices).toHaveBeenCalledExactlyOnceWith({
      scale: SCALE_IDENTITY,
      reader: READER_IDENTITY,
    });
    await expect.element(screen.getByText("Dispositivos guardados")).toBeVisible();
    await expect
      .element(screen.getByText("La balanza y el lector quedaron registrados."))
      .toBeVisible();
  });

  it("tells that one device cannot be both the scale and the reader when the core refuses it", async () => {
    const { screen } = await renderDevices({
      registerDevices: async () => ({ kind: "same_identity_for_both" }),
    });

    await choose(screen, "Balanza", "0403:6001 (COM3)");
    await choose(screen, "Lector", "0403:6001 (COM3)");
    await userEvent.click(screen.getByRole("button", { name: GUARDAR }));

    await expect.element(screen.getByText(SAME_SERIAL_DEVICE_MESSAGE)).toBeVisible();
    await expect.element(screen.getByText("Dispositivos guardados")).not.toBeInTheDocument();
  });

  it("takes the refusal back once the other role's device changes", async () => {
    const { screen } = await renderDevices({
      registerDevices: async () => ({ kind: "same_identity_for_both" }),
    });
    await choose(screen, "Balanza", "0403:6001 (COM3)");
    await choose(screen, "Lector", "0403:6001 (COM3)");
    await userEvent.click(screen.getByRole("button", { name: GUARDAR }));
    await expect.element(screen.getByText(SAME_SERIAL_DEVICE_MESSAGE)).toBeVisible();

    await choose(screen, "Balanza", "05e0:1200 (COM4)");

    await expect.element(screen.getByText(SAME_SERIAL_DEVICE_MESSAGE)).not.toBeInTheDocument();
  });

  it("says the person may no longer configure the devices when the core refuses them", async () => {
    const { screen } = await renderDevices({
      registerDevices: async () => ({ kind: "lacks_permission" }),
    });

    await userEvent.click(screen.getByRole("button", { name: GUARDAR }));

    await expect
      .element(
        screen.getByText("Ya no tenés permiso para configurar la balanza y el lector.").first(),
      )
      .toBeVisible();
  });

  it("tells the register that the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderDevices({
      registerDevices: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.click(screen.getByRole("button", { name: GUARDAR }));

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it.each([
    {
      name: "the core cannot save them",
      registerDevices: async (): Promise<RegisterSerialDevicesOutcome> => ({ kind: "unavailable" }),
    },
    {
      name: "the request fails",
      registerDevices: async (): Promise<RegisterSerialDevicesOutcome> => {
        throw new Error("the connection was replaced");
      },
    },
  ])("asks to try again when $name", async ({ registerDevices }) => {
    const { screen } = await renderDevices({ registerDevices });

    await userEvent.click(screen.getByRole("button", { name: GUARDAR }));

    await expect
      .element(screen.getByText("No se pudieron guardar los dispositivos. Probá de nuevo.").first())
      .toBeVisible();
  });

  describe("from the keyboard", () => {
    it("starts on the list side, offering to move between sections and fields", async () => {
      const { screen } = await renderDevices();

      await expect.element(select(screen, "Balanza")).not.toHaveFocus();
      expect(legendOf(screen)).toEqual(["↑↓Apartados", "TabCampo"]);
    });

    it("enters Balanza on Tab, then moves between Balanza and Lector on Tab and Shift+Tab", async () => {
      const { screen } = await renderDevices();

      await userEvent.keyboard("{Tab}");
      await expect.element(select(screen, "Balanza")).toHaveFocus();
      await userEvent.keyboard("{Tab}");
      await expect.element(select(screen, "Lector")).toHaveFocus();
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
      await expect.element(select(screen, "Balanza")).toHaveFocus();
    });

    it("changes the device of the focused field on the arrows, offering Dispositivo and, with changes, Enter", async () => {
      const { screen } = await renderDevices();
      await userEvent.keyboard("{Tab}");
      expect(legendOf(screen)).toEqual(["↑↓Dispositivo", "TabCampo"]);

      await userEvent.keyboard("{ArrowDown}");

      await expect.element(select(screen, "Balanza").getByText("0403:6001 (COM3)")).toBeVisible();
      await expect
        .poll(() => legendOf(screen))
        .toEqual(["↑↓Dispositivo", "TabCampo", "EnterGuardar"]);
      await userEvent.keyboard("{ArrowUp}");
      await expect.element(select(screen, "Balanza").getByText("Sin asignar")).toBeVisible();
    });

    it("saves on Enter from a field with changes, and returns to the list side", async () => {
      const { screen, registerSerialDevices } = await renderDevices();
      await userEvent.keyboard("{Tab}");
      await userEvent.keyboard("{ArrowDown}");

      await userEvent.keyboard("{Enter}");

      expect(registerSerialDevices).toHaveBeenCalledExactlyOnceWith({ scale: SCALE_IDENTITY });
      await expect.element(screen.getByText("Dispositivos guardados")).toBeVisible();
      await expect.element(select(screen, "Balanza")).not.toHaveFocus();
      await expect.poll(() => legendOf(screen)).toEqual(["↑↓Apartados", "TabCampo"]);
    });

    it("moves between sections on the arrows from the list side", async () => {
      const { screen, onSelectSection } = await renderDevices();
      await expect.element(panel(screen)).toBeVisible();

      await userEvent.keyboard("{ArrowUp}");

      expect(onSelectSection).toHaveBeenCalledExactlyOnceWith("printer");
    });

    it("offers Ahora no and the same legend when the devices were offered after signing in", async () => {
      const { screen } = await renderDevices({ offered: true });

      await expect.element(panel(screen).getByRole("button", { name: "Ahora no" })).toBeVisible();
      await expect.poll(() => legendOf(screen)).toEqual(["↑↓Apartados", "TabCampo"]);
    });
  });
});

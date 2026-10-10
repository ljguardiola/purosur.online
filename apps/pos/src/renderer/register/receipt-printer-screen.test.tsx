import type { ReadReceiptPrinterOutcome, SetReceiptPrinterOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Printer } from "lucide-react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ActionEntry } from "../shell/action-entries";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE } from "./receipt-printer-form";
import { ReceiptPrinterScreen } from "./receipt-printer-screen";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Linus",
  abilities: ["configure_receipt_printer"],
};

const PRINTER_ENTRY: ActionEntry = {
  label: "Impresora",
  icon: Printer,
  ability: "configure_receipt_printer",
  to: "/receipt-printer",
};

const NOT_CONFIGURED: ReadReceiptPrinterOutcome = { kind: "not_configured" };
const CONFIGURED: ReadReceiptPrinterOutcome = {
  kind: "configured",
  address: { host: "10.10.10.2", port: 9100 },
};
const SAVED: SetReceiptPrinterOutcome = {
  kind: "saved",
  address: { host: "10.10.10.9", port: 9101 },
};

async function renderScreen({
  read = async (): Promise<ReadReceiptPrinterOutcome> => NOT_CONFIGURED,
  set = async (): Promise<SetReceiptPrinterOutcome> => SAVED,
  registerName = "Caja 1",
}: {
  read?: () => Promise<ReadReceiptPrinterOutcome>;
  set?: (address: string) => Promise<SetReceiptPrinterOutcome>;
  registerName?: string | null;
} = {}) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const readReceiptPrinter = vi.fn(read);
  const setReceiptPrinter = vi.fn(set);
  const onSessionInvalid = vi.fn();
  const screen = await render(
    <ReceiptPrinterScreen
      person={PERSON}
      registerName={registerName}
      entries={[PRINTER_ENTRY]}
      signOut={vi.fn()}
      readReceiptPrinter={readReceiptPrinter}
      setReceiptPrinter={setReceiptPrinter}
      onSessionInvalid={onSessionInvalid}
    />,
  );
  return { screen, readReceiptPrinter, setReceiptPrinter, onSessionInvalid };
}

type Rendered = Awaited<ReturnType<typeof renderScreen>>;

async function save(screen: Rendered["screen"], typed: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Dirección" }), typed);
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
}

describe("ReceiptPrinterScreen", () => {
  it("is titled Impresora de tickets and names the register in the eyebrow", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Impresora de tickets" }))
      .toBeVisible();
    await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows a loading placeholder while the address is read", async () => {
    const { screen } = await renderScreen({ read: () => new Promise(() => {}) });

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("textbox", { name: "Dirección" }))
      .not.toBeInTheDocument();
  });

  it("fails to load when the core cannot answer, and reads again on Reintentar", async () => {
    const read = vi
      .fn<() => Promise<ReadReceiptPrinterOutcome>>()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValue(CONFIGURED);
    const { screen } = await renderScreen({ read });
    await expect
      .element(screen.getByText("No se pudo leer la dirección de la impresora"))
      .toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect
      .element(screen.getByRole("textbox", { name: "Dirección" }))
      .toHaveValue("10.10.10.2:9100");
  });

  it("warns that the printer is not configured and leaves the address empty", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("La impresora no está configurada.")).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Dirección" })).toHaveValue("");
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each([
    { stored: CONFIGURED, shown: "10.10.10.2:9100" },
    {
      stored: { kind: "configured", address: { host: "ticketera", port: null } } as const,
      shown: "ticketera",
    },
  ])("shows the stored address $shown without a warning", async ({ stored, shown }) => {
    const { screen } = await renderScreen({ read: async () => stored });

    await expect.element(screen.getByRole("textbox", { name: "Dirección" })).toHaveValue(shown);
    await expect
      .element(screen.getByText("La impresora no está configurada."))
      .not.toBeInTheDocument();
  });

  it("sends the address as typed, tells where the register prints from the next receipt, and reads the address again", async () => {
    const { screen, setReceiptPrinter, readReceiptPrinter } = await renderScreen();

    await save(screen, " 10.10.10.9:9101 ");

    expect(setReceiptPrinter).toHaveBeenCalledExactlyOnceWith(" 10.10.10.9:9101 ");
    await expect
      .element(screen.getByText("La caja imprime en 10.10.10.9:9101 desde el próximo ticket."))
      .toBeVisible();
    await vi.waitFor(() => expect(readReceiptPrinter).toHaveBeenCalledTimes(2));
  });

  it("shows the saved address without a port as typed", async () => {
    const { screen } = await renderScreen({
      set: async () => ({ kind: "saved", address: { host: "ticketera", port: null } }),
    });

    await save(screen, "ticketera");

    await expect
      .element(screen.getByText("La caja imprime en ticketera desde el próximo ticket."))
      .toBeVisible();
  });

  it("asks for an address instead of sending an empty one", async () => {
    const { screen, setReceiptPrinter } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await expect.element(screen.getByText("Escribí la dirección de la impresora.")).toBeVisible();
    expect(setReceiptPrinter).not.toHaveBeenCalled();
  });

  it("explains what an address looks like instead of sending one that is not an address", async () => {
    const { screen, setReceiptPrinter } = await renderScreen();

    await save(screen, "10.10.10.2:99999");

    await expect.element(screen.getByText(INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE)).toBeVisible();
    expect(setReceiptPrinter).not.toHaveBeenCalled();
  });

  it("explains what an address looks like when the core refuses the one sent", async () => {
    const { screen } = await renderScreen({ set: async () => ({ kind: "invalid_address" }) });

    await save(screen, "10.10.10.9");

    await expect.element(screen.getByText(INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE)).toBeVisible();
  });

  it("says the person may no longer configure the printer when the core refuses them", async () => {
    const { screen } = await renderScreen({ set: async () => ({ kind: "lacks_permission" }) });

    await save(screen, "10.10.10.9");

    await expect
      .element(screen.getByText("Ya no tenés permiso para configurar la impresora."))
      .toBeVisible();
  });

  it("tells the register that the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      set: async () => ({ kind: "not_signed_in" }),
    });

    await save(screen, "10.10.10.9");

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it.each([
    {
      name: "the core cannot save it",
      set: async (): Promise<SetReceiptPrinterOutcome> => ({ kind: "unavailable" }),
    },
    {
      name: "the request fails",
      set: async (): Promise<SetReceiptPrinterOutcome> => {
        throw new Error("the connection was replaced");
      },
    },
  ])("asks to try again when $name", async ({ set }) => {
    const { screen } = await renderScreen({ set });

    await save(screen, "10.10.10.9");

    await expect
      .element(screen.getByText("No se pudo guardar la dirección. Probá de nuevo."))
      .toBeVisible();
  });

  it("shows no read-only copy of the address to a person who may no longer configure the printer", async () => {
    const { screen } = await renderScreen({ read: async () => ({ kind: "lacks_permission" }) });

    await expect
      .element(screen.getByText("No tenés permiso para configurar la impresora"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Dirección" }))
      .not.toBeInTheDocument();
  });

  it("says the session ended when the core says nobody is signed in", async () => {
    const { screen } = await renderScreen({ read: async () => ({ kind: "not_signed_in" }) });

    await expect
      .element(screen.getByText("La sesión terminó. Volvé a ingresar para configurar la impresora"))
      .toBeVisible();
  });
});

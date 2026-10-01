import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CashOpeningPanel } from "./cash-opening-panel";

const OPENED: OpenCashSessionOutcome = {
  kind: "opened",
  session: { id: "s1", opened_at: "2026-09-30T12:02:00.000Z", opening_float: 2_000_050 },
};
const REQUIRED_MESSAGE = "Ingresá el fondo inicial.";
const INVALID_MESSAGE = "Ingresá un importe válido, por ejemplo 20.000,00.";

async function renderPanel(
  props: {
    canOpen?: boolean;
    open?: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
  } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const open = props.open ?? vi.fn(async () => OPENED);
  const screen = await render(
    <CashOpeningPanel firstName="Ada" canOpen={props.canOpen ?? true} open={open} />,
  );
  return { screen, open };
}

async function startOpening(screen: Awaited<ReturnType<typeof renderPanel>>["screen"]) {
  await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
}

async function submitFloat(
  screen: Awaited<ReturnType<typeof renderPanel>>["screen"],
  typed: string,
) {
  await startOpening(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), typed);
  await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));
}

describe("CashOpeningPanel", () => {
  it("names the person and invites them to open the cash drawer", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByRole("heading", { name: "Ada" })).toBeVisible();
    await expect
      .element(screen.getByText("Para vender, cobrar, devolver o mover efectivo, abrí la caja."))
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Abrir caja" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows only the person's name to someone who may not open the cash drawer", async () => {
    const { screen } = await renderPanel({ canOpen: false });

    await expect.element(screen.getByRole("heading", { name: "Ada" })).toBeVisible();
    expect(screen.container.querySelectorAll("button, p")).toHaveLength(0);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("turns into the opening form, with the float empty and focused, once Abrir caja is pressed", async () => {
    const { screen } = await renderPanel();

    await startOpening(screen);

    await expect.element(screen.getByRole("heading", { name: "Abrí la caja" })).toBeVisible();
    await expect
      .element(screen.getByText("Contá el efectivo que hay en el cajón antes de empezar."))
      .toBeVisible();
    await expect.element(screen.getByText("$", { exact: true })).toBeVisible();
    const field = screen.getByRole("textbox", { name: "Fondo inicial" });
    await expect.element(field).toHaveValue("");
    await expect.element(field).toHaveFocus();
    await expect.element(screen.getByRole("button", { name: "Abrir la caja" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Abrir caja" }))
      .not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("goes back to the invitation and forgets the typed float on Cancelar", async () => {
    const { screen, open } = await renderPanel();
    await startOpening(screen);
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "500");

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect.element(screen.getByRole("button", { name: "Abrir caja" })).toBeVisible();
    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
    await startOpening(screen);
    await expect.element(screen.getByRole("textbox", { name: "Fondo inicial" })).toHaveValue("");
    expect(open).not.toHaveBeenCalled();
  });

  it("asks for the float without sending anything when it is empty", async () => {
    const { screen, open } = await renderPanel();
    await startOpening(screen);

    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));

    await expect.element(screen.getByText(REQUIRED_MESSAGE)).toBeVisible();
    expect(open).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each(["abc", "20.000,001", "21.474.836,48"])(
    "asks for a valid amount without sending anything when the float is %s",
    async (typed) => {
      const { screen, open } = await renderPanel();

      await submitFloat(screen, typed);

      await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
      expect(open).not.toHaveBeenCalled();
    },
  );

  it("keeps the message while the edited float is still invalid and clears it once it is valid", async () => {
    const { screen } = await renderPanel();
    await submitFloat(screen, "abc");
    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "abd");
    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
    await expect.element(screen.getByText(INVALID_MESSAGE)).not.toBeInTheDocument();
  });

  it("sends the float in cents when the button is pressed", async () => {
    const { screen, open } = await renderPanel();

    await submitFloat(screen, "20.000,50");

    expect(open).toHaveBeenCalledExactlyOnceWith(2_000_050);
  });

  it("sends the float when Enter is pressed in the field", async () => {
    const { screen, open } = await renderPanel();
    await startOpening(screen);

    await userEvent.type(screen.getByRole("textbox", { name: "Fondo inicial" }), "0{Enter}");

    expect(open).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("disables the button while the core has not answered", async () => {
    let answer: (outcome: OpenCashSessionOutcome) => void = () => {};
    const open = vi.fn(
      () =>
        new Promise<OpenCashSessionOutcome>((resolve) => {
          answer = resolve;
        }),
    );
    const { screen } = await renderPanel({ open });

    await submitFloat(screen, "100");

    await expect.element(screen.getByRole("button", { name: "Abrir la caja" })).toBeDisabled();
    answer({ kind: "unavailable" });
    await expect.element(screen.getByRole("button", { name: "Abrir la caja" })).toBeEnabled();
  });

  it("puts the core's refusal of the float on the field with the same message", async () => {
    const { screen } = await renderPanel({ open: async () => ({ kind: "invalid_opening_float" }) });

    await submitFloat(screen, "100");

    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
  });

  it("says the person may not open the cash drawer when the core refuses", async () => {
    const { screen } = await renderPanel({ open: async () => ({ kind: "not_permitted" }) });

    await submitFloat(screen, "100");

    await expect
      .element(screen.getByText("No tenés permiso para abrir la caja.").first())
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each<[string, () => Promise<OpenCashSessionOutcome>]>([
    ["is unavailable", async () => ({ kind: "unavailable" })],
    ["fails to answer", () => Promise.reject(new Error("the core connection was replaced"))],
  ])("asks to try again when the core %s", async (_, open) => {
    const { screen } = await renderPanel({ open });

    await submitFloat(screen, "100");

    await expect
      .element(screen.getByText("No se pudo abrir la caja. Probá de nuevo.").first())
      .toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Fondo inicial" })).toHaveValue("100");
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each<OpenCashSessionOutcome>([OPENED, { kind: "already_open" }])(
    "shows no message of its own when the core answers $kind",
    async (outcome) => {
      const { screen } = await renderPanel({ open: async () => outcome });

      await submitFloat(screen, "100");

      await expect.element(screen.getByRole("button", { name: "Abrir la caja" })).toBeEnabled();
      await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("clears the message once the float is edited", async () => {
    const { screen } = await renderPanel({ open: async () => ({ kind: "unavailable" }) });
    await submitFloat(screen, "100");
    await expect
      .element(screen.getByText("No se pudo abrir la caja. Probá de nuevo.").first())
      .toBeVisible();

    await userEvent.type(screen.getByRole("textbox", { name: "Fondo inicial" }), "0");

    await expect
      .element(screen.getByText("No se pudo abrir la caja. Probá de nuevo.").first())
      .not.toBeInTheDocument();
  });
});

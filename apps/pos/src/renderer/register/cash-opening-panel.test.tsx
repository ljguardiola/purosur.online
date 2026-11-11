import type { OpenCashSessionOutcome, OpeningFloatSuggestion } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { CashOpeningPanel } from "./cash-opening-panel";

const OPENED: OpenCashSessionOutcome = {
  kind: "opened",
  cash_session: {
    id: "s1",
    opened_at: "2026-09-30T12:02:00.000Z",
    opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
    locked: false,
  },
};
const PREVIOUS_CLOSE: OpeningFloatSuggestion = {
  kind: "previous_close",
  closed_at: "2026-11-04T20:14:00.000-03:00",
  counted_cash: 14_400_000,
};
const NO_CLOSE: OpeningFloatSuggestion = { kind: "none" };
const REQUIRED_MESSAGE = "Ingresá el fondo inicial.";
const INVALID_MESSAGE = "Ingresá un importe válido, por ejemplo 20.000,00.";

type Suggested = OpeningFloatSuggestion | null | "unavailable";

async function renderPanel(
  props: {
    canOpen?: boolean;
    open?: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
    readOpeningFloatSuggestion?: () => Promise<Suggested>;
  } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const open = props.open ?? vi.fn(async () => OPENED);
  const readOpeningFloatSuggestion = vi.fn(
    props.readOpeningFloatSuggestion ?? (async (): Promise<Suggested> => NO_CLOSE),
  );
  const screen = await render(
    <CashOpeningPanel
      firstName="Ada"
      canOpen={props.canOpen ?? true}
      open={open}
      readOpeningFloatSuggestion={readOpeningFloatSuggestion}
    />,
  );
  return { screen, open, readOpeningFloatSuggestion };
}

type Screen = Awaited<ReturnType<typeof renderPanel>>["screen"];

function floatField(screen: Screen) {
  return screen.getByRole("textbox", { name: "Fondo inicial" });
}

async function submitFloat(screen: Screen, typed: string, keys = false) {
  if (keys) {
    await userEvent.clear(floatField(screen));
    await userEvent.keyboard(typed);
  } else {
    await userEvent.fill(floatField(screen), typed);
  }
  await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
}

describe("CashOpeningPanel", () => {
  it("opens with the float suggested from the previous close, focused and editable", async () => {
    const { screen } = await renderPanel({
      readOpeningFloatSuggestion: async () => PREVIOUS_CLOSE,
    });

    await expect.element(screen.getByRole("complementary", { name: "Abrir caja" })).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Abrir caja" })).toBeVisible();
    await expect.element(screen.getByText("Cierre anterior")).toBeVisible();
    await expect.element(screen.getByText("04/11 · 20:14")).toBeVisible();
    await expect.element(screen.getByText("Contado")).toBeVisible();
    await expect.element(screen.getByText("$ 144.000,00")).toBeVisible();
    const field = floatField(screen);
    await expect.element(field).toHaveValue("144.000,00");
    await expect.element(field).toHaveFocus();
    await expect.element(field).toHaveAttribute("inputmode", "decimal");
    await expect.element(screen.getByRole("button", { name: "Abrir caja" })).toBeVisible();
    await expect.element(screen.getByText("Enter")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("leaves the float empty and shows no previous close when the register was never closed", async () => {
    const { screen } = await renderPanel();

    const field = floatField(screen);
    await expect.element(field).toHaveValue("");
    await expect.element(field).toHaveFocus();
    await expect.element(screen.getByText("Cierre anterior")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Contado")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("sends the suggested float as it was counted when Enter is pressed", async () => {
    const { screen, open } = await renderPanel({
      readOpeningFloatSuggestion: async () => PREVIOUS_CLOSE,
    });
    await expect.element(floatField(screen)).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(open).toHaveBeenCalledExactlyOnceWith(14_400_000);
  });

  it("sends the float the cashier typed over the suggested one", async () => {
    const { screen, open } = await renderPanel({
      readOpeningFloatSuggestion: async () => PREVIOUS_CLOSE,
    });

    await submitFloat(screen, "20000,50");

    expect(open).toHaveBeenCalledExactlyOnceWith(2_000_050);
  });

  it("shows the form only once the suggestion is read", async () => {
    let answer: (suggestion: Suggested) => void = () => {};
    const { screen } = await renderPanel({
      readOpeningFloatSuggestion: () =>
        new Promise<Suggested>((resolve) => {
          answer = resolve;
        }),
    });

    await expect.element(screen.getByRole("heading", { name: "Abrir caja" })).toBeVisible();
    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
    answer(PREVIOUS_CLOSE);
    await expect.element(floatField(screen)).toHaveValue("144.000,00");
  });

  it("offers to read the suggestion again when it cannot be read", async () => {
    const readOpeningFloatSuggestion = vi
      .fn<() => Promise<Suggested>>()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValue(PREVIOUS_CLOSE);
    const { screen } = await renderPanel({ readOpeningFloatSuggestion });

    await expect.element(screen.getByText("No se pudo leer el cierre anterior")).toBeVisible();
    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(floatField(screen)).toHaveValue("144.000,00");
  });

  it("shows only the person's name to someone who may not open the cash drawer", async () => {
    const { screen, readOpeningFloatSuggestion } = await renderPanel({ canOpen: false });

    await expect.element(screen.getByRole("heading", { name: "Ada" })).toBeVisible();
    expect(screen.container.querySelectorAll("button, p, input")).toHaveLength(0);
    expect(readOpeningFloatSuggestion).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("asks for the float without sending anything when it is empty", async () => {
    const { screen, open } = await renderPanel();
    await expect.element(floatField(screen)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));

    await expect.element(screen.getByText(REQUIRED_MESSAGE)).toBeVisible();
    expect(open).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("sends a float beyond the largest amount to the core and shows its refusal on the field", async () => {
    const open = vi.fn(
      async (): Promise<OpenCashSessionOutcome> => ({
        kind: "invalid_opening_float",
      }),
    );
    const { screen } = await renderPanel({ open });

    await submitFloat(screen, "21474836,48");

    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
    expect(open).toHaveBeenCalledWith(2_147_483_648);
  });

  it.each(["5,", "0,"])(
    "asks for a valid amount without sending anything when the float is %s",
    async (typed) => {
      const { screen, open } = await renderPanel();

      await submitFloat(screen, typed, true);

      await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
      expect(open).not.toHaveBeenCalled();
    },
  );

  it("keeps the message while the edited float is still invalid and clears it once it is valid", async () => {
    const { screen } = await renderPanel();
    await submitFloat(screen, "5,", true);
    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();

    await userEvent.clear(floatField(screen));
    await userEvent.keyboard("6,");
    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();

    await userEvent.fill(floatField(screen), "100");
    await expect.element(screen.getByText(INVALID_MESSAGE)).not.toBeInTheDocument();
  });

  it("sends the float in cents when the button is pressed", async () => {
    const { screen, open } = await renderPanel();

    await submitFloat(screen, "20000,50");

    expect(open).toHaveBeenCalledExactlyOnceWith(2_000_050);
  });

  it("sends the float when Enter is pressed in the field", async () => {
    const { screen, open } = await renderPanel();

    await userEvent.type(floatField(screen), "0{Enter}");

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

    await expect.element(screen.getByRole("button", { name: "Abrir caja" })).toBeDisabled();
    answer({ kind: "unavailable" });
    await expect.element(screen.getByRole("button", { name: "Abrir caja" })).toBeEnabled();
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

  it("says the register cannot be opened while it is being restored", async () => {
    const { screen } = await renderPanel({
      open: async () => ({ kind: "restoration_in_progress" }),
    });

    await submitFloat(screen, "100");

    await expect
      .element(screen.getByText("La caja se está restaurando: todavía no se puede abrir.").first())
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
    await expect.element(floatField(screen)).toHaveValue("100");
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each<OpenCashSessionOutcome>([OPENED, { kind: "already_open" }])(
    "shows no message of its own when the core answers $kind",
    async (outcome) => {
      const { screen } = await renderPanel({ open: async () => outcome });

      await submitFloat(screen, "100");

      await expect.element(screen.getByRole("button", { name: "Abrir caja" })).toBeEnabled();
      await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("clears the message once the float is edited", async () => {
    const { screen } = await renderPanel({ open: async () => ({ kind: "unavailable" }) });
    await submitFloat(screen, "100");
    await expect
      .element(screen.getByText("No se pudo abrir la caja. Probá de nuevo.").first())
      .toBeVisible();

    await userEvent.type(floatField(screen), "0");

    await expect
      .element(screen.getByText("No se pudo abrir la caja. Probá de nuevo.").first())
      .not.toBeInTheDocument();
  });

  it("groups thousands and takes a typed dot as the decimal comma", async () => {
    const { screen } = await renderPanel();
    const field = floatField(screen);
    await userEvent.clear(field);
    await userEvent.type(field, "1234.5");

    await expect.element(field).toHaveValue("1.234,5");
  });
});

import type { CashBalance, CloseCashSessionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CoreData } from "../platform/use-core-query";
import { render } from "../shell/test-support/render-with-router";
import { CloseCashSessionPanel } from "./close-cash-session-panel";

const BALANCE: CashBalance = {
  opening_float: { amount: 5_230_000, direction: "in" },
  cash_sales: { amount: 24_580_000, direction: "in" },
  change_given: { amount: 3_890_000, direction: "out" },
  refunds: { amount: 0, direction: "out" },
  cash_in: { amount: 2_000_000, direction: "in" },
  expenses: { amount: 3_500_000, direction: "out" },
  withdrawals: { amount: 10_000_000, direction: "out" },
  expected: 14_420_000,
};
const FAILED_NOTICE = "No se pudo cerrar la caja. Probá de nuevo.";
const CLOSED: CloseCashSessionOutcome = {
  kind: "closed",
  session: {
    id: "s1",
    expected_cash: 14_420_000,
    counted_cash: 14_400_000,
    difference: -20_000,
    opened_at: "2026-11-04T08:02:00.000-03:00",
    closed_at: "2026-11-04T20:14:00.000-03:00",
  },
  movements: [],
};

type Props = {
  balance?: CoreData<CashBalance>;
  openSale?: boolean;
  outcome?: CloseCashSessionOutcome | Promise<CloseCashSessionOutcome>;
  closeCashSession?: (countedCash: number) => Promise<CloseCashSessionOutcome>;
};

function noticeIconOf(alert: Element): SVGElement | null {
  let frame: Element | null = alert;
  while (frame !== null && frame.querySelector("svg") === null) {
    frame = frame.parentElement;
  }
  return frame?.querySelector("svg") ?? null;
}

async function renderPanel(props: Props = {}) {
  await page.viewport(1366, 768);
  onTestFinished(() => page.viewport(414, 896));
  const closeCashSession = vi.fn(
    props.closeCashSession ?? (async () => await (props.outcome ?? CLOSED)),
  );
  const onClose = vi.fn();
  const onClosed = vi.fn();
  const screen = await render(
    <CloseCashSessionPanel
      sessionId="s1"
      balance={props.balance ?? { status: "loaded", value: BALANCE, refreshing: false }}
      openSale={props.openSale ?? false}
      loadCashCountPreview={async (counted) => ({ difference: counted - BALANCE.expected })}
      closeCashSession={closeCashSession}
      onClose={onClose}
      onClosed={onClosed}
    />,
  );
  return { screen, closeCashSession, onClose, onClosed };
}

describe("CloseCashSessionPanel", () => {
  it("is headed Cerrar caja and closes with Esc without closing the cash session", async () => {
    const { screen, onClose, closeCashSession } = await renderPanel();

    await expect
      .element(screen.getByRole("heading", { name: "Cerrar caja", exact: true }))
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(closeCashSession).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the expected cash as the hero figure with its breakdown, and the focus on Contado", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByText("EFECTIVO ESPERADO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 144.200,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 52.300,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("– $ 100.000,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Contado" })).toHaveFocus();
  });

  it("draws the breakdown as bare rows, with no line above or below them", async () => {
    const { screen } = await renderPanel();

    const label = screen.getByText("Fondo inicial", { exact: true }).element();
    const breakdown = label.parentElement?.parentElement as HTMLElement;
    const style = getComputedStyle(breakdown);

    expect(breakdown.textContent).toContain("Retiros");
    expect(style.borderTopWidth).toBe("0px");
    expect(style.borderBottomWidth).toBe("0px");
  });

  it("heads the count field with CONTADO as an eyebrow, like EFECTIVO ESPERADO", async () => {
    const { screen } = await renderPanel();

    const expectedEyebrow = screen.getByText("EFECTIVO ESPERADO", { exact: true }).element();
    const shown = Array.from(screen.container.querySelectorAll("p, label")).filter(
      (element) =>
        element.textContent === "Contado" && getComputedStyle(element).position !== "absolute",
    );
    expect(shown).toHaveLength(1);
    const eyebrow = getComputedStyle(shown[0] as Element);
    const expected = getComputedStyle(expectedEyebrow);
    expect(eyebrow.textTransform).toBe("uppercase");
    expect(eyebrow.color).toBe(expected.color);
    expect(eyebrow.fontSize).toBe(expected.fontSize);
    await expect.element(screen.getByRole("textbox", { name: "Contado" })).toBeVisible();
  });

  it("draws the expected cash in the text's own color and the breakdown's amounts in regular weight", async () => {
    const { screen } = await renderPanel();

    const hero = screen.getByText("$ 144.200,00", { exact: true }).element();
    const title = screen.getByRole("heading", { name: "Cerrar caja", exact: true }).element();
    expect(getComputedStyle(hero).color).toBe(getComputedStyle(title).color);
    const amount = screen.getByText("$ 52.300,00", { exact: true }).element();
    expect(getComputedStyle(amount).fontWeight).toBe("400");
  });

  it("gives the focus back to Contado after a failed close", async () => {
    const { screen } = await renderPanel({ outcome: { kind: "unavailable" } });
    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("alert")).toHaveTextContent(FAILED_NOTICE);
    await expect.element(screen.getByRole("textbox", { name: "Contado" })).toHaveFocus();
  });

  it("shows FALTA with the missing amount in a neutral box, without the old notice or strip", async () => {
    const { screen } = await renderPanel();

    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await expect.element(screen.getByText("FALTA", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 200,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText(/Faltan/)).not.toBeInTheDocument();
    await expect.element(screen.getByText("Diferencia", { exact: true })).not.toBeInTheDocument();
  });

  it("shows SOBRAN with the amount left over", async () => {
    const { screen } = await renderPanel();

    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.500,00");

    await expect.element(screen.getByText("SOBRAN", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 300,00", { exact: true })).toBeVisible();
  });

  it("shows no difference when the count matches", async () => {
    const { screen } = await renderPanel();

    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.200,00");

    await expect.element(screen.getByText("FALTA", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("SOBRAN", { exact: true })).not.toBeInTheDocument();
  });

  it("closes the cash session with the counted cash on Enter", async () => {
    const { screen, closeCashSession, onClosed } = await renderPanel();
    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledOnce());
    expect(closeCashSession).toHaveBeenCalledExactlyOnceWith(14_400_000);
  });

  it("closes the cash session when the button is pressed", async () => {
    const { screen, closeCashSession } = await renderPanel();
    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await vi.waitFor(() => expect(closeCashSession).toHaveBeenCalledOnce());
  });

  it("asks for the count instead of closing when nothing was typed", async () => {
    const { screen, closeCashSession } = await renderPanel();

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText("Ingresá el efectivo contado.")).toBeVisible();
    expect(closeCashSession).not.toHaveBeenCalled();
  });

  it("does not close while the register has an open sale, with the button disabled", async () => {
    const { screen, closeCashSession } = await renderPanel({ openSale: true });
    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();
    expect(closeCashSession).not.toHaveBeenCalled();
  });

  it("disables the button and ignores a second Enter while the close is in flight", async () => {
    let resolve: (outcome: CloseCashSessionOutcome) => void = () => {};
    const pending = new Promise<CloseCashSessionOutcome>((settle) => {
      resolve = settle;
    });
    const { screen, closeCashSession } = await renderPanel({ outcome: pending });
    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();
    expect(closeCashSession).toHaveBeenCalledOnce();
    resolve(CLOSED);
  });

  it.each(["unavailable", "not_signed_in"] as const)(
    "shows the failure notice when the close answers %s, leaving the button enabled",
    async (kind) => {
      const { screen, onClosed } = await renderPanel({ outcome: { kind } });
      await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

      await userEvent.keyboard("{Enter}");

      await expect.element(screen.getByRole("alert")).toHaveTextContent(FAILED_NOTICE);
      await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeEnabled();
      expect(onClosed).not.toHaveBeenCalled();
    },
  );

  it("shows the failure notice when the close fails", async () => {
    const { screen } = await renderPanel({
      closeCashSession: async () => {
        throw new Error("down");
      },
    });
    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("alert")).toHaveTextContent(FAILED_NOTICE);
  });

  it("marks the failure notice with the alert triangle", async () => {
    const { screen } = await renderPanel({ outcome: { kind: "unavailable" } });
    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("alert")).toBeVisible();
    const icon = noticeIconOf(screen.getByRole("alert").element());
    expect(icon?.getAttribute("class")).toContain("lucide-triangle-alert");
  });

  it("clears the notice as soon as the count changes", async () => {
    const { screen } = await renderPanel({ outcome: { kind: "unavailable" } });
    const field = screen.getByRole("textbox", { name: "Contado" });
    await userEvent.fill(field, "144.000,00");
    await userEvent.keyboard("{Enter}");
    await expect.element(screen.getByText(FAILED_NOTICE).first()).toBeVisible();

    await userEvent.fill(field, "144.100,00");

    await expect.element(screen.getByText(FAILED_NOTICE).first()).not.toBeInTheDocument();
  });

  it("keeps today's notice when the person may no longer close", async () => {
    const { screen } = await renderPanel({ outcome: { kind: "lacks_permission" } });
    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No tenés permiso para cerrar la caja.");
  });

  it("shows the field error when the core refuses the counted cash", async () => {
    const { screen } = await renderPanel({ outcome: { kind: "invalid_counted_cash" } });
    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 31.500,00."))
      .toBeVisible();
  });

  it("shows a placeholder while the balance loads", async () => {
    const { screen } = await renderPanel({ balance: { status: "loading" } });

    const label = screen.getByText("EFECTIVO ESPERADO", { exact: true });
    await expect.element(label).toBeVisible();
    expect(label.element().parentElement?.getAttribute("aria-busy")).toBe("true");
    await expect.element(screen.getByText("Fondo inicial")).not.toBeInTheDocument();
  });

  it("shows a retry when the balance fails", async () => {
    const retry = vi.fn();
    const { screen } = await renderPanel({ balance: { status: "failed", retry } });

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it.each([
    ["loads", { status: "loading" }],
    ["could not be read", { status: "failed", retry: () => {} }],
  ] as const)(
    "keeps Cerrar caja disabled and does not close on Enter while the expected cash %s",
    async (_state, balance) => {
      const { screen, closeCashSession } = await renderPanel({ balance });
      await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "144.000,00");

      await userEvent.keyboard("{Enter}");

      await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();
      expect(closeCashSession).not.toHaveBeenCalled();
    },
  );
});

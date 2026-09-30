import type {
  Authorization,
  CashBalance,
  CloseCashSessionOutcome,
  SignInUser,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../access/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { CashCountScreen } from "./cash-count-screen";

const ADA: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  permission_keys: ["sell_and_charge"],
};
const GRACE: SignedInPerson = {
  user_id: "u2",
  first_name: "Grace",
  permission_keys: ["sell_and_charge"],
};
const OPENED_AT = "2026-09-30T12:02:00.000Z";
const BALANCE: CashBalance = {
  opening_float: 2_000_000,
  cash_sales: 3_500_000,
  change_given: 930_000,
  refunds: 0,
  cash_in: 100_000,
  expenses: 50_000,
  withdrawals: 0,
  expected: 4_620_000,
};
const CLOSED: CloseCashSessionOutcome = {
  kind: "closed",
  session: { id: "s1", expected_cash: 4_620_000, counted_cash: 4_580_000, difference: -40_000 },
};
const SHORT_NOTICE =
  "Faltan $ 400,00. La diferencia se registra con la sesión y no impide cerrarla.";
const OVER_NOTICE =
  "Sobran $ 400,00. La diferencia se registra con la sesión y no impide cerrarla.";
const REQUIRED_MESSAGE = "Ingresá el efectivo contado.";
const INVALID_MESSAGE = "Ingresá un importe válido, por ejemplo 31.500,00.";
const FAILED_NOTICE = "No se pudo cerrar la caja. Probá de nuevo.";

type CloseCashSession = (
  countedCash: number,
  authorization?: Authorization,
) => Promise<CloseCashSessionOutcome>;

async function renderScreen(
  props: {
    person?: SignedInPerson;
    openedBy?: SignedInPerson;
    loadCashBalance?: () => Promise<CashBalance | null | "unavailable">;
    loadAuthorizers?: () => Promise<SignInUser[]>;
    closeCashSession?: CloseCashSession;
  } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const closeCashSession = props.closeCashSession ?? vi.fn<CloseCashSession>(async () => CLOSED);
  const screen = await render(
    <CashCountScreen
      person={props.person ?? ADA}
      openedBy={props.openedBy ?? ADA}
      registerName="Caja 1"
      openedAt={OPENED_AT}
      loadCashBalance={props.loadCashBalance ?? (async () => BALANCE)}
      loadAuthorizers={props.loadAuthorizers ?? (async () => [])}
      closeCashSession={closeCashSession}
    />,
  );
  await expect
    .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
    .toBeVisible();
  return { screen, closeCashSession };
}

type Screen = Awaited<ReturnType<typeof renderScreen>>["screen"];

async function count(screen: Screen, typed: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), typed);
}

async function submit(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
}

function cellOf(screen: Screen, label: string) {
  return screen.getByText(label, { exact: true }).element().closest("div")?.textContent;
}

describe("CashCountScreen", () => {
  it("asks for the counted cash", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Cerrar caja" })).toBeVisible();
    await expect
      .element(screen.getByText("Contá el efectivo que hay en la caja y cargá el total."))
      .toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Efectivo contado" })).toHaveValue("");
    await expect.element(screen.getByText("$", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the cash the register expects beside the count", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("EFECTIVO ESPERADO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Ventas en efectivo")).toBeVisible();
  });

  it("compares nothing until a valid amount is typed", async () => {
    const { screen } = await renderScreen();

    expect(cellOf(screen, "Esperado")).toBe("Esperado$ 46.200,00");
    expect(cellOf(screen, "Contado")).toBe("Contado—");
    expect(cellOf(screen, "Diferencia")).toBe("Diferencia—");
    await expect.element(screen.getByText(SHORT_NOTICE).first()).not.toBeInTheDocument();
  });

  it("follows what is typed, and warns when cash is missing", async () => {
    const { screen } = await renderScreen();

    await count(screen, "45.800,00");

    expect(cellOf(screen, "Contado")).toBe("Contado$ 45.800,00");
    expect(cellOf(screen, "Diferencia")).toBe("Diferencia− $ 400,00");
    await expect.element(screen.getByText(SHORT_NOTICE).first()).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("warns when there is cash left over", async () => {
    const { screen } = await renderScreen();

    await count(screen, "46.600,00");

    expect(cellOf(screen, "Diferencia")).toBe("Diferencia+ $ 400,00");
    await expect.element(screen.getByText(OVER_NOTICE).first()).toBeVisible();
  });

  it("shows no warning when the count matches the expected cash", async () => {
    const { screen } = await renderScreen();

    await count(screen, "46.200,00");

    expect(cellOf(screen, "Diferencia")).toBe("Diferencia$ 0,00");
    await expect.element(screen.getByText("Faltan", { exact: false })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Sobran", { exact: false })).not.toBeInTheDocument();
  });

  it("goes back to comparing nothing when what is typed stops being an amount", async () => {
    const { screen } = await renderScreen();
    await count(screen, "45.800,00");

    await count(screen, "45.800,0a");

    expect(cellOf(screen, "Contado")).toBe("Contado—");
    await expect.element(screen.getByText(SHORT_NOTICE).first()).not.toBeInTheDocument();
  });

  it("closes the session with the counted cash in cents", async () => {
    const { screen, closeCashSession } = await renderScreen();

    await count(screen, "45.800,00");
    await submit(screen);

    await expect
      .poll(() => vi.mocked(closeCashSession).mock.calls)
      .toEqual([[4_580_000, undefined]]);
  });

  it("asks for the counted cash when none was typed, without closing", async () => {
    const { screen, closeCashSession } = await renderScreen();

    await submit(screen);

    await expect.element(screen.getByText(REQUIRED_MESSAGE)).toBeVisible();
    expect(closeCashSession).not.toHaveBeenCalled();
  });

  it("asks for a valid amount when what was typed is not one, without closing", async () => {
    const { screen, closeCashSession } = await renderScreen();

    await count(screen, "abc");
    await submit(screen);

    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
    expect(closeCashSession).not.toHaveBeenCalled();
  });

  it("asks for a valid amount when the core refuses the counted cash", async () => {
    const { screen } = await renderScreen({
      closeCashSession: async () => ({ kind: "invalid_counted_cash" }),
    });

    await count(screen, "45.800,00");
    await submit(screen);

    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
  });

  it("stops the count with the open sale's total and a way to reach it", async () => {
    const { screen } = await renderScreen({
      closeCashSession: async () => ({ kind: "open_sale", total: 3_434_000 }),
    });

    await count(screen, "45.800,00");
    await submit(screen);

    await expect.element(screen.getByText("Hay una venta abierta de $ 34.340,00")).toBeVisible();
    await expect
      .element(screen.getByText("Cobrala o cancelala antes de cerrar la caja."))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Ir a la venta" }));
    expect(screen.router.state.location.pathname).toBe("/session");
  });

  it("says the session could not be closed when the core is unavailable", async () => {
    const { screen } = await renderScreen({
      closeCashSession: async () => ({ kind: "unavailable" }),
    });

    await count(screen, "45.800,00");
    await submit(screen);

    await expect.element(screen.getByText(FAILED_NOTICE).first()).toBeVisible();
  });

  it("says the session could not be closed when the request fails", async () => {
    const { screen } = await renderScreen({
      closeCashSession: () => Promise.reject(new Error("the core connection was replaced")),
    });

    await count(screen, "45.800,00");
    await submit(screen);

    await expect.element(screen.getByText(FAILED_NOTICE).first()).toBeVisible();
  });

  it("says the session could not be closed when nobody is signed in at the core", async () => {
    const { screen } = await renderScreen({
      closeCashSession: async () => ({ kind: "not_signed_in" }),
    });

    await count(screen, "45.800,00");
    await submit(screen);

    await expect.element(screen.getByText(FAILED_NOTICE).first()).toBeVisible();
  });

  it("says the person may not close the session when the core refuses their permission", async () => {
    const { screen } = await renderScreen({
      closeCashSession: async () => ({ kind: "lacks_permission" }),
    });

    await count(screen, "45.800,00");
    await submit(screen);

    await expect
      .element(screen.getByText("No tenés permiso para cerrar la caja.").first())
      .toBeVisible();
  });

  it("clears the notice as soon as the count changes", async () => {
    const { screen } = await renderScreen({
      closeCashSession: async () => ({ kind: "unavailable" }),
    });
    await count(screen, "45.800,00");
    await submit(screen);
    await expect.element(screen.getByText(FAILED_NOTICE).first()).toBeVisible();

    await count(screen, "45.900,00");

    await expect.element(screen.getByText(FAILED_NOTICE).first()).not.toBeInTheDocument();
  });

  it("keeps Cerrar caja disabled until the expected cash is known", async () => {
    await page.viewport(1280, 720);
    onTestFinished(() => page.viewport(414, 896));
    const screen = await render(
      <CashCountScreen
        person={ADA}
        openedBy={ADA}
        registerName={null}
        openedAt={OPENED_AT}
        loadCashBalance={() => new Promise(() => {})}
        loadAuthorizers={async () => []}
        closeCashSession={async () => CLOSED}
      />,
    );

    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();
    expect(cellOf(screen, "Esperado")).toBe("Esperado—");
  });

  it("goes back to the cash screen when Volver is pressed", async () => {
    const { screen, closeCashSession } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.router.state.location.pathname).toBe("/cash");
    expect(closeCashSession).not.toHaveBeenCalled();
  });

  it("asks for nobody's PIN when the person closes their own session", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
  });

  it("asks for nobody's PIN when the person may close another person's session", async () => {
    const { screen } = await renderScreen({
      person: {
        ...ADA,
        permission_keys: ["sell_and_charge", "close_anothers_register_session"],
      },
      openedBy: GRACE,
    });

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
  });

  describe("another person's session", () => {
    async function renderAnothers(closeCashSession?: CloseCashSession) {
      return renderScreen({
        person: ADA,
        openedBy: GRACE,
        loadAuthorizers: async () => [{ id: "u3", first_name: "Sofía" }],
        ...(closeCashSession === undefined ? {} : { closeCashSession }),
      });
    }

    it("asks someone with permission to authorize, saying whose session it is", async () => {
      const { screen } = await renderAnothers();

      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
      await expect
        .element(
          screen.getByText(
            "La sesión es de Grace: cerrarla pide el PIN de alguien con permiso para cerrar la sesión de otra persona.",
          ),
        )
        .toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("keeps Cerrar caja disabled until someone is chosen and types a PIN", async () => {
      const { screen } = await renderAnothers();
      await count(screen, "45.800,00");

      await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
      await userEvent.click(screen.getByRole("option", { name: "Sofía" }));
      await userEvent.type(screen.getByLabelText("PIN"), "1234");

      await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeEnabled();
    });

    it("closes the session with the authorizer the person chose", async () => {
      const closeCashSession = vi.fn<CloseCashSession>(async () => CLOSED);
      const { screen } = await renderAnothers(closeCashSession);
      await count(screen, "45.800,00");
      await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
      await userEvent.click(screen.getByRole("option", { name: "Sofía" }));
      await userEvent.type(screen.getByLabelText("PIN"), "1234");

      await submit(screen);

      await expect
        .poll(() => closeCashSession.mock.calls)
        .toEqual([[4_580_000, { user_id: "u3", pin: "1234" }]]);
    });

    it("shows a refused PIN in the authorization section", async () => {
      const { screen } = await renderAnothers(async () => ({
        kind: "wrong_pin",
        retry_after_seconds: 0,
        attempts_left: 4,
      }));
      await count(screen, "45.800,00");
      await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
      await userEvent.click(screen.getByRole("option", { name: "Sofía" }));
      await userEvent.type(screen.getByLabelText("PIN"), "1234");

      await submit(screen);

      await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    });
  });
});

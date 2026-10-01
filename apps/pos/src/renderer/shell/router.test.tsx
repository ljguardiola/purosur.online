import type { CashBalance, ListedCashMovement } from "@purosur/contracts";
import { createRootRouteWithContext, createRoute, RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Component } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { SignedInPerson } from "../access/signed-in-person";
import { GuardedCashInForm } from "../access/test-support/guarded-cash-in-form";
import type { CashSessionState } from "./cash-session-state";
import type { CoreStatus, Enrollment, RouterContext } from "./router";
import { createRegisterRouter, isSessionScreen, routeFor, routeTree } from "./router";

type RoutePath =
  | "/"
  | "/sign-in"
  | "/session"
  | "/cash"
  | "/cash-count"
  | "/charge"
  | "/locked"
  | "/locked-close"
  | "/enroll"
  | "/starting"
  | "/core-down"
  | "/pin-code-redemption"
  | "/first-sign-in";
type RenderedScreen = Awaited<ReturnType<typeof render>>;

const CORE_DOWN_TITLE = "Esperá un momento";
const SIGNED_IN_TITLE = "¿Qué querés hacer?";
const SIGN_IN_TITLE = "¿Quién abre la caja?";
const SESSION_TITLE = "Venta en curso";
const PERSON: SignedInPerson = { user_id: "u1", first_name: "Ada", permission_keys: [] };
const OPENER: SignedInPerson = {
  user_id: "u2",
  first_name: "Grace",
  permission_keys: ["sell_and_charge"],
};
const NO_SESSION: CashSessionState = { status: "none" };
const OPEN_SESSION: CashSessionState = {
  status: "open",
  id: "s1",
  openedAt: "2026-09-30T12:02:00.000Z",
  openedBy: OPENER,
};
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
const BRAND_LOGO_ALT = "Puro Sur";
const ENROLLMENT_TITLE = "Dar de alta esta caja";
const PIN_REDEMPTION_TITLE = "Cambiar el PIN";
const FIRST_SIGN_IN_TITLE = "Ingresar por primera vez";
const OUTER_BOUNDARY_TEXT = "caught outside the router";
const ROUTER_DEFAULT_ERROR_TEXT = "Something went wrong!";

const screenFor: Record<
  RoutePath,
  (screen: RenderedScreen) => ReturnType<RenderedScreen["getByText"]>
> = {
  "/": (screen) => screen.getByRole("heading", { name: SIGNED_IN_TITLE }),
  "/sign-in": (screen) => screen.getByRole("heading", { name: SIGN_IN_TITLE }),
  "/session": (screen) => screen.getByRole("heading", { name: SESSION_TITLE }),
  "/cash": (screen) => screen.getByRole("heading", { name: "Caja" }),
  "/cash-count": (screen) => screen.getByRole("heading", { name: "Cerrar caja" }),
  "/charge": (screen) => screen.getByRole("heading", { name: "Elegí el medio de pago" }),
  "/locked": (screen) => screen.getByRole("heading", { name: "Caja bloqueada" }),
  "/locked-close": (screen) => screen.getByRole("heading", { name: "¿Quién cierra la caja?" }),
  "/enroll": (screen) => screen.getByRole("heading", { name: ENROLLMENT_TITLE }),
  "/starting": (screen) => screen.getByRole("img", { name: BRAND_LOGO_ALT }),
  "/core-down": (screen) => screen.getByText(CORE_DOWN_TITLE),
  "/pin-code-redemption": (screen) => screen.getByRole("heading", { name: PIN_REDEMPTION_TITLE }),
  "/first-sign-in": (screen) => screen.getByRole("heading", { name: FIRST_SIGN_IN_TITLE }),
};

function contextWith(
  coreStatus: CoreStatus,
  enrollment: Enrollment = "enrolled",
  person: SignedInPerson | null = PERSON,
  signOut: () => void = () => {},
  cashSession: CashSessionState = NO_SESSION,
): RouterContext {
  return {
    coreStatus,
    enrollment,
    person: person ?? undefined,
    cashSession,
    openCashSession: async () => ({ kind: "unavailable" }),
    closeCashSession: async () => ({ kind: "unavailable" }),
    closeLockedCashSession: async () => ({ kind: "unavailable" }),
    identifyLockedCloser: async () => ({ kind: "unavailable" }),
    cashBalance: async () => "unavailable",
    cashMovements: async () => "unavailable",
    recordCashMovement: async () => ({ kind: "unavailable" }),
    enroll: async () => ({ kind: "enrolled" }),
    registerName: async () => null,
    signInUsers: async () => [{ id: "u1", first_name: "Ada" }],
    authorizers: async () => [{ id: "u2", first_name: "Grace" }],
    signIn: async () => ({ kind: "signed_in", person: PERSON }),
    signOut,
    redeemPinCode: async () => ({ kind: "redeemed" }),
    signInLookup: async () => ({ kind: "not_found" }),
    requestFirstPinCode: async () => ({ kind: "sent" }),
    firstSignIn: async () => ({ kind: "signed_in", person: PERSON }),
    currentSale: async () => null,
    chargeSaleInCash: async () => ({ kind: "unavailable" }),
    scanProduct: async () => ({ kind: "unknown_code" }),
    searchProducts: async () => ({ kind: "results", products: [], more: false }),
    addProduct: async () => ({ kind: "product_unavailable" }),
    refreshCashSession: async () => {},
  };
}

function routerAt(
  path: RoutePath,
  coreStatus: CoreStatus,
  enrollment?: Enrollment,
  person?: SignedInPerson | null,
  cashSession?: CashSessionState,
) {
  return createRegisterRouter(
    routeTree,
    contextWith(coreStatus, enrollment, person, undefined, cashSession),
    path,
  );
}

const screenFailure = new Error("screen failed to render");

class OuterErrorBoundary extends Component<
  { children: ReactNode; onCatch: (error: unknown) => void },
  { error: unknown }
> {
  override state = { error: undefined };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown) {
    this.props.onCatch(error);
  }

  override render() {
    return this.state.error === undefined ? this.props.children : <p>{OUTER_BOUNDARY_TEXT}</p>;
  }
}

function FailingScreen(): ReactNode {
  throw screenFailure;
}

describe("routeFor", () => {
  it.each<{
    coreStatus: CoreStatus;
    enrollment: Enrollment;
    person: SignedInPerson | undefined;
    cashSession?: CashSessionState;
    route: RoutePath;
  }>([
    { coreStatus: "up", enrollment: "enrolled", person: undefined, route: "/sign-in" },
    { coreStatus: "up", enrollment: "enrolled", person: PERSON, route: "/" },
    { coreStatus: "up", enrollment: "not_enrolled", person: PERSON, route: "/enroll" },
    { coreStatus: "up", enrollment: "unknown", person: PERSON, route: "/starting" },
    { coreStatus: "starting", enrollment: "enrolled", person: PERSON, route: "/starting" },
    { coreStatus: "down", enrollment: "enrolled", person: PERSON, route: "/core-down" },
    {
      coreStatus: "up",
      enrollment: "enrolled",
      person: undefined,
      cashSession: { status: "unknown" },
      route: "/starting",
    },
    {
      coreStatus: "up",
      enrollment: "enrolled",
      person: PERSON,
      cashSession: { status: "unknown" },
      route: "/starting",
    },
    {
      coreStatus: "up",
      enrollment: "enrolled",
      person: undefined,
      cashSession: OPEN_SESSION,
      route: "/locked",
    },
    {
      coreStatus: "up",
      enrollment: "enrolled",
      person: PERSON,
      cashSession: OPEN_SESSION,
      route: "/session",
    },
    {
      coreStatus: "up",
      enrollment: "not_enrolled",
      person: undefined,
      cashSession: OPEN_SESSION,
      route: "/enroll",
    },
    {
      coreStatus: "starting",
      enrollment: "enrolled",
      person: undefined,
      cashSession: OPEN_SESSION,
      route: "/starting",
    },
    {
      coreStatus: "down",
      enrollment: "enrolled",
      person: undefined,
      cashSession: OPEN_SESSION,
      route: "/core-down",
    },
    {
      coreStatus: "up",
      enrollment: "enrolled",
      person: undefined,
      cashSession: { status: "unavailable" },
      route: "/core-down",
    },
    {
      coreStatus: "up",
      enrollment: "enrolled",
      person: PERSON,
      cashSession: { status: "unavailable" },
      route: "/core-down",
    },
  ])(
    "goes to $route when the core is $coreStatus, the installation $enrollment, the cash session $cashSession.status and a person may be signed in",
    ({ coreStatus, enrollment, person, cashSession = NO_SESSION, route }) => {
      expect(routeFor({ coreStatus, enrollment, person, cashSession })).toBe(route);
    },
  );
});

beforeEach(() => page.viewport(1280, 720));

afterEach(() => page.viewport(414, 896));
describe("isSessionScreen", () => {
  it("is true for the screens reached while a session is open, and false for the others", () => {
    expect(["/session", "/cash", "/cash-count", "/charge"].map(isSessionScreen)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(["/", "/sign-in", "/starting", "/core-down", "/enroll"].map(isSessionScreen)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("the register's router", () => {
  it.each<{
    path: RoutePath;
    coreStatus: CoreStatus;
    enrollment: Enrollment;
    person?: null;
    cashSession?: CashSessionState;
    redirectedTo: RoutePath;
  }>([
    { path: "/", coreStatus: "down", enrollment: "enrolled", redirectedTo: "/core-down" },
    {
      path: "/",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/sign-in",
    },
    { path: "/sign-in", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    {
      path: "/sign-in",
      coreStatus: "up",
      enrollment: "not_enrolled",
      person: null,
      redirectedTo: "/enroll",
    },
    {
      path: "/enroll",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/sign-in",
    },
    {
      path: "/sign-in",
      coreStatus: "down",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/core-down",
    },
    { path: "/starting", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    {
      path: "/core-down",
      coreStatus: "starting",
      enrollment: "enrolled",
      redirectedTo: "/starting",
    },
    { path: "/", coreStatus: "up", enrollment: "not_enrolled", redirectedTo: "/enroll" },
    { path: "/enroll", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    { path: "/", coreStatus: "up", enrollment: "unknown", redirectedTo: "/starting" },
    { path: "/enroll", coreStatus: "down", enrollment: "not_enrolled", redirectedTo: "/core-down" },
    { path: "/pin-code-redemption", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    {
      path: "/pin-code-redemption",
      coreStatus: "up",
      enrollment: "not_enrolled",
      person: null,
      redirectedTo: "/enroll",
    },
    {
      path: "/pin-code-redemption",
      coreStatus: "down",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/core-down",
    },
    {
      path: "/pin-code-redemption",
      coreStatus: "up",
      enrollment: "unknown",
      person: null,
      redirectedTo: "/starting",
    },
    { path: "/first-sign-in", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    {
      path: "/first-sign-in",
      coreStatus: "up",
      enrollment: "not_enrolled",
      person: null,
      redirectedTo: "/enroll",
    },
    {
      path: "/first-sign-in",
      coreStatus: "down",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/core-down",
    },
    {
      path: "/first-sign-in",
      coreStatus: "up",
      enrollment: "unknown",
      person: null,
      redirectedTo: "/starting",
    },
    {
      path: "/",
      coreStatus: "up",
      enrollment: "enrolled",
      cashSession: OPEN_SESSION,
      redirectedTo: "/session",
    },
    {
      path: "/sign-in",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      cashSession: OPEN_SESSION,
      redirectedTo: "/locked",
    },
    {
      path: "/pin-code-redemption",
      coreStatus: "up",
      enrollment: "enrolled",
      cashSession: OPEN_SESSION,
      redirectedTo: "/session",
    },
    {
      path: "/starting",
      coreStatus: "up",
      enrollment: "enrolled",
      cashSession: OPEN_SESSION,
      redirectedTo: "/session",
    },
    { path: "/session", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    { path: "/cash", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    { path: "/cash-count", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    { path: "/charge", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    {
      path: "/charge",
      coreStatus: "up",
      enrollment: "enrolled",
      cashSession: { status: "unknown" },
      redirectedTo: "/starting",
    },
    {
      path: "/cash",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/sign-in",
    },
    {
      path: "/cash-count",
      coreStatus: "down",
      enrollment: "enrolled",
      cashSession: OPEN_SESSION,
      redirectedTo: "/core-down",
    },
    {
      path: "/cash",
      coreStatus: "up",
      enrollment: "enrolled",
      cashSession: { status: "unknown" },
      redirectedTo: "/starting",
    },
    {
      path: "/session",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/sign-in",
    },
    {
      path: "/first-sign-in",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      cashSession: OPEN_SESSION,
      redirectedTo: "/locked",
    },
    {
      path: "/session",
      coreStatus: "up",
      enrollment: "enrolled",
      cashSession: { status: "unknown" },
      redirectedTo: "/starting",
    },
    {
      path: "/",
      coreStatus: "up",
      enrollment: "enrolled",
      cashSession: { status: "unknown" },
      redirectedTo: "/starting",
    },
    {
      path: "/sign-in",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      cashSession: { status: "unknown" },
      redirectedTo: "/starting",
    },
    {
      path: "/session",
      coreStatus: "down",
      enrollment: "enrolled",
      cashSession: OPEN_SESSION,
      redirectedTo: "/core-down",
    },
    {
      path: "/sign-in",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      cashSession: { status: "unavailable" },
      redirectedTo: "/core-down",
    },
    {
      path: "/session",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      cashSession: OPEN_SESSION,
      redirectedTo: "/locked",
    },
    {
      path: "/cash",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      cashSession: OPEN_SESSION,
      redirectedTo: "/locked",
    },
    {
      path: "/cash-count",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      cashSession: OPEN_SESSION,
      redirectedTo: "/locked",
    },
    {
      path: "/locked",
      coreStatus: "up",
      enrollment: "enrolled",
      cashSession: OPEN_SESSION,
      redirectedTo: "/session",
    },
    { path: "/locked", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    {
      path: "/locked-close",
      coreStatus: "up",
      enrollment: "enrolled",
      cashSession: OPEN_SESSION,
      redirectedTo: "/session",
    },
    {
      path: "/locked-close",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/sign-in",
    },
    {
      path: "/locked",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/sign-in",
    },
  ])(
    "redirects away from $path when the core is $coreStatus and the installation $enrollment",
    async ({ path, coreStatus, enrollment, person, cashSession, redirectedTo }) => {
      const router = routerAt(
        path,
        coreStatus,
        enrollment,
        person === null ? null : PERSON,
        cashSession,
      );

      const screen = await render(<RouterProvider router={router} />);

      await expect.element(screenFor[redirectedTo](screen)).toBeVisible();
      await expect.element(screenFor[path](screen)).not.toBeInTheDocument();
    },
  );

  it("renders the register locked in the opener's name while a session is open and nobody is signed in", async () => {
    const router = routerAt("/locked", "up", "enrolled", null, OPEN_SESSION);

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: "Caja bloqueada" })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Grace" })).toBeVisible();
    await expect.element(screen.getByText("Sesión abierta 09:02")).toBeVisible();
  });

  it("renders the enrollment screen while the installation isn't enrolled", async () => {
    const router = routerAt("/enroll", "up", "not_enrolled");

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: ENROLLMENT_TITLE })).toBeVisible();
  });

  it("renders the sign-in screen while enrolled and nobody is signed in", async () => {
    const router = routerAt("/sign-in", "up", "enrolled", null);

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeVisible();
  });

  it("renders the no-session screen for the person from the router context", async () => {
    const router = routerAt("/", "up");

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("navigation").getByText("Ada")).toBeVisible();
  });

  it("renders the open-session screen for the person who opened the session", async () => {
    const router = routerAt("/session", "up", "enrolled", OPENER, OPEN_SESSION);

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    await expect.element(screen.getByText("Grace")).toBeVisible();
    await expect.element(screen.getByText("Sesión abierta 09:02")).toBeVisible();
  });

  it("reads the sale in progress and scans products through the core", async () => {
    const reads: string[] = [];
    const scans: string[] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", OPENER, undefined, OPEN_SESSION),
        currentSale: async () => {
          reads.push("read");
          return null;
        },
        scanProduct: async (code) => {
          scans.push(code);
          return { kind: "unknown_code" };
        },
      },
      "/session",
    );
    const screen = await render(<RouterProvider router={router} />);

    await screen.getByRole("combobox", { name: "Producto" }).fill("7790001");
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => scans).toEqual(["7790001"]);
    expect(reads).toEqual(["read"]);
  });

  it("reads the sale and charges it in cash through the core on the charge screen", async () => {
    const charges: [string, number][] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", OPENER, undefined, OPEN_SESSION),
        currentSale: async () => ({
          id: "sale-1",
          lines: [
            {
              id: "line-1",
              product_id: "p1",
              product_name: "Yerba mate 1 kg",
              quantity: 1,
              list_unit_price: 238_000,
              discount_amount: 0,
              promotion: null,
              line_total: 238_000,
            },
          ],
          total: 238_000,
        }),
        chargeSaleInCash: async (saleId, tendered) => {
          charges.push([saleId, tendered]);
          return { kind: "completed", sale_id: saleId, total: 238_000, tendered, change: 0 };
        },
      },
      "/charge",
    );
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByText("Efectivo", { exact: true }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
      "2.380,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Completar venta" }));

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    expect(charges).toEqual([["sale-1", 238_000]]);
  });

  it("reads the cash session again when the charge screen finds it is no longer valid", async () => {
    const refreshed = vi.fn(async () => {});
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", OPENER, undefined, OPEN_SESSION),
        currentSale: async () => ({
          id: "sale-1",
          lines: [
            {
              id: "line-1",
              product_id: "p1",
              product_name: "Yerba mate 1 kg",
              quantity: 1,
              list_unit_price: 238_000,
              discount_amount: 0,
              promotion: null,
              line_total: 238_000,
            },
          ],
          total: 238_000,
        }),
        chargeSaleInCash: async () => ({ kind: "no_open_session" }),
        refreshCashSession: refreshed,
      },
      "/charge",
    );
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByText("Efectivo", { exact: true }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
      "2.380,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Completar venta" }));

    await expect.poll(() => refreshed.mock.calls.length).toBe(1);
  });

  it("reads the cash session again when the sale screen finds it is no longer valid", async () => {
    const refreshed = vi.fn(async () => {});
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", OPENER, undefined, OPEN_SESSION),
        scanProduct: async () => ({ kind: "no_open_session" }),
        refreshCashSession: refreshed,
      },
      "/session",
    );
    const screen = await render(<RouterProvider router={router} />);

    await screen.getByRole("combobox", { name: "Producto" }).fill("7790001");
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => refreshed.mock.calls.length).toBe(1);
  });

  it("renders the cash screen for the open session with the expected cash and the movements from the context", async () => {
    const opening: ListedCashMovement = {
      id: "m1",
      type: "OPENING",
      amount: 2_000_000,
      reason: null,
      occurred_at: "2026-09-30T12:02:00.000Z",
      actor: { user_id: "u2", first_name: "Grace" },
      authorized_by: null,
    };
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", OPENER, undefined, OPEN_SESSION),
        cashBalance: async () => BALANCE,
        cashMovements: async () => [opening],
      },
      "/cash",
    );

    const screen = await render(<RouterProvider router={router} />);

    await expect
      .element(screen.getByRole("heading", { name: "Movimientos de efectivo", exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("Grace", { exact: true }).first()).toBeVisible();
    await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();
    await expect
      .element(
        screen
          .getByRole("table", { name: "Movimientos de la sesión" })
          .getByText("Apertura de sesión", { exact: true }),
      )
      .toBeVisible();
  });

  it("records a movement through the router context", async () => {
    const recorded: [string, string][] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith(
          "up",
          "enrolled",
          { ...OPENER, permission_keys: ["record_cash_in"] },
          undefined,
          { ...OPEN_SESSION, openedBy: { ...OPENER, permission_keys: ["record_cash_in"] } },
        ),
        cashBalance: async () => BALANCE,
        cashMovements: async () => [],
        recordCashMovement: async (input) => {
          recorded.push([input.kind, input.reason]);
          return { kind: "unavailable" };
        },
      },
      "/cash",
    );
    const screen = await render(<RouterProvider router={router} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar movimiento", exact: true }),
    );

    await userEvent.fill(screen.getByRole("textbox", { name: "Importe" }), "500");
    await userEvent.fill(screen.getByRole("textbox", { name: "Motivo" }), "Cambio");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.poll(() => recorded).toEqual([["CASH_IN", "Cambio"]]);
  });

  it("closes the session through the router context with the session it is showing", async () => {
    const closed: [string, string, number][] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", OPENER, undefined, OPEN_SESSION),
        cashBalance: async () => BALANCE,
        closeCashSession: async (person, sessionId, countedCash) => {
          closed.push([person.user_id, sessionId, countedCash]);
          return { kind: "unavailable" };
        },
      },
      "/cash-count",
    );
    const screen = await render(<RouterProvider router={router} />);
    await expect
      .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
      .toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await expect.poll(() => closed).toEqual([["u2", "s1", 4_580_000]]);
  });

  it.each([
    ["/cash-count", false],
    ["/cash-count?leaving=true", true],
    ["/cash-count?leaving=yes", false],
  ])("closes %s with leaving=%s", async (path, leaving) => {
    const closed: boolean[] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", OPENER, undefined, OPEN_SESSION),
        cashBalance: async () => BALANCE,
        closeCashSession: async (
          _person,
          _sessionId,
          _countedCash,
          _authorization,
          leavingAfter,
        ) => {
          closed.push(leavingAfter);
          return { kind: "unavailable" };
        },
      },
      path,
    );
    const screen = await render(<RouterProvider router={router} />);
    await expect
      .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
      .toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await expect.poll(() => closed).toEqual([leaving]);
  });

  it("asks for an authorizer when the signed-in person is not the one who opened the session", async () => {
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", PERSON, undefined, OPEN_SESSION),
        cashBalance: async () => BALANCE,
      },
      "/cash-count",
    );

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
  });

  it("names the register in the open-session screen's eyebrow", async () => {
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", OPENER, undefined, OPEN_SESSION),
        registerName: async () => "Caja 1",
      },
      "/session",
    );

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
  });

  it("opens the cash session for the person through the router context", async () => {
    const opened: [string, number][] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", { ...PERSON, permission_keys: ["sell_and_charge"] }),
        openCashSession: async (person, openingFloat) => {
          opened.push([person.user_id, openingFloat]);
          return { kind: "unavailable" };
        },
      },
      "/",
    );
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));

    await expect.poll(() => opened).toEqual([["u1", 10_000]]);
  });

  it("signs the person out through the router context once leaving is confirmed", async () => {
    const signOut = vi.fn();
    const router = createRegisterRouter(
      routeTree,
      contextWith("up", "enrolled", PERSON, signOut),
      "/",
    );
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole("button", { name: "Salir" }));
    await userEvent.click(
      screen
        .getByRole("dialog", { name: "¿Salir de la caja?" })
        .getByRole("button", { name: "Salir" }),
    );

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("names the register in the signed-in screen's eyebrow", async () => {
    const router = createRegisterRouter(
      routeTree,
      { ...contextWith("up"), registerName: async () => "Caja 1" },
      "/",
    );

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByText("Caja 1 · Sin sesión abierta")).toBeVisible();
  });

  it("leaves the register's name out of the sign-in screen's eyebrow when reading it fails", async () => {
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", null),
        registerName: () => Promise.reject(new Error("the core connection was replaced")),
      },
      "/sign-in",
    );

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByText("Sin sesión abierta", { exact: true })).toBeVisible();
  });

  it("shows the core-down notice without waiting for the register's name", async () => {
    const router = createRegisterRouter(
      routeTree,
      { ...contextWith("down"), registerName: () => new Promise<string | null>(() => {}) },
      "/core-down",
    );

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();
  });

  it("renders the PIN code redemption screen while enrolled and nobody is signed in", async () => {
    const router = routerAt("/pin-code-redemption", "up", "enrolled", null);

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: PIN_REDEMPTION_TITLE })).toBeVisible();
  });

  it("reaches the PIN code redemption screen from the sign-in screen and comes back", async () => {
    const router = routerAt("/sign-in", "up", "enrolled", null);
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.click(
      screen.getByRole("link", { name: "Tengo un código para cambiar el PIN" }),
    );
    await expect.element(screen.getByRole("heading", { name: PIN_REDEMPTION_TITLE })).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Volver" }));

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
  });

  it("reaches the PIN code redemption screen from the locked register and comes back", async () => {
    const router = routerAt("/locked", "up", "enrolled", null, OPEN_SESSION);
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.click(
      screen.getByRole("link", { name: "Tengo un código para cambiar el PIN" }),
    );
    await expect.element(screen.getByRole("heading", { name: PIN_REDEMPTION_TITLE })).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Volver" }));

    await expect.element(screen.getByRole("heading", { name: "Caja bloqueada" })).toBeVisible();
  });

  it("reaches who closes the locked register from the locked register and comes back", async () => {
    const router = routerAt("/locked", "up", "enrolled", null, OPEN_SESSION);
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole("link", { name: "Otra persona cierra la caja" }));
    await expect
      .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
      .toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Volver" }));

    await expect.element(screen.getByRole("heading", { name: "Caja bloqueada" })).toBeVisible();
  });

  it("identifies and closes the locked register's session through the router context with the session it is showing", async () => {
    const identified: unknown[] = [];
    const closed: unknown[] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", null, undefined, OPEN_SESSION),
        authorizers: async () => [{ id: "u3", first_name: "Sofía" }],
        cashBalance: async () => BALANCE,
        identifyLockedCloser: async (closer) => {
          identified.push(closer);
          return { kind: "identified", person: { user_id: "u3", first_name: "Sofía" } };
        },
        closeLockedCashSession: async (sessionId, countedCash, closer) => {
          closed.push([sessionId, countedCash, closer]);
          return { kind: "unavailable" };
        },
      },
      "/locked-close",
    );
    const screen = await render(<RouterProvider router={router} />);
    await userEvent.click(screen.getByText("Sofía", { exact: true }));
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await expect
      .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
      .toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    expect(identified).toEqual([{ user_id: "u3", pin: "1234" }]);
    await expect.poll(() => closed).toEqual([["s1", 4_580_000, { user_id: "u3", pin: "1234" }]]);
  });

  it("reaches the PIN code redemption screen from the locked register once the opener is locked out", async () => {
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", null, undefined, OPEN_SESSION),
        signIn: async () => ({ kind: "locked", consecutive_failures: 8 }),
      },
      "/locked",
    );
    const screen = await render(<RouterProvider router={router} />);
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Retomar" }));

    await userEvent.click(screen.getByRole("button", { name: "Tengo un código" }));

    await expect.element(screen.getByRole("heading", { name: PIN_REDEMPTION_TITLE })).toBeVisible();
  });

  it("redeems through the context's callback and returns to the sign-in screen from the success message", async () => {
    const redeemed: string[] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", null),
        redeemPinCode: async (code, pin) => {
          redeemed.push(`${code}/${pin}`);
          return { kind: "redeemed" };
        },
      },
      "/pin-code-redemption",
    );
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.fill(screen.getByRole("textbox", { name: "Código" }), "K7QM2XPA3DTR4HWN");
    await userEvent.fill(screen.getByLabelText("PIN nuevo, de al menos 6 dígitos"), "482915");
    await userEvent.fill(screen.getByLabelText("Repetí el PIN nuevo"), "482915");
    await userEvent.click(screen.getByRole("button", { name: "Guardar el PIN nuevo" }));
    await userEvent.click(screen.getByRole("button", { name: "Volver al inicio" }));

    expect(redeemed).toEqual(["K7QM2XPA3DTR4HWN/482915"]);
    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
  });

  it("renders the first sign-in screen while enrolled and nobody is signed in", async () => {
    const router = routerAt("/first-sign-in", "up", "enrolled", null);

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screenFor["/first-sign-in"](screen)).toBeVisible();
  });

  it("reaches the first sign-in screen from the sign-in screen and comes back", async () => {
    const router = routerAt("/sign-in", "up", "enrolled", null);
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole("link", { name: "Ingresar por primera vez" }));
    await expect.element(screenFor["/first-sign-in"](screen)).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Volver" }));

    await expect.element(screenFor["/sign-in"](screen)).toBeVisible();
  });

  it("looks the email up and signs in through the context's callbacks", async () => {
    const calls: string[] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", null),
        signInLookup: async (email) => {
          calls.push(`lookup ${email}`);
          return { kind: "has_pin", user: { id: "u1", first_name: "Ada" } };
        },
        firstSignIn: async (userId, pin) => {
          calls.push(`sign-in ${userId}/${pin}`);
          return { kind: "signed_in", person: PERSON };
        },
      },
      "/first-sign-in",
    );
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.type(screen.getByRole("textbox", { name: "Correo" }), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.type(screen.getByLabelText("PIN"), "0042");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await vi.waitFor(() => expect(calls).toEqual(["lookup ada@example.com", "sign-in u1/0042"]));
  });

  it("emails a first PIN code, redeems it and signs in through the context's callbacks", async () => {
    const calls: string[] = [];
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", null),
        signInLookup: async () => ({ kind: "no_pin", user: { id: "u1", first_name: "Ada" } }),
        requestFirstPinCode: async (userId) => {
          calls.push(`request ${userId}`);
          return { kind: "sent" };
        },
        redeemPinCode: async (code, pin) => {
          calls.push(`redeem ${code}/${pin}`);
          return { kind: "redeemed" };
        },
        firstSignIn: async (userId, pin) => {
          calls.push(`sign-in ${userId}/${pin}`);
          return { kind: "signed_in", person: PERSON };
        },
      },
      "/first-sign-in",
    );
    const screen = await render(<RouterProvider router={router} />);

    await userEvent.type(screen.getByRole("textbox", { name: "Correo" }), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(screen.getByRole("button", { name: "Mandarme un código por correo" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Código" }), "K7QM2XPA3DTR4HWN");
    await userEvent.fill(screen.getByLabelText("PIN nuevo, de al menos 6 dígitos"), "482915");
    await userEvent.fill(screen.getByLabelText("Repetí el PIN nuevo"), "482915");
    await userEvent.click(screen.getByRole("button", { name: "Guardar y entrar" }));

    await vi.waitFor(() =>
      expect(calls).toEqual(["request u1", "redeem K7QM2XPA3DTR4HWN/482915", "sign-in u1/482915"]),
    );
  });

  it("lets an error thrown while rendering a screen propagate past the router", async () => {
    const rootRoute = createRootRouteWithContext<RouterContext>()();
    const failingRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: FailingScreen,
    });
    const router = createRegisterRouter(
      rootRoute.addChildren([failingRoute]),
      contextWith("up"),
      "/",
    );

    const onCatch = vi.fn();

    const screen = await render(
      <OuterErrorBoundary onCatch={onCatch}>
        <RouterProvider router={router} />
      </OuterErrorBoundary>,
    );

    await expect.element(screen.getByText(OUTER_BOUNDARY_TEXT)).toBeVisible();
    await expect.element(screen.getByText(ROUTER_DEFAULT_ERROR_TEXT)).not.toBeInTheDocument();
    expect(onCatch).toHaveBeenCalledWith(screenFailure);
  });

  it("hands a screen the loader of the people who can authorize", async () => {
    const rootRoute = createRootRouteWithContext<RouterContext>()();
    function GuardedScreen() {
      const { authorizers } = rootRoute.useRouteContext();
      return (
        <GuardedCashInForm
          person={{ user_id: "u1", first_name: "Tomás", permission_keys: [] }}
          loadAuthorizers={authorizers}
          submit={async () => ({ kind: "performed", authorized_by: null })}
        />
      );
    }
    const guardedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: GuardedScreen,
    });
    const router = createRegisterRouter(
      rootRoute.addChildren([guardedRoute]),
      contextWith("up"),
      "/",
    );

    const screen = await render(<RouterProvider router={router} />);
    await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));

    await expect.element(screen.getByRole("option", { name: "Grace" })).toBeVisible();
  });
});

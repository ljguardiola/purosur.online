import { createRootRouteWithContext, createRoute, RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Component } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { SignedInPerson } from "../access/signed-in-person";
import { GuardedCashInForm } from "../access/test-support/guarded-cash-in-form";
import type { CashSessionState } from "./cash-session-state";
import type { CoreStatus, Enrollment, RouterContext } from "./router";
import { createRegisterRouter, routeFor, routeTree } from "./router";

type RoutePath =
  | "/"
  | "/sign-in"
  | "/session"
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
  openedAt: "2026-09-30T12:02:00.000Z",
  openedBy: OPENER,
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
    enroll: async () => ({ kind: "enrolled" }),
    registerName: async () => null,
    signInUsers: async () => [{ id: "u1", first_name: "Ada" }],
    authorizers: async () => [{ id: "u2", first_name: "Grace" }],
    signIn: async () => ({ kind: "signed_in", person: PERSON }),
    signOut,
    redeemPinCode: async () => ({ kind: "redeemed" }),
    signInLookup: async () => ({ kind: "not_found" }),
    firstSignIn: async () => ({ kind: "signed_in", person: PERSON }),
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
      route: "/session",
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
      redirectedTo: "/session",
    },
    {
      path: "/pin-code-redemption",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
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
      redirectedTo: "/session",
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
    const router = routerAt("/session", "up", "enrolled", null, OPEN_SESSION);

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    await expect.element(screen.getByText("Grace")).toBeVisible();
    await expect.element(screen.getByText("Sesión abierta 09:02")).toBeVisible();
  });

  it("names the register in the open-session screen's eyebrow", async () => {
    const router = createRegisterRouter(
      routeTree,
      {
        ...contextWith("up", "enrolled", null, undefined, OPEN_SESSION),
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

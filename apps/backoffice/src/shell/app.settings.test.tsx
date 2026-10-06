import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

test("shows the Roles item in the rail, only for an Administrator, linking to the roles list", async () => {
  window.history.pushState(null, "", "/account");
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Roles" })).toBeVisible();
});

test("hides the Roles item in the rail for a non-Administrator", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();
});

test("following the sidebar's Roles item opens the roles list, with Config and Roles active", async () => {
  window.history.pushState(null, "", "/account");
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Roles" }));

  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/roles");
  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const rolesItem = screen.getByRole("link", { name: "Roles" }).element() as HTMLAnchorElement;
  expect(rolesItem.getAttribute("aria-current")).toBe("page");
});

test("shows the Cajas registradoras item in the rail for a user holding enroll_register_devices, linking to its screen", async () => {
  window.history.pushState(null, "", "/account");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["registers_area"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Cajas registradoras" })).toBeVisible();
});

test("hides the Cajas registradoras item in the rail for a user without enroll_register_devices", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Cajas registradoras" }).query()).toBeNull();
});

test("following the sidebar's Cajas registradoras item opens the registers list, with Config and Cajas registradoras active", async () => {
  window.history.pushState(null, "", "/account");
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.registersListScreen.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Cajas registradoras" }));

  await expect
    .element(screen.getByRole("heading", { name: "Cajas registradoras", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/registers");
  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const registersItem = screen
    .getByRole("link", { name: "Cajas registradoras" })
    .element() as HTMLAnchorElement;
  expect(registersItem.getAttribute("aria-current")).toBe("page");
});

test("redirects a typed /registers to Mi cuenta for a user without enroll_register_devices, without calling its API", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/registers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.registersListScreen.fetchRegisters).not.toHaveBeenCalled();
});

test("shows the Sucursal item in the rail for a user holding configure_branch, linking to its screen", async () => {
  window.history.pushState(null, "", "/account");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["branch_area"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Sucursal" })).toBeVisible();
});

test("hides the Sucursal item in the rail for a user without configure_branch", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sucursal" }).query()).toBeNull();
});

test("following the sidebar's Sucursal item opens the branch settings screen, with Config and Sucursal active", async () => {
  window.history.pushState(null, "", "/account");
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.branchSettingsScreen.fetchBranchSettings).mockResolvedValue({
    kind: "ok",
    value: {
      address: "",
      whatsappNumber: "",
      instagramHandle: "",
      hours: {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      },
      expiringLotAlertDays: 30,
      unreviewedPriceAlertDays: 30,
      goodConditionReturnDays: 15,
      version: 1,
    },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Sucursal" }));

  await expect.element(screen.getByRole("heading", { name: "Sucursal", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/location-settings");
  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const branchItem = screen.getByRole("link", { name: "Sucursal" }).element() as HTMLAnchorElement;
  expect(branchItem.getAttribute("aria-current")).toBe("page");
});

test("redirects a typed /location-settings to Mi cuenta for a user without configure_branch, without calling its API", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/location-settings");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.branchSettingsScreen.fetchBranchSettings).not.toHaveBeenCalled();
});

test("opens the role editor modal, over the Roles list, from the Nuevo rol button, without submitting it", async () => {
  window.history.pushState(null, "", "/roles");
  const services = createAppServices();
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));

  await expect.element(screen.getByRole("dialog").getByText("Nuevo rol")).toBeVisible();
  expect(window.location.pathname).toBe("/roles");
  expect(services.rolesListScreen.roleEditorModal?.createRole).not.toHaveBeenCalled();
});

test("opens the role editor modal for editing, from a role's pencil action, with Roles still the active sidebar item", async () => {
  const services = createAppServices();
  const roleEditorModal = services.rolesListScreen.roleEditorModal;
  if (!roleEditorModal) {
    throw new Error("test setup: createAppServices always fills roleEditorModal");
  }
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "role-stock",
        name: "Depósito",
        isAdministrator: false,
        permissionKeys: [],
        userCount: 0,
        mayEdit: true,
      },
    ],
  });
  vi.mocked(roleEditorModal.fetchRole).mockResolvedValue({
    kind: "ok",
    value: {
      id: "role-stock",
      name: "Depósito",
      isAdministrator: false,
      permissionKeys: [],
      userCount: 0,
      mayEdit: true,
      version: 1,
      assignedUsers: [],
    },
  });
  window.history.pushState(null, "", "/roles");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar el rol Depósito" }));

  await expect.element(screen.getByRole("dialog").getByText("Editar rol")).toBeVisible();
  await expect
    .poll(() => services.rolesListScreen.roleEditorModal?.fetchRole)
    .toHaveBeenCalledWith("role-stock");
  const rolesItem = screen.getByRole("link", { name: "Roles" }).element() as HTMLAnchorElement;
  expect(rolesItem.getAttribute("aria-current")).toBe("page");
  expect(window.location.pathname).toBe("/roles");
});

test("opens the role editor modal for duplicating, pre-filled from the source row, without refetching the list", async () => {
  const services = createAppServices();
  const fetchRoles = vi.mocked(services.rolesListScreen.fetchRoles);
  fetchRoles.mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "role-stock",
        name: "Depósito",
        isAdministrator: false,
        permissionKeys: [],
        userCount: 0,
        mayEdit: true,
      },
    ],
  });
  window.history.pushState(null, "", "/roles");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Duplicar el rol Depósito" }));

  await expect.element(screen.getByRole("dialog").getByText("Duplicar rol")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
  const rolesItem = screen.getByRole("link", { name: "Roles" }).element() as HTMLAnchorElement;
  expect(rolesItem.getAttribute("aria-current")).toBe("page");
  expect(fetchRoles).toHaveBeenCalledTimes(1);
});

test("redirects a non-Administrator's typed /roles to Mi cuenta, without listing roles", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/roles");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.rolesListScreen.fetchRoles).not.toHaveBeenCalled();
});

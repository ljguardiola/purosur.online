import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/backups",
  "/contingency-ticket-rescue",
  "/help",
  "/location-settings",
  "/people/roles",
  "/people/users",
  "/registers",
]);

beforeEach(resetPageState);

test("shows the Cajas registradoras item in the rail for a user holding enroll_register_devices, linking to its screen", async () => {
  window.history.pushState(null, "", "/registers");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["registers_area"],
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("navigation", { name: "Configuración" })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Cajas registradoras" })).toBeVisible();
});

test("hides the Cajas registradoras item in the rail for a user without enroll_register_devices", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Cajas registradoras" }).query()).toBeNull();
});

test("following the sidebar's Cajas registradoras item opens the registers list, with Config and Cajas registradoras active", async () => {
  window.history.pushState(null, "", "/people/users");
  const services = createAppServices();
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.registersListScreen.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();

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

test("redirects a typed /registers to the own account panel for a user without enroll_register_devices, without calling its API", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/registers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/?account=credentials");
  expect(services.registersListScreen.fetchRegisters).not.toHaveBeenCalled();
});

test("shows the Backups item after Cajas registradoras for a user holding view_backups_and_rotate_key", async () => {
  window.history.pushState(null, "", "/registers");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["registers_area", "backups_area"],
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("navigation", { name: "Configuración" })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Backups" })).toBeVisible();
  const links = screen.getByRole("link").elements();
  const labels = links.map((link) => link.textContent);
  expect(labels.indexOf("Backups")).toBe(labels.indexOf("Cajas registradoras") + 1);
});

test("hides the Backups item in the rail for a user without view_backups_and_rotate_key", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Backups" }).query()).toBeNull();
});

test("following the sidebar's Backups item opens the backups, with Config and Backups active", async () => {
  window.history.pushState(null, "", "/people/users");
  const services = createAppServices();
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.snapshotBackupsScreen.fetchSnapshotBackupRegisters).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Backups" }));

  await expect.element(screen.getByRole("heading", { name: "Backups", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/backups");
  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const backupsItem = screen.getByRole("link", { name: "Backups" }).element() as HTMLAnchorElement;
  expect(backupsItem.getAttribute("aria-current")).toBe("page");
});

test("redirects a typed /backups to the own account panel for a user without view_backups_and_rotate_key, without calling its API", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/backups");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/?account=credentials");
  expect(services.snapshotBackupsScreen.fetchSnapshotBackupRegisters).not.toHaveBeenCalled();
});

test("shows the Sucursal item in the rail for a user holding configure_branch, linking to its screen", async () => {
  window.history.pushState(null, "", "/location-settings");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["branch_area"],
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("navigation", { name: "Configuración" })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Sucursal" })).toBeVisible();
});

test("hides the Sucursal item in the rail for a user without configure_branch", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sucursal" }).query()).toBeNull();
});

test("following the sidebar's Sucursal item opens the branch settings screen, with Config and Sucursal active", async () => {
  window.history.pushState(null, "", "/people/users");
  const services = createAppServices();
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
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
      zoneRulesVersion: null,
      unreviewedPriceAlertDays: 30,
      goodConditionReturnDays: 15,
      supplierPriceListDailyExtractionCap: 10,
      version: 1,
    },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Sucursal" }));

  await expect.element(screen.getByRole("heading", { name: "Sucursal", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/location-settings");
  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const branchItem = screen.getByRole("link", { name: "Sucursal" }).element() as HTMLAnchorElement;
  expect(branchItem.getAttribute("aria-current")).toBe("page");
});

test("redirects a typed /location-settings to the own account panel for a user without configure_branch, without calling its API", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/location-settings");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/?account=credentials");
  expect(services.branchSettingsScreen.fetchBranchSettings).not.toHaveBeenCalled();
});

test("opens the role editor modal, over the Roles list, from the Nuevo rol button, without submitting it", async () => {
  window.history.pushState(null, "", "/people/roles");
  const services = createAppServices();
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("button", { name: "Nuevo rol" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));

  await expect.element(screen.getByRole("dialog").getByText("Nuevo rol")).toBeVisible();
  expect(window.location.pathname).toBe("/people/roles");
  expect(services.rolesListScreen.roleEditorModal?.createRole).not.toHaveBeenCalled();
});

test("opens the role editor modal for editing, from a role's pencil action, with the Roles tab still selected", async () => {
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
  window.history.pushState(null, "", "/people/roles");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("button", { name: "Nuevo rol" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar el rol Depósito" }));

  await expect.element(screen.getByRole("dialog").getByText("Editar rol")).toBeVisible();
  await expect
    .poll(() => services.rolesListScreen.roleEditorModal?.fetchRole)
    .toHaveBeenCalledWith("role-stock");
  await expect.element(screen.getByRole("tab", { name: "Roles", selected: true })).toBeVisible();
  expect(window.location.pathname).toBe("/people/roles");
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
  window.history.pushState(null, "", "/people/roles");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("button", { name: "Nuevo rol" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Duplicar el rol Depósito" }));

  await expect.element(screen.getByRole("dialog").getByText("Duplicar rol")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
  await expect.element(screen.getByRole("tab", { name: "Roles", selected: true })).toBeVisible();
  expect(fetchRoles).toHaveBeenCalledTimes(1);
});

test("redirects a non-Administrator's typed /roles to the own account panel, without listing roles", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/people/roles");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/?account=credentials");
  expect(services.rolesListScreen.fetchRoles).not.toHaveBeenCalled();
});

test("shows the Rescate de tickets item right after Backups for a user holding contingency_ticket_rescue", async () => {
  window.history.pushState(null, "", "/backups");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["backups_area", "contingency_ticket_rescue"],
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("navigation", { name: "Configuración" })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Rescate de tickets" })).toBeVisible();
  const labels = screen
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(labels.indexOf("Rescate de tickets")).toBe(labels.indexOf("Backups") + 1);
});

test("holding the Backups permission does not show the Rescate de tickets item", async () => {
  window.history.pushState(null, "", "/backups");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["backups_area"],
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Backups" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Rescate de tickets" }).query()).toBeNull();
});

test("following the sidebar's Rescate de tickets item opens the screen, with Config and the item active", async () => {
  window.history.pushState(null, "", "/people/users");
  const services = createAppServices();
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Rescate de tickets" }));

  await expect
    .element(screen.getByRole("heading", { name: "Rescate de tickets", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/contingency-ticket-rescue");
  const item = screen
    .getByRole("link", { name: "Rescate de tickets" })
    .element() as HTMLAnchorElement;
  expect(item.getAttribute("aria-current")).toBe("page");
});

test("redirects a typed /contingency-ticket-rescue to the own account panel for a user without contingency_ticket_rescue, without sending anything", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["backups_area"],
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/contingency-ticket-rescue");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/?account=credentials");
  expect(
    services.contingencyTicketRescueScreen.rescueContingencyBackupTicket,
  ).not.toHaveBeenCalled();
});

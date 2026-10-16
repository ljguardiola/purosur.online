import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { createUsersListServices, renderUsersList } from "./test-support/users-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

test("offers to end every session below the table to someone who manages users", async () => {
  const screen = await renderUsersList(createUsersListServices());

  await expect.element(screen.getByRole("region", { name: "Cerrar sesiones" })).toBeVisible();
});

test("does not offer to end every session to someone who only reads users", async () => {
  const screen = await renderUsersList(createUsersListServices(), {
    access: accessWith("users_area"),
  });

  await expect.element(screen.getByRole("table", { name: "Usuarios" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Cerrar sesiones" }).query()).toBeNull();
});

test("hands the section the screen's way to end the session", async () => {
  const onSessionEnded = vi.fn();
  const screen = await renderUsersList(createUsersListServices(), { onSessionEnded });

  await userEvent.click(screen.getByRole("button", { name: "Terminar la sesión" }));

  expect(onSessionEnded).toHaveBeenCalledTimes(1);
});

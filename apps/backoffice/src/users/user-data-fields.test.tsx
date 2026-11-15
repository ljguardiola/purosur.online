import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { lucia } from "./test-support/user-panel";
import { UserDataFields } from "./user-data-fields";

test("shows the user's role by its name and their email, each under its label", async () => {
  const screen = await render(<UserDataFields user={lucia} />);

  await expect.element(screen.getByText("Rol")).toBeVisible();
  await expect.element(screen.getByText("Responsable de turno")).toBeVisible();
  await expect.element(screen.getByText("Correo")).toBeVisible();
  await expect.element(screen.getByText("lucia.perez@example.com")).toBeVisible();
});

test("shows that a user who opted in receives alerts by email, and since when", async () => {
  const screen = await render(
    <UserDataFields user={{ ...lucia, alertEmailOptedInAt: "2026-03-14T15:00:00.000Z" }} />,
  );

  await expect.element(screen.getByText("Notificaciones")).toBeVisible();
  await expect.element(screen.getByText("Recibe alertas por email desde 14/03/2026")).toBeVisible();
});

test("shows that a user with no opt-in does not receive alerts by email", async () => {
  const screen = await render(<UserDataFields user={lucia} />);

  await expect.element(screen.getByText("Notificaciones")).toBeVisible();
  await expect.element(screen.getByText("No recibe alertas por email")).toBeVisible();
});

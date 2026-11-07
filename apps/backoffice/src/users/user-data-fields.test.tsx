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

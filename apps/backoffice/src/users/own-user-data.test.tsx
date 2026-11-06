import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { OwnUserData, type OwnUserDataProps } from "./own-user-data";
import { lucia } from "./test-support/user-panel";

function createServices(): OwnUserDataProps["services"] {
  return { fetchUser: vi.fn() };
}

function renderOwnUserData(services: OwnUserDataProps["services"], userId = "user-1") {
  return render(<OwnUserData userId={userId} onSessionEnded={() => {}} services={services} />);
}

test("shows a loading placeholder while the person's own user loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderOwnUserData(services);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
});

test("shows the person's own role and email, reading their own user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderOwnUserData(services);

  await expect.element(screen.getByText("Responsable de turno")).toBeVisible();
  await expect.element(screen.getByText("lucia.perez@example.com")).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledWith("user-1");
});

test("shows a load error, and Reintentar reads the person's own user again", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderOwnUserData(services);
  await expect.element(screen.getByText("No pudimos abrir tus datos")).toBeVisible();

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: lucia });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("lucia.perez@example.com")).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledTimes(2);
});

test("tells the person when the cloud no longer finds their own user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "not_found" });

  const screen = await renderOwnUserData(services);

  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos tus datos");
});

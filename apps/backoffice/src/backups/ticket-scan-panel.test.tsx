import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { createFakeQrScanner } from "./test-support/fake-qr-scanner";
import { TicketScanPanel } from "./ticket-scan-panel";

function renderPanel(
  fake = createFakeQrScanner(),
  props: { progress?: { read: number; of: number } | null; onCode?: (text: string) => void } = {},
) {
  return render(
    <TicketScanPanel
      scanner={fake.Scanner}
      progress={props.progress ?? null}
      onCode={props.onCode ?? vi.fn()}
    />,
  );
}

test("asks to show the ticket's QR to the camera and says what the rescue is for", async () => {
  const screen = await renderPanel();

  await expect.element(screen.getByLabelText("Cámara")).toBeVisible();
  await expect.element(screen.getByText("Mostrar el QR del ticket a la cámara")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Sirve para recuperar ventas de una caja que se perdió antes de sincronizarlas.",
      ),
    )
    .toBeVisible();
});

test("hands over the text of each code the camera reads", async () => {
  const fake = createFakeQrScanner();
  const onCode = vi.fn();
  await renderPanel(fake, { onCode });

  fake.show("QR-1");

  expect(onCode).toHaveBeenCalledWith("QR-1");
});

test("says nothing about progress while no ticket is half read", async () => {
  const screen = await renderPanel();

  await expect.element(screen.getByText("Mostrar el QR del ticket a la cámara")).toBeVisible();
  expect(screen.getByText(/leído/).query()).toBeNull();
});

test("says how many codes of the ticket in progress were read", async () => {
  const screen = await renderPanel(createFakeQrScanner(), { progress: { read: 1, of: 2 } });

  await expect.element(screen.getByText("QR 1 de 2 leído")).toBeVisible();
});

test("says the camera is blocked and offers to try again when the person refused it", async () => {
  const fake = createFakeQrScanner();
  const screen = await renderPanel(fake);

  fake.fail("denied");

  await expect.element(screen.getByText("La cámara está bloqueada")).toBeVisible();
  await expect
    .element(screen.getByText("Permitila desde el navegador para leer los tickets."))
    .toBeVisible();
  expect(fake.isShown()).toBe(false);
  await expect.element(screen.getByRole("button", { name: "Probar de nuevo" })).toBeVisible();
});

test("says there is no camera when the device has none", async () => {
  const fake = createFakeQrScanner();
  const screen = await renderPanel(fake);

  fake.fail("no_camera");

  await expect.element(screen.getByText("No hay una cámara disponible")).toBeVisible();
  await expect
    .element(screen.getByText("Abrí esta pantalla desde un equipo con cámara."))
    .toBeVisible();
});

test("tries the camera again from the beginning", async () => {
  const fake = createFakeQrScanner();
  const screen = await renderPanel(fake);
  fake.fail("denied");
  const mountsBefore = fake.mounts();

  await userEvent.click(screen.getByRole("button", { name: "Probar de nuevo" }));

  await expect.element(screen.getByLabelText("Cámara")).toBeVisible();
  expect(fake.mounts()).toBe(mountsBefore + 1);
  expect(screen.getByText("La cámara está bloqueada").query()).toBeNull();
});

test("has no accessibility violations scanning or with the camera unavailable", async () => {
  const fake = createFakeQrScanner();
  await renderPanel(fake, { progress: { read: 1, of: 2 } });
  await expectNoAccessibilityViolations(document.body);

  fake.fail("denied");
  await expectNoAccessibilityViolations(document.body);
});

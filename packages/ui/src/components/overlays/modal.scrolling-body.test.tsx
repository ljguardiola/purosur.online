import { CheckCircle, Info } from "lucide-react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { Button } from "../forms/button";
import { Modal } from "./modal";

beforeEach(async () => {
  await page.viewport(900, 500);
});

afterEach(async () => {
  await page.viewport(1280, 900);
});

function ReadOnlyRows({ count }: { count: number }) {
  return (
    <ul>
      {Array.from({ length: count }, (_, index) => `Cambio número ${index + 1}`).map((row) => (
        <li key={row}>{row}</li>
      ))}
    </ul>
  );
}

function ChangesModal({ rows, onConfirm = () => {} }: { rows: number; onConfirm?: () => void }) {
  return (
    <Modal
      open
      onOpenChange={() => {}}
      tone="info"
      icon={<Info />}
      title="Cambios de la compra"
      footer={<Button onPress={onConfirm}>Entendido</Button>}
    >
      <ReadOnlyRows count={rows} />
    </Modal>
  );
}

const footerButton = () => page.getByRole("button", { name: "Entendido" });
const scrollingBody = () => page.getByRole("region", { name: "Cambios de la compra" });

test("lets Tab reach an overflowing read-only body, named after the modal's title, and passes the accessibility check", async () => {
  await render(<ChangesModal rows={40} />);

  await userEvent.tab();

  await expect.element(scrollingBody()).toHaveFocus();
  await expectNoAccessibilityViolations(document.body);
});

test("adds no tab stop for a body that fits", async () => {
  await render(<ChangesModal rows={2} />);

  await userEvent.tab();
  await expect.element(footerButton()).toHaveFocus();
  await userEvent.tab();
  await expect.element(footerButton()).toHaveFocus();

  expect(scrollingBody().query()).toBeNull();
  await expectNoAccessibilityViolations(document.body);
});

test("lets Tab reach an overflowing body in the centered layout", async () => {
  await render(
    <Modal
      open
      onOpenChange={() => {}}
      headerLayout="centered"
      tone="success"
      icon={<CheckCircle />}
      title="Venta completada"
      footer={<Button fullWidth>Aceptar</Button>}
    >
      <ReadOnlyRows count={40} />
    </Modal>,
  );

  await userEvent.tab();

  await expect.element(page.getByRole("region", { name: "Venta completada" })).toHaveFocus();
  await expectNoAccessibilityViolations(document.body);
});

test("sends with Ctrl+Enter while the scrolling body holds the focus", async () => {
  const onConfirm = vi.fn();
  await render(<ChangesModal rows={40} onConfirm={onConfirm} />);
  await userEvent.tab();
  await expect.element(scrollingBody()).toHaveFocus();

  await userEvent.keyboard("{Control>}{Enter}{/Control}");

  expect(onConfirm).toHaveBeenCalledTimes(1);
});

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

test("still sends with Ctrl+Enter from a focused body that stopped overflowing", async () => {
  const onConfirm = vi.fn();
  const screen = await render(<ChangesModal rows={40} onConfirm={onConfirm} />);
  await userEvent.tab();
  await expect.element(scrollingBody()).toHaveFocus();
  const body = scrollingBody().element();

  await screen.rerender(<ChangesModal rows={2} onConfirm={onConfirm} />);
  await expect.poll(() => body.scrollHeight <= body.clientHeight).toBe(true);
  await nextFrame();
  await nextFrame();
  await userEvent.keyboard("{Control>}{Enter}{/Control}");

  expect(onConfirm).toHaveBeenCalledTimes(1);
});

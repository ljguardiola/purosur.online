import { Info } from "lucide-react";
import { beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { Modal, type ModalProps } from "./modal";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function props(overrides: Partial<ModalProps> = {}): ModalProps {
  return {
    open: true,
    onOpenChange: () => {},
    tone: "info",
    icon: <Info />,
    title: "Reloj atrasado",
    footer: <span />,
    children: "Body content",
    closable: true,
    ...overrides,
  } as ModalProps;
}

test("shows the Esc keycap instead of the X in the close button, named for closing", async () => {
  await render(<Modal {...props({ escapeKeycap: true })} />);

  const closeButton = page
    .getByRole("button", { name: "Cerrar con Esc", exact: true })
    .element() as HTMLElement;
  expect(closeButton.querySelector("kbd")?.textContent).toBe("Esc");
  expect(closeButton.querySelector("svg")).toBeNull();
  await expectNoAccessibilityViolations(document.body);
});

test("closes the modal when the keycap button is pressed", async () => {
  const onOpenChange = vi.fn();
  await render(<Modal {...props({ escapeKeycap: true, onOpenChange })} />);

  await userEvent.click(page.getByRole("button", { name: "Cerrar con Esc", exact: true }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("puts the keycap at the header's right end", async () => {
  await render(<Modal {...props({ escapeKeycap: true })} />);

  const dialog = page.getByRole("dialog").element() as HTMLElement;
  const header = (page.getByRole("heading").element() as HTMLElement).closest(
    "div.border-b",
  ) as HTMLElement;
  const keycap = dialog.querySelector("kbd") as HTMLElement;
  expect(header.getBoundingClientRect().right - keycap.getBoundingClientRect().right).toBeLessThan(
    24,
  );
});

test("keeps the X without the option, and shows no keycap", async () => {
  await render(<Modal {...props()} />);

  const closeButton = page
    .getByRole("button", { name: "Cerrar", exact: true })
    .element() as HTMLElement;
  expect(closeButton.querySelector("svg")).not.toBeNull();
  expect(document.querySelector("kbd")).toBeNull();
});

test("shows no close button, and so no keycap, when the modal is not closable", async () => {
  await render(<Modal {...props({ escapeKeycap: true, closable: false })} />);

  expect(document.querySelector("kbd")).toBeNull();
});

test("offers the keycap only in the leading header layout", () => {
  expectTypeOf<Extract<ModalProps, { headerLayout?: "leading" }>>().toHaveProperty("escapeKeycap");
  expectTypeOf<
    Extract<ModalProps, { headerLayout: "centered" }>["escapeKeycap"]
  >().toEqualTypeOf<undefined>();
});

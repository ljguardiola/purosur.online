import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { LoadingPlaceholder, type LoadingPlaceholderProps } from "./loading-placeholder";

function shapes(container: HTMLElement): HTMLElement {
  return container.querySelector('[aria-hidden="true"]') as HTMLElement;
}

test("announces the loading politely, outside any busy subtree that would hold the announcement back", async () => {
  const screen = await render(<LoadingPlaceholder variant="form" fields={2} />);

  const status = screen.getByRole("status");
  await expect.element(status).toHaveTextContent("Cargando…");
  expect((status.element() as HTMLElement).closest('[aria-busy="true"]')).toBeNull();
});

test("hides every shape from assistive technology", async () => {
  const screen = await render(<LoadingPlaceholder variant="list" items={3} />);

  const visual = shapes(screen.container);
  expect(visual.children).toHaveLength(3);
  expect(screen.container.querySelectorAll('[aria-hidden="true"] [role]')).toHaveLength(0);
  await expectNoAccessibilityViolations(screen.container);
});

test("reveals its shapes exactly at 300ms, so a fast load never flashes them", async () => {
  const screen = await render(<LoadingPlaceholder variant="card" lines={3} />);
  const visual = shapes(screen.container);

  const [animation] = visual.getAnimations();
  if (!animation) {
    throw new Error("Expected the placeholder to have a running CSS animation.");
  }
  animation.pause();

  animation.currentTime = 299;
  expect(getComputedStyle(visual).opacity).toBe("0");

  animation.currentTime = 300;
  expect(getComputedStyle(visual).opacity).toBe("1");
});

test("stacks one label line above one field box per field, the way a form field is drawn", async () => {
  const screen = await render(<LoadingPlaceholder variant="form" fields={3} />);

  const fields = Array.from(shapes(screen.container).children) as HTMLElement[];
  expect(fields).toHaveLength(3);
  for (const field of fields) {
    expect(field.getBoundingClientRect().height).toBe(20 + 4 + 48);
    const [label, box] = Array.from(field.children) as HTMLElement[];
    expect(label?.getBoundingClientRect().height).toBe(20);
    expect(box?.getBoundingClientRect().height).toBe(48);
  }
  const [first, second] = fields;
  expect((second as HTMLElement).getBoundingClientRect().top).toBe(
    (first as HTMLElement).getBoundingClientRect().bottom + 16,
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("draws a framed card with a heading line and the requested number of text lines", async () => {
  const screen = await render(<LoadingPlaceholder variant="card" lines={4} />);

  const card = shapes(screen.container);
  const style = getComputedStyle(card);
  expect(style.borderTopWidth).toBe("1px");
  expect(style.paddingTop).toBe("16px");
  expect(style.borderTopLeftRadius).toBe("8px");
  expect(card.children).toHaveLength(1 + 4);
  const widths = Array.from(card.children).map((line) => line.getBoundingClientRect().width);
  expect(new Set(widths).size).toBeGreaterThan(1);
  await expectNoAccessibilityViolations(screen.container);
});

test("draws each list item as an icon block, two text lines and a control square", async () => {
  const screen = await render(<LoadingPlaceholder variant="list" items={2} />);

  const rows = Array.from(shapes(screen.container).children) as HTMLElement[];
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    const [icon, text, control] = Array.from(row.children) as HTMLElement[];
    expect(icon?.getBoundingClientRect().width).toBe(20);
    expect(text?.children).toHaveLength(2);
    expect(control?.getBoundingClientRect().width).toBe(38);
  }
  await expectNoAccessibilityViolations(screen.container);
});

test("requires the count each variant counts by", () => {
  expectTypeOf<{ variant: "form"; lines: number }>().not.toExtend<LoadingPlaceholderProps>();
  expectTypeOf<{ variant: "card"; fields: number }>().not.toExtend<LoadingPlaceholderProps>();
  expectTypeOf<{ variant: "list"; items: number }>().toExtend<LoadingPlaceholderProps>();
});

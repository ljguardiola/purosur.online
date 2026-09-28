import { expect, expectTypeOf, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { paletteColor, tokenRgb } from "../test/token-colors";
import { ListFilter, type ListFilterOption, type ListFilterProps } from "./ListFilter";

type Status = "all" | "open" | "closed";

const options: [ListFilterOption<Status>, ListFilterOption<Status>, ListFilterOption<Status>] = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abiertas" },
  { value: "closed", label: "Cerradas" },
];

function baseProps(overrides: Partial<ListFilterProps<Status>> = {}): ListFilterProps<Status> {
  return {
    label: "Estado",
    options,
    value: "all",
    onChange: () => {},
    ...overrides,
  };
}

const VALUE_FLOOR_PX = 28;

// Border box minus its own padding and border, not the border box itself.
function contentEdgeRight(trigger: HTMLElement): number {
  const style = getComputedStyle(trigger);
  return (
    trigger.getBoundingClientRect().right -
    Number.parseFloat(style.paddingRight) -
    Number.parseFloat(style.borderRightWidth)
  );
}

test("renders closed at 44px with an 8px radius, a 2px line border and 12px padding", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  const style = getComputedStyle(trigger);
  const rect = trigger.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(43);
  expect(rect.height).toBeLessThan(45);
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderWidth).toBe("2px");
  expect(style.borderColor).toBe(tokenRgb("border"));
  expect(style.paddingLeft).toBe("12px");
  expect(style.paddingRight).toBe("12px");
  expect(style.columnGap).toBe("8px");
});

test("shows the label in 14px secondary text and the chosen value in 16px bold ink", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });
  const label = trigger.getByText("Estado", { exact: true }).element() as HTMLElement;
  const value = trigger.getByText("Todos", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(label).fontSize).toBe("14px");
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-subtle"));
  expect(getComputedStyle(value).fontSize).toBe("16px");
  expect(getComputedStyle(value).fontWeight).toBe("700");
  expect(getComputedStyle(value).color).toBe(tokenRgb("text"));
});

test("shows a 16px down chevron in secondary text when closed", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  const icon = trigger.querySelector("svg") as SVGSVGElement;
  const rect = icon.getBoundingClientRect();

  expect(icon.classList.contains("lucide-chevron-down")).toBe(true);
  expect(rect.width).toBeGreaterThan(15);
  expect(rect.width).toBeLessThan(17);
  expect(getComputedStyle(icon).color).toBe(tokenRgb("text-subtle"));
});

test("shows a visible focus outline in strong blue when reached by keyboard", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(trigger).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(trigger).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(trigger).outlineColor).toBe(tokenRgb("focus"));
});

test("turns the border blue UI and the chevron up when opened", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });

  await trigger.click();

  await expect.poll(() => getComputedStyle(trigger.element()).borderColor).toBe(tokenRgb("action"));
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  const icon = trigger.element().querySelector("svg") as SVGSVGElement;
  expect(icon.classList.contains("lucide-chevron-up")).toBe(true);
});

test("opens a menu at least 200px wide, matching the trigger, white with an 8px radius and the menu shadow", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });

  await trigger.click();

  const listbox = screen.getByRole("listbox").element() as HTMLElement;
  const menu = listbox.parentElement as HTMLElement;
  const style = getComputedStyle(menu);
  const rect = menu.getBoundingClientRect();

  expect(rect.width).toBeGreaterThanOrEqual(200);
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderWidth).toBe("1px");
  expect(style.borderColor).toBe(tokenRgb("border"));
  expect(style.boxShadow).toContain("8px");
  expect(style.boxShadow).toContain("24px");
  expect(style.boxShadow).toContain(paletteColor("neutral-900-a16"));

  // react-aria-components flips the popover to the trigger's opposite side when its preferred
  // side lacks room, so the gap is checked against whichever side it actually rendered on.
  const placement = menu.getAttribute("data-placement");
  expect(placement).toBe("bottom");
  const triggerRect = trigger.element().getBoundingClientRect();
  const gap = placement === "top" ? triggerRect.top - rect.bottom : rect.top - triggerRect.bottom;
  expect(gap).toBeGreaterThan(3);
  expect(gap).toBeLessThan(5);
});

test("flips the menu above the trigger, with the same 4px gap, when there is no room below it", async () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  await page.viewport(320, 400);

  try {
    const screen = await render(
      <div style={{ marginTop: "340px" }}>
        <ListFilter {...baseProps()} />
      </div>,
    );
    const trigger = screen.getByRole("button", { name: /Estado/ });

    await trigger.click();

    const listbox = screen.getByRole("listbox").element() as HTMLElement;
    const menu = listbox.parentElement as HTMLElement;
    const rect = menu.getBoundingClientRect();
    const triggerRect = trigger.element().getBoundingClientRect();

    expect(menu.getAttribute("data-placement")).toBe("top");
    expect(triggerRect.top - rect.bottom).toBeGreaterThan(3);
    expect(triggerRect.top - rect.bottom).toBeLessThan(5);

    await expectNoAccessibilityViolations(document.body);
  } finally {
    await page.viewport(originalWidth, originalHeight);
  }

  // This file's tests share one browser tab, so a viewport left at 320x400 would carry into
  // whichever test runs next.
  await expect.poll(() => window.innerWidth).toBe(originalWidth);
  await expect.poll(() => window.innerHeight).toBe(originalHeight);
});

test("keeps the menu at the 200px floor when the trigger is narrower than that", async () => {
  const narrowOptions: [ListFilterOption<"a" | "b">, ListFilterOption<"a" | "b">] = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ];
  const screen = await render(
    <ListFilter label="X" options={narrowOptions} value="a" onChange={() => {}} />,
  );
  const trigger = screen.getByRole("button", { name: /X/ });

  const triggerWidth = trigger.element().getBoundingClientRect().width;
  expect(triggerWidth).toBeLessThan(200);

  await trigger.click();
  const menu = screen.getByRole("listbox").element().parentElement as HTMLElement;

  expect(menu.getBoundingClientRect().width).toBeCloseTo(200, 0);

  await expectNoAccessibilityViolations(document.body);
});

test("matches the menu to a trigger wider than 200px", async () => {
  const wideOptions: [ListFilterOption<"a" | "b">, ListFilterOption<"a" | "b">] = [
    { value: "a", label: "A very long chosen option value" },
    { value: "b", label: "Another very long chosen option value" },
  ];
  const screen = await render(
    <ListFilter
      label="A rather long filter label"
      options={wideOptions}
      value="a"
      onChange={() => {}}
    />,
  );
  const trigger = screen.getByRole("button", { name: /A rather long filter label/ });

  const triggerWidth = trigger.element().getBoundingClientRect().width;
  expect(triggerWidth).toBeGreaterThan(200);

  await trigger.click();
  const menu = screen.getByRole("listbox").element().parentElement as HTMLElement;

  expect(menu.getBoundingClientRect().width).toBeCloseTo(triggerWidth, 0);

  await expectNoAccessibilityViolations(document.body);
});

test("caps the trigger at a constrained parent's own width instead of growing past it", async () => {
  const options: [ListFilterOption<string>, ListFilterOption<string>] = [
    { value: "a", label: "Esperando confirmación de aprobación del pago del pedido" },
    { value: "b", label: "Otro" },
  ];
  const screen = await render(
    <div style={{ width: "200px", display: "flex" }}>
      <ListFilter label="Estado" options={options} value="a" onChange={() => {}} />
    </div>,
  );
  const triggerLocator = screen.getByRole("button", { name: /Estado/ });
  const trigger = triggerLocator.element() as HTMLElement;
  const value = triggerLocator
    .getByText(options[0].label, { exact: true })
    .element() as HTMLElement;

  expect(trigger.getBoundingClientRect().width).toBeCloseTo(200, 0);
  // scrollHeight === clientHeight can't tell one line from an exact two-line fit, so this compares
  // against a single line's own height instead.
  const valueLineHeight = Number.parseFloat(getComputedStyle(value).lineHeight);
  expect(value.getBoundingClientRect().height).toBeLessThanOrEqual(valueLineHeight + 1);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the label whole and the chevron flush, with no gap, when the chosen value is narrower than its own floor", async () => {
  const narrow: [ListFilterOption<string>] = [{ value: "a", label: "8" }];
  const screen = await render(
    <ListFilter label="Estado" options={narrow} value="a" onChange={() => {}} />,
  );
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  const label = trigger.children[0] as HTMLElement;
  const value = trigger.children[1] as HTMLElement;
  const chevron = trigger.querySelector("svg") as SVGSVGElement;

  expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
  expect(value.getBoundingClientRect().width).toBeCloseTo(VALUE_FLOOR_PX, 0);
  expect(chevron.getBoundingClientRect().right).toBeCloseTo(contentEdgeRight(trigger), 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the same visible gap before the chevron for a value shorter than its own floor", async () => {
  const narrow: [ListFilterOption<string>, ListFilterOption<string>] = [
    { value: "a", label: "8" },
    { value: "b", label: "Otro" },
  ];
  const screen = await render(
    <ListFilter label="Estado" options={narrow} value="a" onChange={() => {}} />,
  );
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  const value = trigger.children[1] as HTMLElement;
  const chevron = trigger.querySelector("svg") as SVGSVGElement;

  // A Range measures the text's own visible extent, not the box's width (fixed at 28px either way).
  const textRange = document.createRange();
  textRange.selectNodeContents(value);
  const textRight = textRange.getBoundingClientRect().right;

  expect(chevron.getBoundingClientRect().left - textRight).toBeCloseTo(8, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the label whole and lets the value alone truncate when there's room for the label's own full width", async () => {
  const longOption: [ListFilterOption<string>, ListFilterOption<string>] = [
    { value: "a", label: "Un valor bastante largo para forzar el truncado" },
    { value: "b", label: "Otro" },
  ];
  const screen = await render(
    <div style={{ width: "300px", display: "flex" }}>
      <ListFilter
        label="Forma de pago del pedido"
        options={longOption}
        value="a"
        onChange={() => {}}
      />
    </div>,
  );
  const triggerLocator = screen.getByRole("button", { name: /Forma de pago del pedido/ });
  const trigger = triggerLocator.element() as HTMLElement;
  const label = triggerLocator
    .getByText("Forma de pago del pedido", { exact: true })
    .element() as HTMLElement;
  // AriaSelectValue reuses the option's own JSX, so getByText could match inside it; the trigger's
  // second direct child is used instead.
  const value = trigger.children[1] as HTMLElement;
  const chevron = trigger.querySelector("svg") as SVGSVGElement;
  const contentRight = contentEdgeRight(trigger);

  expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);

  expect(value.scrollWidth).toBeGreaterThan(value.clientWidth);
  expect(value.getBoundingClientRect().width).toBeGreaterThan(VALUE_FLOOR_PX);

  expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight);
  expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight);
  expect(chevron.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight);

  await expectNoAccessibilityViolations(screen.container);
});

test("truncates the label too, and pins the value at exactly its own floor, once even the value's ellipsis floor doesn't fit", async () => {
  const screen = await render(
    <div style={{ width: "90px", display: "flex" }}>
      <ListFilter
        label="Forma de pago del pedido"
        options={options}
        value="all"
        onChange={() => {}}
      />
    </div>,
  );
  const triggerLocator = screen.getByRole("button", { name: /Forma de pago del pedido/ });
  const trigger = triggerLocator.element() as HTMLElement;
  const label = triggerLocator
    .getByText("Forma de pago del pedido", { exact: true })
    .element() as HTMLElement;
  const value = trigger.children[1] as HTMLElement;
  const chevron = trigger.querySelector("svg") as SVGSVGElement;
  const contentRight = contentEdgeRight(trigger);

  const labelLineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
  expect(label.getBoundingClientRect().height).toBeLessThanOrEqual(labelLineHeight + 1);
  expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);

  expect(value.getBoundingClientRect().width).toBeCloseTo(VALUE_FLOOR_PX, 0);

  expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight);
  expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight);
  expect(chevron.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight);

  await expectNoAccessibilityViolations(screen.container);
});

// A clipped single line is still exactly one line tall, so only comparing scrollWidth against
// clientWidth catches a stray truncation here.
test("keeps the label fully legible, not truncated, when there's room for everything", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const label = screen
    .getByRole("button", { name: /Estado/ })
    .getByText("Estado", { exact: true })
    .element() as HTMLElement;

  expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
});

// A width/overflow check can't tell an ellipsis apart from a silent clip: both clip to the same
// box. Only computed text-overflow catches that swap.
test("shows an ellipsis, not a silent clip, on both the label and the value", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  const label = trigger.children[0] as HTMLElement;
  const value = trigger.children[1] as HTMLElement;

  expect(getComputedStyle(label).textOverflow).toBe("ellipsis");
  expect(getComputedStyle(value).textOverflow).toBe("ellipsis");
});

test("scrolls a long options list inside the popover instead of painting it past the popover's own box", async () => {
  const manyOptions = Array.from({ length: 40 }, (_, i) => ({
    value: `opt${i}`,
    label: `Option ${i}`,
  })) as [ListFilterOption<string>, ...ListFilterOption<string>[]];
  const screen = await render(
    <ListFilter label="Many" options={manyOptions} value="opt0" onChange={() => {}} />,
  );
  await screen.getByRole("button", { name: /Many/ }).click();

  const menu = screen.getByRole("listbox").element().parentElement as HTMLElement;
  const menuStyle = getComputedStyle(menu);

  expect(menuStyle.overflowY).toBe("auto");
  expect(menu.scrollHeight).toBeGreaterThan(menu.clientHeight);

  // `closest` guards against landing on an inner span or icon; the option's role lives on the <li>.
  const menuRect = menu.getBoundingClientRect();
  const probe = document.elementFromPoint(menuRect.left + 10, menuRect.bottom + 5);
  expect(probe, "expected a real hit-test result, not an out-of-viewport null").not.toBeNull();
  expect((probe as Element).closest('[role="option"]')).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

test("scrolls the popover to keep a keyboard-focused option below the fold visible", async () => {
  const manyOptions = Array.from({ length: 40 }, (_, i) => ({
    value: `opt${i}`,
    label: `Option ${i}`,
  })) as [ListFilterOption<string>, ...ListFilterOption<string>[]];
  const screen = await render(
    <ListFilter label="Many" options={manyOptions} value="opt0" onChange={() => {}} />,
  );
  await userEvent.tab();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  for (let i = 0; i < 20; i++) {
    await userEvent.keyboard("{ArrowDown}");
  }

  const focused = document.querySelector('[role="option"][data-focused]') as HTMLElement;
  expect(focused.textContent).toBe("Option 20");
  const menu = screen.getByRole("listbox").element().parentElement as HTMLElement;
  const menuRect = menu.getBoundingClientRect();
  const optionRect = focused.getBoundingClientRect();

  expect(menu.scrollTop).toBeGreaterThan(0);
  expect(optionRect.top).toBeGreaterThanOrEqual(menuRect.top);
  expect(optionRect.bottom).toBeLessThanOrEqual(menuRect.bottom);

  await expectNoAccessibilityViolations(document.body);
});

test("truncates a long option label instead of wrapping it over its own 40px row and the next option", async () => {
  const options: [ListFilterOption<string>, ListFilterOption<string>] = [
    { value: "a", label: "Esperando confirmación de aprobación del pago del pedido" },
    { value: "b", label: "Otro" },
  ];
  const screen = await render(
    <ListFilter label="Estado" options={options} value="b" onChange={() => {}} />,
  );
  await screen.getByRole("button", { name: /Estado/ }).click();

  const longLabel = "Esperando confirmación de aprobación del pago del pedido";
  const option = screen.getByRole("option", { name: longLabel }).element() as HTMLElement;

  // scrollHeight === clientHeight also holds for overflow:visible, so text-overflow is checked too.
  expect(option.scrollHeight).toBe(option.clientHeight);
  const span = option.querySelector("span") as HTMLElement;
  const spanStyle = getComputedStyle(span);
  expect(spanStyle.textOverflow).toBe("ellipsis");
  expect(spanStyle.whiteSpace).toBe("nowrap");
  expect(spanStyle.overflow).toBe("hidden");

  const nextOption = screen.getByRole("option", { name: "Otro" }).element() as HTMLElement;
  expect(option.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    nextOption.getBoundingClientRect().top,
  );

  await expectNoAccessibilityViolations(document.body);
});

test("shows the hand cursor on the trigger and on each option", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  expect(getComputedStyle(trigger).cursor).toBe("pointer");

  await screen.getByRole("button", { name: /Estado/ }).click();
  const option = screen.getByRole("option", { name: "Abiertas" }).element() as HTMLElement;
  expect(getComputedStyle(option).cursor).toBe("pointer");
});

test("renders each option at 40px with a 6px radius and 14px semibold ink", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  await screen.getByRole("button", { name: /Estado/ }).click();

  const option = screen.getByRole("option", { name: "Abiertas" }).element() as HTMLElement;
  const style = getComputedStyle(option);
  const rect = option.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(39);
  expect(rect.height).toBeLessThan(41);
  expect(style.borderRadius).toBe("6px");
  expect(style.fontSize).toBe("14px");
  expect(style.fontWeight).toBe("600");
  expect(style.color).toBe(tokenRgb("text"));
});

test("highlights a hovered option with a bone background", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  await screen.getByRole("button", { name: /Estado/ }).click();
  const option = screen.getByRole("option", { name: "Abiertas" });

  await userEvent.hover(option.element());
  await expect
    .poll(() => getComputedStyle(option.element()).backgroundColor)
    .toBe(tokenRgb("surface-subtle"));
});

test("highlights a keyboard-focused option with a bone background", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);

  await userEvent.tab();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  const focused = screen.getByRole("option", { name: "Todos" });
  await expect
    .poll(() => getComputedStyle(focused.element()).backgroundColor)
    .toBe(tokenRgb("surface-subtle"));
});

test("shows a 16px blue strong check on the chosen option only", async () => {
  const screen = await render(<ListFilter {...baseProps({ value: "open" })} />);
  await screen.getByRole("button", { name: /Estado/ }).click();

  const chosen = screen.getByRole("option", { name: "Abiertas" }).element() as HTMLElement;
  const unchosen = screen.getByRole("option", { name: "Todos" }).element() as HTMLElement;
  const check = chosen.querySelector("svg") as SVGSVGElement;

  expect(check).not.toBeNull();
  const rect = check.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(15);
  expect(rect.width).toBeLessThan(17);
  expect(getComputedStyle(check).color).toBe(tokenRgb("text-accent"));
  expect(unchosen.querySelector("svg")).toBeNull();
});

test("gives the caller the chosen option and closes the menu, on click", async () => {
  const onChange = vi.fn();
  const screen = await render(<ListFilter {...baseProps({ onChange })} />);
  await screen.getByRole("button", { name: /Estado/ }).click();

  await screen.getByRole("option", { name: "Abiertas" }).click();

  expect(onChange).toHaveBeenCalledWith("open");
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

  await expectNoAccessibilityViolations(document.body);
});

// react-aria-components' selectedKey makes this a fully controlled select: it shows whatever
// value prop the caller gives back, never the option that was merely clicked.
test("keeps showing the old value when the caller's onChange does nothing", async () => {
  const onChange = vi.fn();
  const screen = await render(<ListFilter {...baseProps({ onChange })} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });
  await trigger.click();

  await screen.getByRole("option", { name: "Abiertas" }).click();

  expect(onChange).toHaveBeenCalledWith("open");
  await expect.element(trigger.getByText("Todos", { exact: true })).toBeVisible();
  expect(trigger.getByText("Abiertas", { exact: true }).query()).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

// react-aria-components' Select treats a selectedKey with no matching option as no selection.
test("shows react-aria's own placeholder, not a stale label, when its value points to an option a narrowed options list no longer has", async () => {
  const narrowedOptions: [ListFilterOption<Status>, ListFilterOption<Status>] = [
    { value: "all", label: "Todos" },
    { value: "open", label: "Abiertas" },
  ];
  const screen = await render(<ListFilter {...baseProps({ value: "closed" })} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });
  await expect.element(trigger.getByText("Cerradas", { exact: true })).toBeVisible();

  await screen.rerender(
    <ListFilter {...baseProps({ options: narrowedOptions, value: "closed" })} />,
  );

  expect(trigger.getByText("Cerradas", { exact: true }).query()).toBeNull();
  const placeholder = trigger.element().querySelector("[data-placeholder]");
  expect(placeholder).not.toBeNull();
  expect(placeholder?.getAttribute("data-placeholder")).toBe("true");
  expect(screen.getByRole("button", { name: /^Estado\s+\S/ }).element()).toBe(trigger.element());

  await expectNoAccessibilityViolations(screen.container);
});

test("names the trigger for assistive technology with both its label and its current value", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);

  await expect
    .element(screen.getByRole("button", { name: "Estado Todos", exact: true }))
    .toBeVisible();
});

// react-aria-components' collection is keyed by `id` (this component's `option.value`), the same
// Map semantics as any JS object literal: the last entry with a given key is the only one that exists.
test("keeps only the last option with a given value, everywhere, when a caller passes duplicates", async () => {
  const dupOptions: [
    ListFilterOption<"a" | "b">,
    ListFilterOption<"a" | "b">,
    ListFilterOption<"a" | "b">,
  ] = [
    { value: "b", label: "Otro" },
    { value: "a", label: "Primero" },
    { value: "a", label: "Segundo" },
  ];
  const onChange = vi.fn();
  const screen = await render(
    <ListFilter label="X" options={dupOptions} value="b" onChange={onChange} />,
  );
  const trigger = screen.getByRole("button", { name: /X/ });

  await trigger.click();
  const optionEls = screen.getByRole("option").elements();
  expect(optionEls.map((el) => el.textContent)).toEqual(["Otro", "Segundo"]);

  await screen.getByRole("option", { name: "Segundo" }).click();
  expect(onChange).toHaveBeenCalledWith("a");

  await expectNoAccessibilityViolations(document.body);
});

test("keeps every generated id unique with two filters sharing the same option values rendered together", async () => {
  const screen = await render(
    <>
      <ListFilter {...baseProps({ label: "Primero", value: "open" })} />
      <ListFilter {...baseProps({ label: "Segundo", value: "closed" })} />
    </>,
  );

  await expect
    .element(screen.getByRole("button", { name: "Primero Abiertas", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Segundo Cerradas", exact: true }))
    .toBeVisible();

  // Options only exist in the DOM while their own menu is open, so each set is captured in turn.
  const triggerIds = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);

  await screen.getByRole("button", { name: "Primero Abiertas", exact: true }).click();
  const firstOptionIds = screen
    .getByRole("option")
    .elements()
    .map((el) => (el as HTMLElement).id);
  await userEvent.keyboard("{Escape}");

  await screen.getByRole("button", { name: "Segundo Cerradas", exact: true }).click();
  const secondOptionIds = screen
    .getByRole("option")
    .elements()
    .map((el) => (el as HTMLElement).id);
  await userEvent.keyboard("{Escape}");

  const allIds = [...triggerIds, ...firstOptionIds, ...secondOptionIds];
  expect(allIds.length).toBeGreaterThan(0);
  expect(allIds.every((id) => id.length > 0)).toBe(true);
  expect(new Set(allIds).size).toBe(allIds.length);

  await expectNoAccessibilityViolations(document.body);
});

test("closes the menu and does not call onChange when the already-chosen option is picked again", async () => {
  const onChange = vi.fn();
  const screen = await render(<ListFilter {...baseProps({ value: "open", onChange })} />);
  await screen.getByRole("button", { name: /Estado/ }).click();

  await screen.getByRole("option", { name: "Abiertas" }).click();

  expect(onChange).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

  await expectNoAccessibilityViolations(document.body);
});

test("opens from the keyboard, moves between options with arrows, picks one with Enter, and returns focus to the trigger", async () => {
  const onChange = vi.fn();
  const screen = await render(<ListFilter {...baseProps({ onChange })} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });

  await userEvent.tab();
  expect(document.activeElement).toBe(trigger.element());

  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  await userEvent.keyboard("{ArrowDown}");
  await userEvent.keyboard("{Enter}");

  expect(onChange).toHaveBeenCalledWith("open");
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
  await expect.poll(() => document.activeElement).toBe(trigger.element());
});

test("closes on Escape without changing anything", async () => {
  const onChange = vi.fn();
  const screen = await render(<ListFilter {...baseProps({ onChange })} />);
  await screen.getByRole("button", { name: /Estado/ }).click();
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  await userEvent.keyboard("{Escape}");

  expect(onChange).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

  await expectNoAccessibilityViolations(document.body);
});

test("does not accept a filter without a label, its options, a chosen value or an onChange handler", () => {
  expectTypeOf<{
    options: typeof options;
    value: Status;
    onChange: (value: Status) => void;
  }>().not.toExtend<ListFilterProps<Status>>();
  expectTypeOf<{
    label: string;
    value: Status;
    onChange: (value: Status) => void;
  }>().not.toExtend<ListFilterProps<Status>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    onChange: (value: Status) => void;
  }>().not.toExtend<ListFilterProps<Status>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: Status;
  }>().not.toExtend<ListFilterProps<Status>>();
});

test("does not accept an empty options list", () => {
  expectTypeOf<{
    label: string;
    options: [];
    value: Status;
    onChange: (value: Status) => void;
  }>().not.toExtend<ListFilterProps<Status>>();
});

// A call that fails to compile can't sit in this file as literal code, so the first (generic)
// overload only matches a call whose `value`/`onChange` truly fit the inferred V; an invalid call
// falls through to the second (fallback) overload instead, resolving to `false`.
type ListFilterValueOnlyProps<V extends string> = {
  options: readonly [Pick<ListFilterOption<V>, "value">, ...Pick<ListFilterOption<V>, "value">[]];
  value: ListFilterProps<V>["value"];
  onChange: ListFilterProps<V>["onChange"];
};

function isValidListFilterCall<V extends string>(props: ListFilterValueOnlyProps<V>): true;
function isValidListFilterCall(props: unknown): false;
function isValidListFilterCall(_props: unknown): boolean {
  return true;
}

test("cannot widen V through `value` at a real call site with no explicit type argument", () => {
  const validCall = isValidListFilterCall({
    options: [{ value: "all" }, { value: "open" }],
    value: "all",
    onChange: () => {},
  });
  expectTypeOf(validCall).toEqualTypeOf<true>();

  const invalidCall = isValidListFilterCall({
    options: [{ value: "all" }, { value: "open" }],
    value: "other",
    onChange: () => {},
  });
  expectTypeOf(invalidCall).toEqualTypeOf<false>();
});

import { expect, expectTypeOf, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenBackgroundColor, tokenRgb } from "../test/token-colors";
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

// The value's own min-w-7 (see AriaSelectValue's own comment in ListFilter.tsx) - kept as one
// named constant instead of repeating the literal, so every assertion that pins the floor's own
// value moves together if that number ever changes.
const VALUE_FLOOR_PX = 28;

// The trigger's own border box has its own 2px border and 12px of padding past its actual
// content - real slack a comparison against the border box alone would hide behind, letting
// something that overflows into the padding (though not literally past the trigger's own drawn
// edge) still read as "contained". Content edge, not border edge, is what containment means here.
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
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderWidth).toBe("2px");
  expect(style.borderColor).toBe(tokenRgb("line"));
  expect(style.paddingLeft).toBe("12px");
  expect(style.paddingRight).toBe("12px");
  expect(style.columnGap).toBe("8px");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the label in 14px secondary text and the chosen value in 16px bold ink", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });
  const label = trigger.getByText("Estado", { exact: true }).element() as HTMLElement;
  const value = trigger.getByText("Todos", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(label).fontSize).toBe("14px");
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink-secondary"));
  expect(getComputedStyle(value).fontSize).toBe("16px");
  expect(getComputedStyle(value).fontWeight).toBe("700");
  expect(getComputedStyle(value).color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a 16px down chevron in secondary text when closed", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  const icon = trigger.querySelector("svg") as SVGSVGElement;
  const rect = icon.getBoundingClientRect();

  expect(icon.classList.contains("lucide-chevron-down")).toBe(true);
  expect(rect.width).toBeGreaterThan(15);
  expect(rect.width).toBeLessThan(17);
  expect(getComputedStyle(icon).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a visible focus outline in strong blue when reached by keyboard", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(trigger).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(trigger).outlineOffset).toBe("3px");
  await expect
    .poll(() => getComputedStyle(trigger).outlineColor)
    .toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("turns the border blue UI and the chevron up when opened", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });

  await trigger.click();

  await expect
    .poll(() => getComputedStyle(trigger.element()).borderColor)
    .toBe(tokenRgb("brand-blue-ui"));
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  const icon = trigger.element().querySelector("svg") as SVGSVGElement;
  expect(icon.classList.contains("lucide-chevron-up")).toBe(true);

  await expectNoAccessibilityViolations(document.body);
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
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderWidth).toBe("1px");
  expect(style.borderColor).toBe(tokenRgb("line"));
  expect(style.boxShadow).toContain("8px");
  expect(style.boxShadow).toContain("24px");
  expect(style.boxShadow).toContain(tokenBackgroundColor("ink-menu-shadow"));

  // react-aria is free to flip the menu to the trigger's opposite side when there isn't room on
  // its preferred side (proven below with a trigger placed too low for that to fit), so the gap
  // is checked against whichever side it actually rendered on, read from its own data-placement,
  // never assumed to be "below" just because there happens to be room for it in this render.
  const placement = menu.getAttribute("data-placement");
  expect(placement).toBe("bottom");
  const triggerRect = trigger.element().getBoundingClientRect();
  const gap = placement === "top" ? triggerRect.top - rect.bottom : rect.top - triggerRect.bottom;
  expect(gap).toBeGreaterThan(3);
  expect(gap).toBeLessThan(5);

  await expectNoAccessibilityViolations(document.body);
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

  // This file's tests share one browser tab, so a viewport left at 320x400 here would silently
  // carry into whatever test runs next. Proves the restore above actually took effect, instead of
  // trusting the call's success alone.
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
  // Not just capped in width: proves the chosen value truncated to fit on one line instead of
  // wrapping. trigger.scrollHeight === trigger.clientHeight alone can't tell a single line from
  // exactly two: at this trigger's own 40px content box (44px h-11 minus its own 2px+2px
  // border-2), two 20px lines fill it exactly, with nothing left over to register as overflow.
  // Comparing the value's own rendered height against a single line height (its own line-height)
  // catches that case too, not just a third line spilling past the box.
  const valueLineHeight = Number.parseFloat(getComputedStyle(value).lineHeight);
  expect(value.getBoundingClientRect().height).toBeLessThanOrEqual(valueLineHeight + 1);

  await expectNoAccessibilityViolations(screen.container);
});

// A value narrower than min-w-7 still raises the trigger's own shrink-to-fit width to reserve
// that floor, so nothing here needs to shrink at all.
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

// The value's own min-w-7 gives a short value (narrower than the floor) a wider box than its own
// text needs, so text-align keeps the glyphs flush against the box's own trailing edge instead of
// its leading one - otherwise the visible gap before the chevron would grow with how much shorter
// than 28px the value's own text is, instead of staying the trigger's own fixed gap-2 (8px) for
// every value regardless of length. Measures the visible distance (a Range around the text, not
// the box's own width, which stays 28px either way).
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

  const textRange = document.createRange();
  textRange.selectNodeContents(value);
  const textRight = textRange.getBoundingClientRect().right;

  expect(chevron.getBoundingClientRect().left - textRight).toBeCloseTo(8, 0);

  await expectNoAccessibilityViolations(screen.container);
});

// Containment is checked against the content edge, not the border box: the trigger's own border
// and padding are slack a border-box comparison would hide behind.
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
  // AriaSelectValue's own rendered content reuses the listbox option's own JSX (including its
  // own nested truncate span), so the flex item that actually carries the min-width floor is the
  // trigger's own second direct child, not whatever getByText happens to match inside it.
  const value = trigger.children[1] as HTMLElement;
  const chevron = trigger.querySelector("svg") as SVGSVGElement;
  const contentRight = contentEdgeRight(trigger);

  // Whole: rendered at its own natural (scroll) width, nothing clipped off it.
  expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);

  // The value alone gave up the room: truncated, but never down to nothing - it still keeps
  // more than just its own bare ellipsis here, since there's room past the label's own width.
  expect(value.scrollWidth).toBeGreaterThan(value.clientWidth);
  expect(value.getBoundingClientRect().width).toBeGreaterThan(VALUE_FLOOR_PX);

  // Nothing paints past the trigger's own content edge.
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

  // Both give way: the label truncates too, not just wraps or overflows - a height comparison
  // against its own single line-height proves it never wrapped either, while it's shorter than
  // its own full scroll width proves it's genuinely clipped, not merely narrow by coincidence.
  const labelLineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
  expect(label.getBoundingClientRect().height).toBeLessThanOrEqual(labelLineHeight + 1);
  expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);

  // The value is pinned at exactly its own floor here, not just "some width greater than zero" -
  // that weaker check holds identically whether the floor is 28px, 1px or absent altogether
  // (nothing else in this scenario stops the value shrinking further on its own), so only a
  // direct comparison against the floor's own value actually exercises min-w-7 itself.
  expect(value.getBoundingClientRect().width).toBeCloseTo(VALUE_FLOOR_PX, 0);

  // Nothing paints past the trigger's own content edge, even here.
  expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight);
  expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight);
  expect(chevron.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight);

  await expectNoAccessibilityViolations(screen.container);
});

// Pins the common, unconstrained case: truncate's own overflow-hidden makes a stray truncation
// invisible to a one-line height check alone (a clipped single line is still exactly one line
// tall), so only comparing the label's own scrollWidth against its clientWidth catches it.
test("keeps the label fully legible, not truncated, when there's room for everything", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const label = screen
    .getByRole("button", { name: /Estado/ })
    .getByText("Estado", { exact: true })
    .element() as HTMLElement;

  expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);

  await expectNoAccessibilityViolations(screen.container);
});

// A width/overflow check can't tell truncate's own ellipsis apart from a silent clip - both
// clip to the same box. Only computed text-overflow catches that swap.
test("shows an ellipsis, not a silent clip, on both the label and the value", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  const label = trigger.children[0] as HTMLElement;
  const value = trigger.children[1] as HTMLElement;

  expect(getComputedStyle(label).textOverflow).toBe("ellipsis");
  expect(getComputedStyle(value).textOverflow).toBe("ellipsis");

  await expectNoAccessibilityViolations(screen.container);
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
  // The 40 options need more height than the popover's own capped max-height leaves it, so this
  // only holds if that overflow is real (not a popover already tall enough to fit everything).
  expect(menu.scrollHeight).toBeGreaterThan(menu.clientHeight);

  // The real clip proof: a point just past the popover's own bottom edge, where an unclipped
  // option would otherwise still paint, must not resolve to any option. Guarded against a null
  // hit test (an out-of-viewport probe would otherwise pass vacuously, the same escape hatch the
  // corner test guards against) and against landing on an option's own inner span or icon rather
  // than the option itself (whose own role lives on the <li>, not on any of its children).
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

  // The element focus itself lands on (the <li role="option">, via data-focused) is not the same
  // element that scrolls (the popover, its ancestor) - proving the option actually stays inside
  // the popover's own visible box is what shows that mismatch didn't break scroll-into-view.
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

  // scrollHeight === clientHeight is only meaningful once the label can't just wrap and overflow
  // the fixed row invisibly (overflow: visible would keep both equal at 40 either way) - ellipsis
  // truncation single-lines the text instead, which this and the style checks below both prove.
  expect(option.scrollHeight).toBe(option.clientHeight);
  const span = option.querySelector("span") as HTMLElement;
  const spanStyle = getComputedStyle(span);
  expect(spanStyle.textOverflow).toBe("ellipsis");
  expect(spanStyle.whiteSpace).toBe("nowrap");
  expect(spanStyle.overflow).toBe("hidden");

  // Painted proof: nothing from this option's own text reaches into the next option's row.
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

  await expectNoAccessibilityViolations(document.body);
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
  expect(style.color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(document.body);
});

test("highlights a hovered option with a bone background", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  await screen.getByRole("button", { name: /Estado/ }).click();
  const option = screen.getByRole("option", { name: "Abiertas" });

  await userEvent.hover(option.element());
  await expect
    .poll(() => getComputedStyle(option.element()).backgroundColor)
    .toBe(tokenRgb("surface-bone"));

  await expectNoAccessibilityViolations(document.body);
});

test("highlights a keyboard-focused option with a bone background", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);

  await userEvent.tab();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  const focused = screen.getByRole("option", { name: "Todos" });
  await expect
    .poll(() => getComputedStyle(focused.element()).backgroundColor)
    .toBe(tokenRgb("surface-bone"));

  await expectNoAccessibilityViolations(document.body);
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
  expect(getComputedStyle(check).color).toBe(tokenRgb("brand-blue-strong"));
  expect(unchosen.querySelector("svg")).toBeNull();

  await expectNoAccessibilityViolations(document.body);
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

// selectedKey makes this a fully controlled select: it asks for "open" but shows whatever value
// prop the caller actually gives back, never the option that was merely clicked. A caller whose
// onChange does nothing leaves value at "all", so the trigger must keep reading "Todos".
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

// react-aria's own Select treats a selectedKey with no matching option as no selection, so this
// pins its stable, load-bearing facts (the stale label disappears, react-aria's own
// data-placeholder marker takes its place, the trigger keeps a real name) rather than the exact,
// locale-dependent placeholder wording.
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
  // Not the placeholder's own exact wording (react-aria's default, locale-dependent — see above),
  // but that the trigger still resolves to a real, non-empty accessible name starting with the
  // label: aria-labelledby reads the placeholder span's own text live, same as any other value.
  expect(screen.getByRole("button", { name: /^Estado\s+\S/ }).element()).toBe(trigger.element());

  await expectNoAccessibilityViolations(screen.container);
});

// What assistive technology actually announces on this trigger: not just "Estado" (the label
// alone would leave a screen reader user with no idea which option is currently chosen), but the
// label and the current value together, the same sentence the visible text already reads.
test("names the trigger for assistive technology with both its label and its current value", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);

  await expect
    .element(screen.getByRole("button", { name: "Estado Todos", exact: true }))
    .toBeVisible();
});

// labelId/valueId come from useId(), which React guarantees unique per component instance (and
// distinct from any hand-authored id, via its reserved ":" characters) — never a literal like
// "all" that could repeat across two filters or collide with a caller's own markup. The options'
// own ids (react-aria's internal collection keys, built from the raw option value) get the same
// guarantee from react-aria itself: each Select instance prefixes them with its own generated id.
// Two filters sharing the exact same option values, rendered together, prove both hold in the
// real DOM: every id is actually unique, and each trigger's name still resolves to its own value.
// Duplicate values have no sensible interpretation the types could forbid (nothing stops two
// independent array entries from sharing a `value`, for any V), so this is a runtime question:
// react-aria's own collection is keyed by `id` (this component's `option.value`), the same Map
// semantics as any JS object or Map literal — the last entry with a given key is the only one
// that exists. Pinned here rather than guarded against, since it's exactly the unsurprising
// "last write wins" a caller already gets from writing `{ ...a, ...b }` with duplicate keys.
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

  // Both trigger's own label/value spans stay in the DOM at once; each filter's options only
  // exist while its own menu is open, so each set is captured separately, one menu at a time.
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

  await expectNoAccessibilityViolations(document.body);
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

// Proves the NoInfer fix at a real call site with no explicit type argument, the way JSX actually
// invokes the component: TypeScript must reject `value: "other"` by inferring V from `options`
// alone, not by widening V to also cover `value`. `label` is dropped since it doesn't participate
// in V at all.
//
// A call that fails to compile can't sit in this file as literal code, and this project bans
// `@ts-expect-error`, so the first (generic) overload only matches a call whose `value`/`onChange`
// truly fit the inferred V; an invalid call falls through to the second (fallback) overload
// instead of failing to compile, resolving to `false`.
type ListFilterValueOnlyProps<V extends string> = {
  options: readonly [Pick<ListFilterOption<V>, "value">, ...Pick<ListFilterOption<V>, "value">[]];
  value: ListFilterProps<V>["value"];
  onChange: ListFilterProps<V>["onChange"];
};

function isValidListFilterCall<V extends string>(props: ListFilterValueOnlyProps<V>): true;
function isValidListFilterCall(props: unknown): false;
// This test only cares about which overload TypeScript picks, never about a runtime result, so
// the implementation itself is a stub: it exists only so the type-only overloads above have a
// real function to call, instead of throwing at runtime.
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

import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenBackgroundColor, tokenRgb } from "../../test/token-colors";
import { Keycap, type KeyName } from "./keycap";

const labels: ReadonlyArray<readonly [KeyName, string]> = [
  ["Escape", "Esc"],
  ["Enter", "Enter"],
  ["Delete", "Supr"],
  ["Space", "Espacio"],
  ["F2", "F2"],
  ["F12", "F12"],
  ["ArrowUpDown", "↑↓"],
  ["ArrowLeftRight", "←→"],
  ["Digits", "0-9"],
  ["Q", "Q"],
  ["7", "7"],
];

test("writes the label of each key itself", async () => {
  for (const [keyName, label] of labels) {
    const screen = await render(<Keycap keyName={keyName} />);

    expect(screen.container.textContent, keyName).toBe(label);
  }
});

test("is a keyboard key element", async () => {
  const screen = await render(
    <main>
      <Keycap keyName="F2" />
    </main>,
  );

  expect(screen.container.querySelector("kbd")?.textContent).toBe("F2");
  await expectNoAccessibilityViolations(document.body);
});

test("draws a small white rounded badge with a border and monospace text", async () => {
  const screen = await render(<Keycap keyName="F2" />);

  const style = getComputedStyle(screen.getByText("F2").element());
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(style.borderTopLeftRadius).toBe("6px");
  expect(style.fontFamily).toContain("monospace");
});

test("draws a translucent badge with white text on a dark primary surface", async () => {
  const screen = await render(<Keycap keyName="Enter" variant="onPrimary" />);

  const style = getComputedStyle(screen.getByText("Enter").element());
  expect(style.backgroundColor).toBe(tokenBackgroundColor("surface-nav-subtle"));
  expect(style.color).toBe(tokenRgb("text-inverse"));
});

test("accepts only the names of the keys the register uses", () => {
  expectTypeOf<"Escape">().toExtend<KeyName>();
  expectTypeOf<"F12">().toExtend<KeyName>();
  expectTypeOf<"Digits">().toExtend<KeyName>();
  expectTypeOf<"Z">().toExtend<KeyName>();
  expectTypeOf<"9">().toExtend<KeyName>();
  expectTypeOf<"F1">().not.toExtend<KeyName>();
  expectTypeOf<"F13">().not.toExtend<KeyName>();
  expectTypeOf<"a">().not.toExtend<KeyName>();
  expectTypeOf<"10">().not.toExtend<KeyName>();
  expectTypeOf<"Tab">().not.toExtend<KeyName>();
});

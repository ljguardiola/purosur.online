import { ScanBarcode } from "lucide-react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { insetBoundary, paintedBoxShadowLayers, tokenRgb } from "../../test/token-colors";
import { SearchField, type SearchFieldProps } from "./search-field";

function Harness({
  initial = "",
  ...props
}: Partial<Pick<SearchFieldProps, "invalid" | "action">> & { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <SearchField
      value={value}
      onChange={setValue}
      placeholder="Escaneá o escribí el nombre"
      icon={<ScanBarcode />}
      {...props}
    />
  );
}

const closeAction = (onPress: () => void) => ({
  label: "Cerrar",
  keyName: "Escape" as const,
  onPress,
});

function box(screen: Awaited<ReturnType<typeof render>>): HTMLElement {
  return screen.getByRole("searchbox").element().parentElement as HTMLElement;
}

test("draws a red border when invalid, and keeps it while focused", async () => {
  const screen = await render(<Harness initial="7790000000123" invalid />);

  expect(paintedBoxShadowLayers(box(screen))).toEqual([insetBoundary("error", "2px")]);
  await userEvent.tab();
  await expect
    .poll(() => paintedBoxShadowLayers(box(screen)))
    .toEqual([insetBoundary("error", "2px")]);
  expect(getComputedStyle(box(screen)).backgroundColor).toBe(tokenRgb("surface"));
});

test("announces itself invalid when invalid, and not otherwise", async () => {
  const invalid = await render(<Harness invalid />);
  expect(invalid.getByRole("searchbox").element().getAttribute("aria-invalid")).toBe("true");
  await invalid.unmount();

  const valid = await render(<Harness />);
  expect(valid.getByRole("searchbox").element().getAttribute("aria-invalid")).not.toBe("true");
});

test("shows its key action inside the field, after the input, with the key before the label", async () => {
  const screen = await render(<Harness initial="alm" action={closeAction(() => {})} />);

  const fieldBox = box(screen).getBoundingClientRect();
  const input = screen.getByRole("searchbox").element().getBoundingClientRect();
  const action = screen.getByRole("button", { name: "Cerrar" }).element();
  const actionBox = action.getBoundingClientRect();
  const keycap = action.querySelector("kbd") as HTMLElement;
  expect(keycap.textContent).toBe("Esc");
  expect(actionBox.left).toBeGreaterThanOrEqual(input.right - 1);
  expect(actionBox.right).toBeLessThanOrEqual(fieldBox.right);
  expect(box(screen).contains(action)).toBe(true);
  expect(keycap.getBoundingClientRect().right).toBeLessThan(
    screen.getByText("Cerrar").element().getBoundingClientRect().left,
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("names the action by its label alone, leaving the key out", async () => {
  const screen = await render(<Harness action={closeAction(() => {})} />);

  await expect.element(screen.getByRole("button", { name: "Cerrar", exact: true })).toBeVisible();
});

test("calls the action when pressed, without clearing what was typed", async () => {
  const onPress = vi.fn();
  const screen = await render(<Harness initial="alm" action={closeAction(onPress)} />);

  await screen.getByRole("button", { name: "Cerrar" }).click();

  expect(onPress).toHaveBeenCalledTimes(1);
  expect((screen.getByRole("searchbox").element() as HTMLInputElement).value).toBe("alm");
});

test("draws no action when none is given", async () => {
  const screen = await render(<Harness />);

  expect(screen.getByRole("button").elements()).toHaveLength(0);
});

test("combines the error border with a key action", async () => {
  const screen = await render(<Harness initial="7790000000123" invalid action={closeAction(() => {})} />);

  expect(paintedBoxShadowLayers(box(screen))).toEqual([insetBoundary("error", "2px")]);
  await expectNoAccessibilityViolations(screen.container);
});

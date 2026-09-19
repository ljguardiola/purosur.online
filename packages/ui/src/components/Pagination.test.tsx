import { expect, expectTypeOf, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { Pagination, type PaginationProps } from "./Pagination";

function baseProps(overrides: Partial<PaginationProps> = {}): PaginationProps {
  return {
    page: 1,
    pageCount: 3,
    onPageChange: () => {},
    previousLabel: "Anterior",
    nextLabel: "Siguiente",
    ...overrides,
  };
}

test("renders nothing with a single page", async () => {
  const screen = await render(<Pagination {...baseProps({ pageCount: 1 })} />);

  expect(screen.container.innerHTML).toBe("");
});

test("renders every page number up to 5 pages, 36px high with 8px between buttons", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 2, pageCount: 5 })} />);

  for (const page of ["1", "2", "3", "4", "5"]) {
    await expect.element(screen.getByRole("button", { name: page, exact: true })).toBeVisible();
  }
  const first = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;
  const second = screen.getByRole("button", { name: "2", exact: true }).element() as HTMLElement;
  const rect = first.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(35);
  expect(rect.height).toBeLessThan(37);
  expect(getComputedStyle(first).borderRadius).toBe("6px");
  expect(getComputedStyle(first).paddingLeft).toBe("12px");

  const gap = second.getBoundingClientRect().left - first.getBoundingClientRect().right;
  expect(gap).toBeGreaterThan(7);
  expect(gap).toBeLessThan(9);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a page button white with a 1px line border and 14px ink text", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);
  const page = screen.getByRole("button", { name: "3", exact: true }).element() as HTMLElement;
  const style = getComputedStyle(page);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderWidth).toBe("1px");
  expect(style.borderColor).toBe(tokenRgb("line"));
  expect(style.fontSize).toBe("14px");
  expect(style.color).toBe(tokenRgb("ink"));
  expect(style.fontWeight).toBe("400");

  await expectNoAccessibilityViolations(screen.container);
});

test("marks the current page blue UI with bold white text", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 3, pageCount: 5 })} />);
  const current = screen.getByRole("button", { name: "3", exact: true }).element() as HTMLElement;
  const style = getComputedStyle(current);

  expect(style.backgroundColor).toBe(tokenRgb("brand-blue-ui"));
  expect(style.color).toBe(tokenRgb("surface-white"));
  expect(style.fontWeight).toBe("700");
  expect(current.getAttribute("aria-current")).toBe("page");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows 1 2 3 … 24 when the current page is among the first three", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 24 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "2", "3", "…", "24"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows 1 … 10 … 24 when the current page is in the middle", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 10, pageCount: 24 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "…", "10", "…", "24"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows 1 … 22 23 24 when the current page is among the last three", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 23, pageCount: 24 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "…", "22", "23", "24"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps 5 fixed places across every page of a long list", async () => {
  for (const page of [1, 2, 12, 23, 24]) {
    const screen = await render(<Pagination {...baseProps({ page, pageCount: 24 })} />);
    const numbers = screen.container.querySelectorAll("li");

    expect(numbers).toHaveLength(5);
    await screen.unmount();
  }
});

test("shows every number with no ellipsis when there are exactly 5 pages", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 3, pageCount: 5 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "2", "3", "4", "5"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("switches from the start window to the end window between pages 3 and 4 of 6", async () => {
  const startWindow = await render(<Pagination {...baseProps({ page: 3, pageCount: 6 })} />);
  const startNumbers = startWindow.container.querySelectorAll("li");
  expect(Array.from(startNumbers).map((el) => el.textContent)).toEqual(["1", "2", "3", "…", "6"]);
  await startWindow.unmount();

  const endWindow = await render(<Pagination {...baseProps({ page: 4, pageCount: 6 })} />);
  const endNumbers = endWindow.container.querySelectorAll("li");
  expect(Array.from(endNumbers).map((el) => el.textContent)).toEqual(["1", "…", "4", "5", "6"]);
});

test("covers the start, middle and end windows across pages 3, 4 and 5 of 7", async () => {
  const startWindow = await render(<Pagination {...baseProps({ page: 3, pageCount: 7 })} />);
  expect(
    Array.from(startWindow.container.querySelectorAll("li")).map((el) => el.textContent),
  ).toEqual(["1", "2", "3", "…", "7"]);
  await startWindow.unmount();

  const middleWindow = await render(<Pagination {...baseProps({ page: 4, pageCount: 7 })} />);
  expect(
    Array.from(middleWindow.container.querySelectorAll("li")).map((el) => el.textContent),
  ).toEqual(["1", "…", "4", "…", "7"]);
  await middleWindow.unmount();

  const endWindow = await render(<Pagination {...baseProps({ page: 5, pageCount: 7 })} />);
  expect(
    Array.from(endWindow.container.querySelectorAll("li")).map((el) => el.textContent),
  ).toEqual(["1", "…", "5", "6", "7"]);
});

test("treats a page below 1 as page 1", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 0, pageCount: 5, onPageChange })} />,
  );
  const current = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();

  await screen.getByRole("button", { name: "Siguiente" }).click();
  expect(onPageChange).toHaveBeenCalledWith(2);

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a page above the count as the last page", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 6, pageCount: 5, onPageChange })} />,
  );
  const current = screen.getByRole("button", { name: "5", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();

  await screen.getByRole("button", { name: "Anterior" }).click();
  expect(onPageChange).toHaveBeenCalledWith(4);

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a NaN page as page 1", async () => {
  const screen = await render(<Pagination {...baseProps({ page: Number.NaN, pageCount: 5 })} />);
  const current = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a positive infinite page as the last page", async () => {
  const screen = await render(
    <Pagination {...baseProps({ page: Number.POSITIVE_INFINITY, pageCount: 5 })} />,
  );
  const current = screen.getByRole("button", { name: "5", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a negative infinite page as page 1", async () => {
  const screen = await render(
    <Pagination {...baseProps({ page: Number.NEGATIVE_INFINITY, pageCount: 5 })} />,
  );
  const current = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("truncates a fractional page instead of rounding it", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 2.5, pageCount: 5 })} />);
  const current = screen.getByRole("button", { name: "2", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");

  await expectNoAccessibilityViolations(screen.container);
});

test("truncates a fractional page count instead of rounding it", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 5.9 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "2", "3", "4", "5"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders nothing with a non-finite or below-2 page count", async () => {
  for (const pageCount of [Number.NaN, Number.POSITIVE_INFINITY, 1.9]) {
    const screen = await render(<Pagination {...baseProps({ page: 1, pageCount })} />);

    expect(screen.container.innerHTML).toBe("");
    await screen.unmount();
  }
});

test("disables Previous on the first page and Next on the last page", async () => {
  const firstPage = await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);
  await expect.element(firstPage.getByRole("button", { name: "Anterior" })).toBeDisabled();
  await expect.element(firstPage.getByRole("button", { name: "Siguiente" })).toBeEnabled();
  await firstPage.unmount();

  const lastPage = await render(<Pagination {...baseProps({ page: 5, pageCount: 5 })} />);
  await expect.element(lastPage.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  await expect.element(lastPage.getByRole("button", { name: "Anterior" })).toBeEnabled();
});

test("gives the caller the chosen page when a page button is pressed", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 1, pageCount: 5, onPageChange })} />,
  );

  await screen.getByRole("button", { name: "4", exact: true }).click();

  expect(onPageChange).toHaveBeenCalledWith(4);
});

test("does nothing when the current page's own button is pressed, but stays focusable", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 3, pageCount: 5, onPageChange })} />,
  );
  const current = screen.getByRole("button", { name: "3", exact: true });

  await current.click();

  expect(onPageChange).not.toHaveBeenCalled();
  await expect.element(current).toBeEnabled();
  expect(current.element().getAttribute("aria-current")).toBe("page");
});

test("moves to the previous and next page", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 3, pageCount: 5, onPageChange })} />,
  );

  await screen.getByRole("button", { name: "Anterior" }).click();
  expect(onPageChange).toHaveBeenLastCalledWith(2);

  await screen.getByRole("button", { name: "Siguiente" }).click();
  expect(onPageChange).toHaveBeenLastCalledWith(4);
});

test("does not accept a pagination without its page, page count, change handler or button labels", () => {
  expectTypeOf<{
    pageCount: number;
    onPageChange: (page: number) => void;
    previousLabel: string;
    nextLabel: string;
  }>().not.toExtend<PaginationProps>();
  expectTypeOf<{
    page: number;
    onPageChange: (page: number) => void;
    previousLabel: string;
    nextLabel: string;
  }>().not.toExtend<PaginationProps>();
  expectTypeOf<{
    page: number;
    pageCount: number;
    previousLabel: string;
    nextLabel: string;
  }>().not.toExtend<PaginationProps>();
  expectTypeOf<{
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
  }>().not.toExtend<PaginationProps>();
});

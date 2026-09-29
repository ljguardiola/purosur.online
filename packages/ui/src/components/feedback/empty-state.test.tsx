import { PackageSearch } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { EmptyState, type EmptyStateProps } from "./empty-state";

test("renders the title, the detail and the caller's actions", async () => {
  const screen = await render(
    <EmptyState
      icon={<PackageSearch />}
      title="No matches"
      description="Try a different filter."
      variant="filtered"
      actions={<button type="button">Clear filters</button>}
    />,
  );

  await expect.element(screen.getByText("No matches")).toBeVisible();
  await expect.element(screen.getByText("Try a different filter.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("colors the icon in blue strong when there is nothing yet and in secondary text when nothing matches", async () => {
  const blank = await render(
    <EmptyState icon={<PackageSearch />} title="Nothing yet" variant="blank" />,
  );
  const blankIcon = blank.container.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(blankIcon).color).toBe(tokenRgb("text-accent"));
  expect(blankIcon.closest('[aria-hidden="true"]')).not.toBeNull();

  const filtered = await render(
    <EmptyState icon={<PackageSearch />} title="No matches" variant="filtered" />,
  );
  const filteredIcon = filtered.container.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(filteredIcon).color).toBe(tokenRgb("text-subtle"));
});

test("renders only the title under the icon when it has no detail", async () => {
  const screen = await render(
    <EmptyState icon={<PackageSearch />} title="No archived products" variant="filtered" />,
  );

  expect(screen.container.querySelectorAll("p")).toHaveLength(1);
});

test("requires an icon, a title and a variant", () => {
  expectTypeOf<{ title: string; variant: "blank" }>().not.toExtend<EmptyStateProps>();
});

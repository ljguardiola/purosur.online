import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { sectionIcon } from "./sectionIcons";

test("resolves a registered icon name to its own svg", async () => {
  const screen = await render(<div data-testid="probe">{sectionIcon("flag")}</div>);

  const svg = screen.getByTestId("probe").element().querySelector("svg");
  expect(svg?.getAttribute("class")).toContain("lucide-flag");
});

test("falls back to a generic icon for an unregistered name", async () => {
  const screen = await render(<div data-testid="probe">{sectionIcon("not-a-real-icon")}</div>);

  const svg = screen.getByTestId("probe").element().querySelector("svg");
  expect(svg).not.toBeNull();
});

test("falls back to the same generic icon when no name is given", async () => {
  const withName = await render(<div data-testid="probe">{sectionIcon("not-a-real-icon")}</div>);
  const withoutName = await render(<div data-testid="probe2">{sectionIcon(undefined)}</div>);

  const withNameClass = withName
    .getByTestId("probe")
    .element()
    .querySelector("svg")
    ?.getAttribute("class");
  const withoutNameClass = withoutName
    .getByTestId("probe2")
    .element()
    .querySelector("svg")
    ?.getAttribute("class");
  expect(withoutNameClass).toBe(withNameClass);
});

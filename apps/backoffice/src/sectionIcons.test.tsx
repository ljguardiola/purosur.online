import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { sectionIcon } from "./sectionIcons";

async function iconClass(name: string | undefined, testId: string) {
  const screen = await render(<div data-testid={testId}>{sectionIcon(name)}</div>);
  return screen.getByTestId(testId).element().querySelector("svg")?.getAttribute("class");
}

for (const name of [
  "flag",
  "tag",
  "boxes",
  "clipboard-list",
  "landmark",
  "chart-column",
  "users",
  "bell",
]) {
  test(`resolves the "${name}" section icon to its own svg`, async () => {
    expect(await iconClass(name, `probe-${name}`)).toContain(`lucide-${name}`);
  });
}

test("falls back to a generic icon for an unregistered name", async () => {
  const screen = await render(<div data-testid="probe">{sectionIcon("not-a-real-icon")}</div>);

  const svg = screen.getByTestId("probe").element().querySelector("svg");
  expect(svg).not.toBeNull();
});

test("falls back to the same generic icon when no name is given", async () => {
  const withName = await iconClass("not-a-real-icon", "probe");
  const withoutName = await iconClass(undefined, "probe2");

  expect(withoutName).toBe(withName);
});

for (const inherited of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
  test(`falls back to the generic icon for the inherited object key "${inherited}"`, async () => {
    const generic = await iconClass(undefined, `generic-${inherited}`);

    expect(await iconClass(inherited, `probe-${inherited}`)).toBe(generic);
  });
}

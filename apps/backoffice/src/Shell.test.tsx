import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Shell } from "./Shell";

test("lays out the area rail, section column and content as three landmark regions", async () => {
  const screen = await render(
    <Shell areaRailLabel="Áreas" rail={<p>rail content</p>} sectionColumn={<p>section content</p>}>
      <p>main content</p>
    </Shell>,
  );

  const nav = screen.getByRole("navigation", { name: "Áreas" });
  await expect.element(nav).toBeVisible();
  await expect.element(nav.getByText("rail content")).toBeVisible();

  const main = screen.getByRole("main");
  await expect.element(main).toBeVisible();
  await expect.element(main.getByText("main content")).toBeVisible();

  await expect.element(screen.getByText("section content")).toBeVisible();
});

test("renders the rail before the section column and the section column before the content, in DOM order", async () => {
  const screen = await render(
    <Shell areaRailLabel="Áreas" rail={<p>rail content</p>} sectionColumn={<p>section content</p>}>
      <p>main content</p>
    </Shell>,
  );

  const texts = Array.from(screen.container.querySelectorAll("p")).map(
    (element) => element.textContent,
  );

  expect(texts).toEqual(["rail content", "section content", "main content"]);
});

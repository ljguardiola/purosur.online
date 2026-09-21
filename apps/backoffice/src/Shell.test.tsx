import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Shell } from "./Shell";

function renderShell() {
  return render(
    <Shell
      areaRailLabel="Áreas"
      sectionColumnLabel="Secciones"
      rail={<p>rail content</p>}
      sectionColumn={<p>section content</p>}
    >
      <p>main content</p>
    </Shell>,
  );
}

test("lays out the area rail, section column and content as three landmark regions", async () => {
  const screen = await renderShell();

  const rail = screen.getByRole("navigation", { name: "Áreas" });
  await expect.element(rail).toBeVisible();
  await expect.element(rail.getByText("rail content")).toBeVisible();

  const sections = screen.getByRole("navigation", { name: "Secciones" });
  await expect.element(sections).toBeVisible();
  await expect.element(sections.getByText("section content")).toBeVisible();

  const main = screen.getByRole("main");
  await expect.element(main).toBeVisible();
  await expect.element(main.getByText("main content")).toBeVisible();
});

test("renders the rail before the section column and the section column before the content, in DOM order", async () => {
  const screen = await renderShell();

  const texts = Array.from(screen.container.querySelectorAll("p")).map(
    (element) => element.textContent,
  );

  expect(texts).toEqual(["rail content", "section content", "main content"]);
});

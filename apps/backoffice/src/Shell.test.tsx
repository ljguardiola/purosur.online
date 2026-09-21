import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Shell } from "./Shell";

function renderShell() {
  return render(
    <Shell
      brandName="Puro Sur"
      areaRailLabel="Áreas"
      sectionColumnLabel="Secciones"
      railFooter={<p>rail footer</p>}
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
  await expect.element(rail.getByText("rail footer")).toBeVisible();

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

  expect(texts).toEqual(["rail footer", "section content", "main content"]);
});

test("heads the rail with the brand-named 40px isotype inside the rail's 16px top padding", async () => {
  const screen = await renderShell();

  const rail = screen.getByRole("navigation", { name: "Áreas" }).element();
  const isotype = rail.querySelector("img") as HTMLImageElement;
  expect(isotype).not.toBeNull();
  expect(isotype.src).toContain("puro-sur-iso");
  expect(isotype.getAttribute("alt")).toBe("Puro Sur");
  expect(rail.firstElementChild).toBe(isotype);

  const railRect = rail.getBoundingClientRect();
  const isotypeRect = isotype.getBoundingClientRect();
  expect(isotypeRect.width).toBeCloseTo(40, 0);
  expect(isotypeRect.height).toBeCloseTo(40, 0);
  expect(isotypeRect.top - railRect.top).toBeCloseTo(16, 0);
  expect(isotypeRect.left - railRect.left).toBeCloseTo(20, 0);
});

test("pins the rail footer to the rail's foot, above its 16px bottom padding", async () => {
  const screen = await renderShell();

  const rail = screen.getByRole("navigation", { name: "Áreas" }).element();
  const footer = screen.getByText("rail footer").element();

  expect(rail.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom).toBeCloseTo(
    16,
    0,
  );
});

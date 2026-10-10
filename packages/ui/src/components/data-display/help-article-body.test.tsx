import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { HelpBlock } from "../../messages/help";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { HelpArticleBody } from "./help-article-body";

type Id = "other-section";

const body: readonly HelpBlock<Id>[] = [
  { kind: "heading", text: "Antes de empezar" },
  { kind: "paragraph", text: "Revisá el carrito." },
  { kind: "steps", items: ["Tocá Cancelar", "Confirmá"] },
  { kind: "note", text: "No se cobra nada." },
  { kind: "articleLink", article: "other-section" },
];

function renderBody(blocks: readonly HelpBlock<Id>[]) {
  return render(
    <HelpArticleBody
      body={blocks}
      renderArticleLink={(articleId) => <a href={`#${articleId}`}>Ir a {articleId}</a>}
    />,
  );
}

test("renders a heading as a level 2 heading", async () => {
  const screen = await renderBody(body);

  await expect
    .element(screen.getByRole("heading", { level: 2, name: "Antes de empezar" }))
    .toBeInTheDocument();
});

test("renders a paragraph and a note as text", async () => {
  const screen = await renderBody(body);

  await expect.element(screen.getByText("Revisá el carrito.")).toBeInTheDocument();
  await expect.element(screen.getByText("No se cobra nada.")).toBeInTheDocument();
});

test("renders the steps as a numbered list in order", async () => {
  const screen = await renderBody(body);

  const items = screen.getByRole("listitem");
  await expect.element(items.nth(0)).toHaveTextContent("1Tocá Cancelar");
  await expect.element(items.nth(1)).toHaveTextContent("2Confirmá");
});

test("renders a link to another article the way the app asks for it", async () => {
  const screen = await renderBody(body);

  await expect
    .element(screen.getByRole("link", { name: "Ir a other-section" }))
    .toHaveAttribute("href", "#other-section");
});

test("renders the same text twice without losing either", async () => {
  const screen = await renderBody([
    { kind: "paragraph", text: "Repetido" },
    { kind: "paragraph", text: "Repetido" },
  ]);

  await expect.element(screen.getByText("Repetido").first()).toBeInTheDocument();
  expect(screen.getByText("Repetido").elements()).toHaveLength(2);
});

test("has no accessibility violations", async () => {
  const screen = await renderBody(body);

  await expectNoAccessibilityViolations(screen.container);
});

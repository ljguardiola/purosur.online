import type { Meta, StoryObj } from "@storybook/react-vite";
import type { HelpBlock } from "../../messages/help";
import { HelpArticleBody } from "./help-article-body";

type SampleArticleId = "cancel-sale";

const meta: Meta<typeof HelpArticleBody<SampleArticleId>> = {
  title: "Components/HelpArticleBody",
  component: HelpArticleBody,
  args: {
    renderArticleLink: (articleId) => (
      <button type="button" data-article={articleId}>
        Cancelar una venta
      </button>
    ),
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

function bodyOf(...blocks: HelpBlock<SampleArticleId>[]): readonly HelpBlock<SampleArticleId>[] {
  return blocks;
}

export const Heading: Story = {
  args: { body: bodyOf({ kind: "heading", text: "Si la venta ya tiene pagos" }) },
};

export const Paragraph: Story = {
  args: {
    body: bodyOf({
      kind: "paragraph",
      text: "Se vacía el carrito y no se cobra nada. La mercadería no sale del stock.",
    }),
  },
};

export const Steps: Story = {
  args: {
    body: bodyOf({
      kind: "steps",
      items: [
        "En Venta en curso, tocá Cancelar venta.",
        "Revisá las líneas y el total, y confirmá con Cancelar la venta.",
      ],
    }),
  },
};

export const Note: Story = {
  args: {
    body: bodyOf({
      kind: "note",
      text: "Escape cierra la lista sin borrar lo que escribiste.",
    }),
  },
};

export const ArticleLink: Story = {
  args: { body: bodyOf({ kind: "articleLink", article: "cancel-sale" }) },
};

export const AllBlocks: Story = {
  args: {
    body: bodyOf(
      { kind: "paragraph", text: "Con la caja abierta, el campo Producto queda listo." },
      {
        kind: "steps",
        items: ["Pasá el código por el lector.", "El producto se suma al carrito."],
      },
      { kind: "heading", text: "Si no aparece" },
      { kind: "note", text: "Buscalo por nombre." },
      { kind: "articleLink", article: "cancel-sale" },
    ),
  },
};

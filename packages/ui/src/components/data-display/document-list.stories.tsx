import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentList } from "./document-list";
import { Tag } from "./tag";

const meta: Meta<typeof DocumentList> = {
  title: "Components/DocumentList",
  component: DocumentList,
};

export default meta;

type Story = StoryObj<typeof DocumentList>;

export const Printing: Story = {
  args: {
    label: "Documentos",
    rows: [
      { title: "Factura C", detail: "Para el cliente", status: <Tag tone="info">Imprimiendo</Tag> },
    ],
  },
};

export const Printed: Story = {
  args: {
    label: "Documentos",
    rows: [
      { title: "Factura C", detail: "Para el cliente", status: <Tag tone="success">Impreso</Tag> },
    ],
  },
};

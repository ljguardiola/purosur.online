import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScanBarcode } from "lucide-react";
import { ElevatedNotice } from "./elevated-notice";

const meta: Meta<typeof ElevatedNotice> = {
  title: "Components/ElevatedNotice",
  component: ElevatedNotice,
  decorators: [
    (Story) => (
      <div className="w-160">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ElevatedNotice>;

export const Default: Story = {
  args: {
    notice: {
      icon: <ScanBarcode />,
      title: "No hay ningún producto con ese código",
      description: "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
    },
  },
};

export const Empty: Story = {
  args: { notice: undefined },
};

export const LongText: Story = {
  args: {
    notice: {
      icon: <ScanBarcode />,
      title:
        "No hay ningún producto con ese código de barras en el catálogo de esta sucursal ni en ninguna otra",
      description:
        "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice por alguien con el permiso de catálogo, y recién después se puede vender desde esta caja.",
    },
  },
};

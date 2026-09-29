import type { Meta, StoryObj } from "@storybook/react-vite";
import { Package, SearchX } from "lucide-react";
import { Button } from "../forms/button";
import { EmptyState } from "./empty-state";

const meta: Meta<typeof EmptyState> = {
  title: "Components/EmptyState",
  component: EmptyState,
};

export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Blank: Story = {
  args: {
    icon: <Package />,
    title: "Todavía no hay productos",
    description: "Los productos que cargues van a aparecer acá.",
    variant: "blank",
  },
};

export const Filtered: Story = {
  args: {
    icon: <SearchX />,
    title: "Sin resultados",
    description: "Probá con otro término de búsqueda.",
    variant: "filtered",
    actions: <Button variant="secondary">Limpiar filtros</Button>,
  },
};

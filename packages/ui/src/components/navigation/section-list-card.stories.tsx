import type { Meta, StoryObj } from "@storybook/react-vite";
import { Laptop, Printer, Unplug } from "lucide-react";
import { SectionListCard } from "./section-list-card";

const meta: Meta<typeof SectionListCard> = {
  title: "Components/SectionListCard",
  component: SectionListCard,
  decorators: [
    (Story) => (
      <div style={{ width: "848px", height: "688px" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: "Apartados",
    onSelect: () => {},
    legend: [
      { keyName: "ArrowUpDown", label: "Apartados" },
      { keyName: "ArrowLeftRight", label: "Lista" },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof SectionListCard>;

export const Connected: Story = {
  args: {
    selectedId: "register",
    items: [
      {
        id: "printer",
        icon: <Printer />,
        title: "Impresora",
        statuses: [{ tone: "success", text: "10.10.10.2:9100" }],
      },
      {
        id: "scale",
        icon: <Unplug />,
        title: "Balanza y lector",
        statuses: [
          { tone: "success", text: "Balanza conectada" },
          { tone: "success", text: "Lector conectado" },
        ],
      },
      {
        id: "register",
        icon: <Laptop />,
        title: "Esta caja",
        statuses: [
          { tone: "success", text: "Nube conectada" },
          { tone: "warning", text: "1 aviso" },
        ],
      },
    ],
  },
};

export const WithProblems: Story = {
  args: {
    selectedId: "register",
    items: [
      {
        id: "printer",
        icon: <Printer />,
        title: "Impresora",
        statuses: [{ tone: "success", text: "10.10.10.2:9100" }],
      },
      {
        id: "scale",
        icon: <Unplug />,
        title: "Balanza y lector",
        statuses: [
          { tone: "warning", text: "Balanza sin conectar" },
          { tone: "warning", text: "Lector sin conectar" },
        ],
      },
      {
        id: "register",
        icon: <Laptop />,
        title: "Esta caja",
        statuses: [
          { tone: "error", text: "Sin conexión con la nube" },
          { tone: "warning", text: "4 avisos" },
        ],
      },
    ],
  },
};

export const NeutralStatus: Story = {
  args: {
    selectedId: "printer",
    items: [
      {
        id: "printer",
        icon: <Printer />,
        title: "Impresora",
        statuses: [{ tone: "neutral", text: "Sin configurar" }],
      },
    ],
  },
};

export const WithoutLegend: Story = {
  args: {
    legend: undefined,
    selectedId: "printer",
    items: [
      {
        id: "printer",
        icon: <Printer />,
        title: "Impresora",
        statuses: [{ tone: "success", text: "10.10.10.2:9100" }],
      },
    ],
  },
};

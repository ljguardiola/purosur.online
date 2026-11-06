import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { Tab, Tabs } from "./tabs";

type TabEntry = { value: string; label: string; isDisabled?: boolean };

type TabsStoryArgs = {
  width: number;
  label: string;
  selectedTab: string;
  tabs: TabEntry[];
};

const peopleTabs: TabEntry[] = [
  { value: "users", label: "Usuarios" },
  { value: "roles", label: "Roles" },
  { value: "devices", label: "Dispositivos" },
];

function tab(canvasElement: HTMLElement, name: string): HTMLElement {
  return within(canvasElement).getByRole("tab", { name });
}

const meta: Meta<TabsStoryArgs> = {
  title: "Components/Tabs",
  args: { width: 640, label: "Secciones de Personas", selectedTab: "users", tabs: peopleTabs },
  decorators: [
    (Story, { args }) => (
      <div className="bg-surface-soft" style={{ width: `${args.width}px` }}>
        <Story />
      </div>
    ),
  ],
  render: ({ label, selectedTab, tabs }) => (
    <Tabs
      label={label}
      selectedTab={selectedTab}
      tabs={tabs.map((entry) => (
        <Tab
          key={entry.value}
          value={entry.value}
          label={entry.label}
          href={`#${entry.value}`}
          isDisabled={entry.isDisabled ?? false}
        />
      ))}
    >
      <p className="p-4 text-body text-text">
        {tabs.find((entry) => entry.value === selectedTab)?.label}
      </p>
    </Tabs>
  ),
};

export default meta;

type Story = StoryObj<TabsStoryArgs>;

export const SeveralTabs: Story = {};

export const SelectedTab: Story = {
  args: { selectedTab: "roles" },
};

export const DisabledTab: Story = {
  args: {
    tabs: [
      { value: "users", label: "Usuarios" },
      { value: "roles", label: "Roles", isDisabled: true },
      { value: "devices", label: "Dispositivos" },
    ],
  },
};

export const ManyTabsOnNarrowWidth: Story = {
  args: {
    width: 320,
    label: "Secciones de Ventas y caja",
    selectedTab: "closes",
    tabs: [
      { value: "registers", label: "Cajas" },
      { value: "closes", label: "Cierres de caja" },
      { value: "cash-movements", label: "Movimientos de efectivo" },
      { value: "returns", label: "Devoluciones" },
      { value: "refunds", label: "Reembolsos" },
      { value: "documents", label: "Comprobantes" },
    ],
  },
};

export const Hovered: Story = {
  play: playHoverSetsDataHovered((canvasElement) => tab(canvasElement, "Roles")),
};

export const FocusVisible: Story = {
  play: playTabReachesFocusVisible((canvasElement) => tab(canvasElement, "Usuarios")),
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, waitFor, within } from "storybook/test";
import { playTabMatchesCssFocusVisible } from "../../test-support/story-interactions";
import { Button } from "../forms/button";
import { Tab, Tabs } from "../navigation/tabs";
import { DetailPanel } from "./detail-panel";

const meta: Meta<typeof DetailPanel> = {
  title: "Components/DetailPanel",
  component: DetailPanel,
  args: { open: true, onClose: () => {} },
  decorators: [
    (Story) => (
      <div className="flex bg-surface-soft" style={{ height: "640px" }}>
        <ul className="flex flex-1 flex-col gap-2 p-8 text-body text-text">
          <li>Distribuidora Norte</li>
          <li>Almacén Sur</li>
          <li>Frigorífico del Valle</li>
        </ul>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DetailPanel>;

const supplierDetails = (
  <>
    <p className="text-caption font-bold uppercase text-text-eyebrow">Contacto</p>
    <p className="text-body text-text">Marina Quiroga · 011 5550-0142</p>
    <p className="text-caption font-bold uppercase text-text-eyebrow">Condición de pago</p>
    <p className="text-body text-text">Transferencia a 15 días</p>
  </>
);

const footerActions = (
  <>
    <Button variant="primary" fullWidth>
      Guardar cambios
    </Button>
    <Button variant="secondary" fullWidth>
      Desactivar proveedor
    </Button>
  </>
);

export const OpenWithoutFooter: Story = {
  args: { title: "Distribuidora Norte", children: supplierDetails },
};

export const OpenWithFooter: Story = {
  args: { title: "Distribuidora Norte", children: supplierDetails, footer: footerActions },
};

const deliveries = Array.from(
  { length: 20 },
  (_, index) => `Entrega ${index + 1} · ${String(index + 3).padStart(2, "0")}/09/2026`,
);

export const WithLongBody: Story = {
  args: {
    title: "Almacén Sur",
    children: (
      <>
        {supplierDetails}
        {deliveries.map((delivery) => (
          <p key={delivery} className="text-body text-text">
            {delivery}
          </p>
        ))}
      </>
    ),
    footer: footerActions,
  },
};

export const WithLongBodyFocused: Story = {
  ...WithLongBody,
  play: async (context) => {
    const panel = within(context.canvasElement);
    await waitFor(() => panel.getByRole("region", { name: "Almacén Sur" }));
    await userEvent.tab();
    await playTabMatchesCssFocusVisible(() => panel.getByRole("region", { name: "Almacén Sur" }))(
      context,
    );
  },
};

export const WithTabs: Story = {
  args: {
    title: "Frigorífico del Valle",
    children: (
      <Tabs
        label="Secciones del proveedor"
        selectedTab="data"
        tabs={[
          <Tab key="data" value="data" label="Datos" href="#data" />,
          <Tab key="orders" value="orders" label="Pedidos" href="#orders" />,
        ]}
      >
        {supplierDetails}
      </Tabs>
    ),
    footer: footerActions,
  },
};

export const Narrow: Story = {
  args: { title: "Distribuidora Norte", children: supplierDetails, footer: footerActions },
  decorators: [
    (Story) => (
      <div style={{ width: "700px" }}>
        <Story />
      </div>
    ),
  ],
};

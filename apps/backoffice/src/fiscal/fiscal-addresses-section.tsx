import { actionsColumn, dataColumn, Table, useTableModel } from "@purosur/ui";
import { Landmark, Pencil } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import type { FiscalAddress } from "./fiscal-addresses-api";

type FiscalAddressesSectionProps = {
  data: CloudData<FiscalAddress[]>;
  onEdit: (fiscalAddress: FiscalAddress) => void;
};

const NO_FISCAL_ADDRESSES: FiscalAddress[] = [];

export function FiscalAddressesSection({ data, onEdit }: FiscalAddressesSectionProps) {
  const columns = [
    dataColumn({
      id: "name",
      header: "Nombre",
      render: (item: FiscalAddress) => item.name,
    }),
    dataColumn({
      id: "streetAddress",
      header: "Dirección",
      render: (item: FiscalAddress) => item.streetAddress,
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: FiscalAddress) => ({
          icon: <Pencil />,
          "aria-label": `Editar el domicilio fiscal ${item.name}`,
          onPress: () => onEdit(item),
        }),
      ],
    }),
  ] as const;
  const table = useTableModel({
    items: data.status === "loaded" ? data.value : NO_FISCAL_ADDRESSES,
    id: (fiscalAddress) => fiscalAddress.id,
    columns,
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text-accent text-subheading">Domicilios fiscales</h2>
      <Table
        aria-label="Domicilios fiscales"
        table={table}
        {...cloudTableState(data, "los domicilios fiscales")}
        empty={{
          icon: <Landmark />,
          title: "Todavía no hay domicilios fiscales",
          description: "Creá el primero para elegirlo en cada caja.",
          variant: "blank",
        }}
      />
    </section>
  );
}

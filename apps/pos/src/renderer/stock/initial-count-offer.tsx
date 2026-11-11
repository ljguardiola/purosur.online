import type { ReadInitialCountOutcome } from "@purosur/contracts";
import { dataColumn, Table, TableCellText, useTableModel } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { useKeys } from "../platform/key-layer";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useInitialCountQuery } from "./stock-queries";

export type InitialCountOfferProps = {
  person: SignedInPerson;
  readInitialCount: () => Promise<ReadInitialCountOutcome>;
};

type StartingItem = { id: "initial-count"; title: string; description: string };

const INITIAL_COUNT: StartingItem = {
  id: "initial-count",
  title: "Inventario inicial",
  description: "Cargar el stock con el que arranca el local",
};

const STARTING_ITEMS = [INITIAL_COUNT];

const COLUMNS = [
  dataColumn({
    id: "item",
    header: "Para empezar",
    render: (item: StartingItem) => (
      <TableCellText icon={<Package />} description={item.description} strong>
        {item.title}
      </TableCellText>
    ),
  }),
] as const;

function Offer() {
  const navigate = useNavigate();
  const openInitialCount = () => void navigate({ to: "/initial-count" });
  useKeys([{ key: "N", run: openInitialCount, whileTyping: true }]);
  const table = useTableModel({ items: STARTING_ITEMS, id: (item) => item.id, columns: COLUMNS });
  return (
    <Table
      table={table}
      aria-label="Para empezar"
      fill
      legend={[{ keyName: "N", label: INITIAL_COUNT.title }]}
      rowState={() => "selected"}
      onRowPress={openInitialCount}
    />
  );
}

function OfferWhenOffered({ readInitialCount }: Pick<InitialCountOfferProps, "readInitialCount">) {
  const count = useInitialCountQuery(readInitialCount);
  return count.status === "loaded" && count.value.kind === "read" && count.value.offered ? (
    <Offer />
  ) : null;
}

export function InitialCountOffer({ person, readInitialCount }: InitialCountOfferProps) {
  return person.abilities.includes("record_initial_inventory") ? (
    <OfferWhenOffered readInitialCount={readInitialCount} />
  ) : null;
}

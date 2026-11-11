import type { ReadInitialCountOutcome } from "@purosur/contracts";
import { dataColumn, Table, useTableModel } from "@purosur/ui";
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

function StartingItemCell({ item }: { item: StartingItem }) {
  return (
    <span className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="flex size-control-sm shrink-0 items-center justify-center rounded-full bg-surface text-text"
      >
        <Package className="size-icon-md" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-subheading font-semibold text-text">{item.title}</span>
        <span className="truncate text-detail text-text-subtle">{item.description}</span>
      </span>
    </span>
  );
}

const STARTING_ITEMS = [INITIAL_COUNT];

const COLUMNS = [
  dataColumn({
    id: "item",
    header: "Para empezar",
    render: (item: StartingItem) => <StartingItemCell item={item} />,
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

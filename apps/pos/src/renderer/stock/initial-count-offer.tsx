import type { ReadInitialCountOutcome } from "@purosur/contracts";
import { Button, Card } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Package } from "lucide-react";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useInitialCountQuery } from "./stock-queries";

export type InitialCountOfferProps = {
  person: SignedInPerson;
  readInitialCount: () => Promise<ReadInitialCountOutcome>;
};

function Offer() {
  const navigate = useNavigate();
  return (
    <div className="max-w-110">
      <Card>
        <div className="flex flex-col gap-1">
          <p className="text-heading text-text">Inventario inicial</p>
          <p className="text-body text-text-subtle">Cargar el stock con el que arranca el local.</p>
        </div>
        <div className="self-start">
          <Button icon={<Package />} onPress={() => void navigate({ to: "/initial-count" })}>
            Cargar el inventario
          </Button>
        </div>
      </Card>
    </div>
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

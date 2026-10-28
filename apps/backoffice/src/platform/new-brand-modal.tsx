import { type BrandSummary, brandCreationBodySchema } from "@purosur/contracts";
import { Factory } from "lucide-react";
import { brandNameMessage } from "./brand-name";
import type { createBrand } from "./brands-api";
import { NameCreationModal, type NameCreationOutcome } from "./name-creation-modal";

export const BRAND_NAME_TAKEN = "Ya existe una marca con este nombre.";

const NEW_BRAND_TEXTS = {
  title: "Nueva marca",
  submitLabel: "Crear la marca",
  nameTaken: BRAND_NAME_TAKEN,
  failed: "No se guardó la marca",
};

type NewBrandModalProps = {
  open: boolean;
  context: string;
  createBrand: typeof createBrand;
  onCreated: (brand: BrandSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function NewBrandModal({ createBrand, ...props }: NewBrandModalProps) {
  async function create(name: string): Promise<NameCreationOutcome<BrandSummary>> {
    const outcome = await createBrand({ name });
    return outcome.kind === "ok" ? { kind: "ok", created: outcome.brand } : outcome;
  }

  return (
    <NameCreationModal
      {...props}
      icon={<Factory />}
      texts={NEW_BRAND_TEXTS}
      schema={brandCreationBodySchema}
      nameMessage={brandNameMessage}
      create={create}
    />
  );
}

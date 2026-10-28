import { type TagSummary, tagCreationBodySchema } from "@purosur/contracts";
import { Sparkles } from "lucide-react";
import { NameCreationModal, type NameCreationOutcome } from "./name-creation-modal";
import { TAG_NAME_TAKEN, tagNameMessage } from "./tag-form";
import type { createTag } from "./tags-api";

export type NewTagModalServices = {
  createTag: typeof createTag;
};

const NEW_TAG_TEXTS = {
  title: "Nuevo distintivo",
  submitLabel: "Crear el distintivo",
  nameTaken: TAG_NAME_TAKEN,
  failed: "No se guardó el distintivo",
};

type NewTagModalProps = {
  open: boolean;
  context: string;
  services: NewTagModalServices;
  onCreated: (tag: TagSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function NewTagModal({ services, ...props }: NewTagModalProps) {
  async function create(name: string): Promise<NameCreationOutcome<TagSummary>> {
    const outcome = await services.createTag({ name });
    return outcome.kind === "ok" ? { kind: "ok", created: outcome.tag } : outcome;
  }

  return (
    <NameCreationModal
      {...props}
      icon={<Sparkles />}
      texts={NEW_TAG_TEXTS}
      schema={tagCreationBodySchema}
      nameMessage={tagNameMessage}
      create={create}
    />
  );
}

import type { TagSummary } from "@purosur/contracts";
import { ChipListField, type Option, plural, sortedItems, textOrder } from "@purosur/ui";
import { useState } from "react";
import { useFieldContext } from "../platform/cloud-form-context";
import { fieldErrorMessage } from "../platform/cloud-form-fields";
import { useMarkCatalogStale, useRefreshCatalog } from "./catalog-queries";

const INACTIVE_TAG_STATUS = "Inactivo";

const tagNameOrder = textOrder((tag: TagSummary) => tag.name);

const namesList = new Intl.ListFormat("es-AR", { type: "conjunction" });

export function tagOptions(tags: TagSummary[]): Option<string>[] {
  return sortedItems(tags, { order: tagNameOrder, direction: "ascending" }).map((tag) =>
    tag.active
      ? { value: tag.id, label: tag.name }
      : { value: tag.id, label: tag.name, status: INACTIVE_TAG_STATUS },
  );
}

export function tagFieldHelp(
  tags: TagSummary[],
  tagIds: string[],
): { description: string } | Record<string, never> {
  const names = tagIds.flatMap((id) => {
    const tag = tags.find((candidate) => candidate.id === id);
    return tag && !tag.active ? [`"${tag.name}"`] : [];
  });
  if (names.length === 0) {
    return {};
  }
  const list = namesList.format(names);
  return {
    description: plural(names.length, {
      one: `${list} está dado de baja. No se ofrece para productos nuevos.`,
      other: `${list} están dados de baja. No se ofrecen para productos nuevos.`,
    }),
  };
}

export function withCreatedTags(tags: TagSummary[], created: TagSummary[]): TagSummary[] {
  const missing = created.filter((tag) => !tags.some((known) => known.id === tag.id));
  return missing.length === 0 ? tags : [...tags, ...missing];
}

type StackedTagCreation = {
  open: boolean;
  created: TagSummary[];
  start: () => void;
  reset: () => void;
  close: () => void;
  select: (tag: TagSummary) => void;
  finish: () => void;
};

// The tag modal opens over the product form, which stays mounted with everything typed in it.
// Reading the catalog again while that form is open could fail and close it, so the tags it
// creates are kept here and the catalog is only read again once the form closes.
export function useStackedTagCreation(chooseTag: (tagId: string) => void): StackedTagCreation {
  const markCatalogStale = useMarkCatalogStale();
  const refreshCatalog = useRefreshCatalog();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<TagSummary[]>([]);
  return {
    open,
    created,
    start: () => setOpen(true),
    reset: () => {
      setOpen(false);
      setCreated([]);
    },
    close: () => setOpen(false),
    select: (tag) => {
      setCreated((previous) => [...previous, tag]);
      chooseTag(tag.id);
      setOpen(false);
      void markCatalogStale();
    },
    finish: () => {
      if (created.length > 0) {
        void refreshCatalog();
      }
    },
  };
}

export function TagsField({
  tags,
  onCreateTag,
  disabled,
}: {
  tags: TagSummary[];
  onCreateTag: () => void;
  disabled: boolean;
}) {
  const field = useFieldContext<string[]>();
  return (
    <ChipListField
      label="Distintivos"
      options={tagOptions(tags)}
      value={field.state.value}
      onChange={field.handleChange}
      addLabel="Agregar distintivo"
      create={{ label: "Crear distintivo…", onAction: onCreateTag }}
      disabled={disabled}
      errorMessage={fieldErrorMessage(field.state.meta.errors)}
      {...tagFieldHelp(tags, field.state.value)}
    />
  );
}

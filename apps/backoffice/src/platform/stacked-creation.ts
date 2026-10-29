import { useState } from "react";

export type CatalogRefresh = {
  markStale: () => Promise<void>;
  refresh: () => Promise<void>;
};

export type StackedCreation<Created> = {
  open: boolean;
  initialName: string;
  created: Created | null;
  start: (typedName: string) => void;
  reset: () => void;
  close: () => void;
  select: (created: Created) => void;
  finish: () => void;
};

// The creation modal opens over a host form, which stays mounted with everything typed in it.
// Reading the data again while that form is open could fail and close it, so the record it
// creates is kept here and the data is only read again once the form closes.
export function useStackedCreation<Created>(
  choose: (created: Created) => void,
  catalog: CatalogRefresh,
): StackedCreation<Created> {
  const [open, setOpen] = useState(false);
  const [initialName, setInitialName] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  return {
    open,
    initialName,
    created,
    start: (typedName) => {
      setInitialName(typedName);
      setOpen(true);
    },
    reset: () => {
      setOpen(false);
      setInitialName("");
      setCreated(null);
    },
    close: () => setOpen(false),
    select: (record) => {
      setCreated(record);
      choose(record);
      setOpen(false);
      void catalog.markStale();
    },
    finish: () => {
      if (created) {
        void catalog.refresh();
      }
    },
  };
}

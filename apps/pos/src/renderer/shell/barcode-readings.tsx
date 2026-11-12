import { FloatingNotification } from "@purosur/ui";
import { ScanBarcode } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

type Taker = (code: string) => void;

type Registered = { taker: Taker; whileDialogOpen: boolean };

interface Takers {
  register(registered: Registered): () => void;
  last(): Taker | undefined;
  lastWhileDialogOpen(): Taker | undefined;
  refuse(): () => void;
  refused(): boolean;
}

function createTakers(): Takers {
  let registered: Registered[] = [];
  const refusals = new Set<object>();
  return {
    register(entry) {
      registered.push(entry);
      return () => {
        registered = registered.filter((other) => other !== entry);
      };
    },
    last: () => registered.at(-1)?.taker,
    lastWhileDialogOpen: () => registered.filter((entry) => entry.whileDialogOpen).at(-1)?.taker,
    refuse() {
      const refusal = {};
      refusals.add(refusal);
      return () => {
        refusals.delete(refusal);
      };
    },
    refused: () => refusals.size > 0,
  };
}

function aWindowIsOpen() {
  return document.querySelector('[role="dialog"]') !== null;
}

const BarcodeReadingsContext = createContext<Pick<Takers, "register" | "refuse">>({
  register: () => () => {},
  refuse: () => () => {},
});

export function BarcodeReadings({
  onBarcodeRead,
  children,
}: {
  onBarcodeRead: (listener: (code: string) => void) => () => void;
  children: ReactNode;
}) {
  const [takers] = useState(createTakers);
  const [untaken, setUntaken] = useState<number>();

  useEffect(
    () =>
      onBarcodeRead((code) => {
        const taker = aWindowIsOpen() ? takers.lastWhileDialogOpen() : takers.last();
        if (taker === undefined || takers.refused()) {
          setUntaken((count) => (count ?? 0) + 1);
        } else {
          taker(code);
        }
      }),
    [onBarcodeRead, takers],
  );

  return (
    <BarcodeReadingsContext value={takers}>
      {children}
      {untaken === undefined ? null : (
        <FloatingNotification
          key={untaken}
          tone="warning"
          icon={<ScanBarcode />}
          title="No se agregó el producto escaneado"
          description="Escaneá de nuevo en una venta que se pueda cambiar, sin ventanas abiertas."
          onDismiss={() => setUntaken(undefined)}
        />
      )}
    </BarcodeReadingsContext>
  );
}

export function useBarcodeReadings(
  take: ((code: string) => void) | undefined,
  { whileDialogOpen = false }: { whileDialogOpen?: boolean } = {},
) {
  const { register } = useContext(BarcodeReadingsContext);
  const latest = useRef(take);
  const taking = take !== undefined;

  useEffect(() => {
    latest.current = take;
  });

  useEffect(
    () =>
      taking
        ? register({
            taker: (code) => {
              latest.current?.(code);
            },
            whileDialogOpen,
          })
        : undefined,
    [taking, whileDialogOpen, register],
  );
}

export function useRefuseBarcodeReadings(refusing: boolean) {
  const { refuse } = useContext(BarcodeReadingsContext);
  useEffect(() => (refusing ? refuse() : undefined), [refusing, refuse]);
}

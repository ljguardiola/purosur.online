import { FloatingNotification } from "@purosur/ui";
import { ScanBarcode } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

type Taker = (code: string) => void;

interface Takers {
  register(taker: Taker): () => void;
  last(): Taker | undefined;
}

function createTakers(): Takers {
  let registered: Taker[] = [];
  return {
    register(taker) {
      registered.push(taker);
      return () => {
        registered = registered.filter((other) => other !== taker);
      };
    },
    last: () => registered.at(-1),
  };
}

const BarcodeReadingsContext = createContext<Takers["register"]>(() => () => {});

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
        const taker = takers.last();
        if (taker === undefined) {
          setUntaken((count) => (count ?? 0) + 1);
        } else {
          taker(code);
        }
      }),
    [onBarcodeRead, takers],
  );

  return (
    <BarcodeReadingsContext value={takers.register}>
      {children}
      {untaken === undefined ? null : (
        <FloatingNotification
          key={untaken}
          tone="warning"
          icon={<ScanBarcode />}
          title="No se agregó el producto escaneado"
          description="Escaneá el código de nuevo cuando estés en la venta, sin ventanas abiertas."
          onDismiss={() => setUntaken(undefined)}
        />
      )}
    </BarcodeReadingsContext>
  );
}

export function useBarcodeReadings(take: ((code: string) => void) | undefined) {
  const register = useContext(BarcodeReadingsContext);
  const latest = useRef(take);
  const taking = take !== undefined;

  useEffect(() => {
    latest.current = take;
  });

  useEffect(
    () =>
      taking
        ? register((code) => {
            latest.current?.(code);
          })
        : undefined,
    [taking, register],
  );
}

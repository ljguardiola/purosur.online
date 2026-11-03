import { useEffect, useRef, useState } from "react";

const PAUSE_BETWEEN_ANSWERS_MS = 250;

export type StableReading = { weightThousandths: number };

type DefaultReading = StableReading & { amount: number };

export type ScaleWeighing<Reading extends StableReading = DefaultReading> =
  | { kind: "weighing" }
  | { kind: "zero_weight" }
  | { kind: "scale_unavailable" }
  | { kind: "stable"; reading: Reading }
  | { kind: "taken"; reading: Reading }
  | { kind: "closed" };

export type ScaleWeighingPhase<Reading extends StableReading = DefaultReading> =
  | { kind: "weighing"; last: Reading | undefined }
  | { kind: "stable"; reading: Reading }
  | { kind: "typing" }
  | { kind: "scale_unavailable" }
  | { kind: "taken"; reading: Reading };

export function useScaleWeighing<Reading extends StableReading = DefaultReading>(
  weigh: (take: boolean) => Promise<ScaleWeighing<Reading>>,
) {
  const [phase, setPhase] = useState<ScaleWeighingPhase<Reading>>({
    kind: "weighing",
    last: undefined,
  });
  const [confirming, setConfirming] = useState(false);
  const [zeroRefused, setZeroRefused] = useState(false);
  const latestWeigh = useRef(weigh);
  const typing = useRef(false);
  const taken = useRef(false);
  const confirmed = useRef(false);
  const asking = useRef(false);
  const inFlight = useRef<Promise<unknown>>(Promise.resolve());
  const askNow = useRef<() => void>(() => {});

  useEffect(() => {
    latestWeigh.current = weigh;
  });

  useEffect(() => {
    let leaving = false;
    let pause: ReturnType<typeof setTimeout> | undefined;

    function askAfterPause() {
      pause = setTimeout(ask, PAUSE_BETWEEN_ANSWERS_MS);
    }

    function ask() {
      if (leaving || typing.current || taken.current || asking.current) {
        return;
      }
      asking.current = true;
      inFlight.current = latestWeigh.current(confirmed.current).then((answer) => {
        asking.current = false;
        switch (answer.kind) {
          case "taken":
            taken.current = true;
            confirmed.current = false;
            setConfirming(false);
            setPhase(answer);
            break;
          case "scale_unavailable":
            typing.current = true;
            setConfirming(false);
            setPhase((current) =>
              current.kind === "weighing" || current.kind === "stable" ? answer : current,
            );
            break;
          case "zero_weight":
            confirmed.current = false;
            setConfirming(false);
            setZeroRefused(true);
            askAfterPause();
            break;
          case "stable":
            if (answer.reading.weightThousandths > 0) {
              setZeroRefused(false);
            }
            setPhase((current) =>
              current.kind === "weighing" || current.kind === "stable" ? answer : current,
            );
            askAfterPause();
            break;
          case "weighing":
            setPhase((current) =>
              current.kind === "stable" ? { kind: "weighing", last: current.reading } : current,
            );
            askAfterPause();
            break;
          case "closed":
            break;
        }
      });
    }

    askNow.current = () => {
      clearTimeout(pause);
      ask();
    };
    ask();
    return () => {
      leaving = true;
      clearTimeout(pause);
    };
  }, []);

  function confirm() {
    if (typing.current || taken.current || confirmed.current) {
      return;
    }
    confirmed.current = true;
    setConfirming(true);
    setZeroRefused(false);
    askNow.current();
  }

  function typeInstead() {
    typing.current = true;
    confirmed.current = false;
    setConfirming(false);
    setPhase((current) =>
      current.kind === "weighing" || current.kind === "stable" ? { kind: "typing" } : current,
    );
  }

  async function ifNotTaken<Result>(
    work: () => Promise<Result>,
  ): Promise<Result | "taken_by_the_scale"> {
    await inFlight.current;
    return taken.current ? "taken_by_the_scale" : work();
  }

  return { phase, confirming, zeroRefused, confirm, typeInstead, ifNotTaken };
}

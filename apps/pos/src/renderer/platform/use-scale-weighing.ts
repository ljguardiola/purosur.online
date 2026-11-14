import { useEffect, useRef, useState } from "react";

export const PAUSE_BETWEEN_ANSWERS_MS = 0;

export type WeightReading = { weightThousandths: number };

type DefaultReading = WeightReading & { amount: number };

export type ScaleWeighing<Reading extends WeightReading = DefaultReading> =
  | { kind: "weighing" }
  | { kind: "unsteady_out_of_range" }
  | { kind: "zero_weight" }
  | { kind: "scale_unavailable" }
  | { kind: "unsteady"; reading: Reading }
  | { kind: "stable"; reading: Reading }
  | { kind: "taken"; reading: Reading }
  | { kind: "closed" };

export type ScaleWeighingPhase<Reading extends WeightReading = DefaultReading> =
  | { kind: "weighing"; last: Reading | undefined }
  | { kind: "unsteady"; reading: Reading }
  | { kind: "stable"; reading: Reading }
  | { kind: "typing" }
  | { kind: "scale_unavailable" }
  | { kind: "taken"; reading: Reading };

function followsTheScale<Reading extends WeightReading>(phase: ScaleWeighingPhase<Reading>) {
  return phase.kind === "weighing" || phase.kind === "unsteady" || phase.kind === "stable";
}

export function useScaleWeighing<Reading extends WeightReading = DefaultReading>(
  weigh: (confirmedWeightThousandths: number | null) => Promise<ScaleWeighing<Reading>>,
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
  const shown = useRef<number | null>(null);
  const inFlight = useRef<Promise<unknown>>(Promise.resolve());
  const askNow = useRef<() => void>(() => {});

  useEffect(() => {
    latestWeigh.current = weigh;
  });

  useEffect(() => {
    let leaving = false;
    let asking = false;
    let pause: ReturnType<typeof setTimeout> | undefined;

    function askAfterPause() {
      pause = setTimeout(ask, PAUSE_BETWEEN_ANSWERS_MS);
    }

    function ask() {
      if (leaving || typing.current || taken.current || asking) {
        return;
      }
      asking = true;
      inFlight.current = latestWeigh
        .current(confirmed.current ? shown.current : null)
        .then((answer) => {
          asking = false;
          if (leaving) {
            return;
          }
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
              setPhase((current) => (followsTheScale(current) ? answer : current));
              break;
            case "zero_weight":
              confirmed.current = false;
              setConfirming(false);
              setZeroRefused(true);
              askAfterPause();
              break;
            case "stable":
            case "unsteady":
              shown.current = answer.kind === "stable" ? answer.reading.weightThousandths : null;
              if (answer.reading.weightThousandths > 0) {
                setZeroRefused(false);
              }
              setPhase((current) => (followsTheScale(current) ? answer : current));
              askAfterPause();
              break;
            case "unsteady_out_of_range":
              shown.current = null;
              setPhase((current) =>
                followsTheScale(current) ? { kind: "weighing", last: undefined } : current,
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
    setPhase((current) => (followsTheScale(current) ? { kind: "typing" } : current));
  }

  async function ifNotTaken<Result>(
    work: () => Promise<Result>,
  ): Promise<Result | "taken_by_the_scale"> {
    await inFlight.current;
    return taken.current ? "taken_by_the_scale" : work();
  }

  return { phase, confirming, zeroRefused, confirm, typeInstead, ifNotTaken };
}

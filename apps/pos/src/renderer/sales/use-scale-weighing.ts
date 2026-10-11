import { useEffect, useRef, useState } from "react";

const PAUSE_BETWEEN_ANSWERS_MS = 250;

export type ScaleWeighing =
  | { kind: "weighing" }
  | { kind: "scale_unavailable" }
  | { kind: "taken"; weightThousandths: number; amount: number }
  | { kind: "closed" };

export type ScaleWeighingPhase =
  | { kind: "weighing" }
  | { kind: "typing" }
  | { kind: "scale_unavailable" }
  | { kind: "taken"; weightThousandths: number; amount: number };

export function useScaleWeighing(weigh: () => Promise<ScaleWeighing>) {
  const [phase, setPhase] = useState<ScaleWeighingPhase>({ kind: "weighing" });
  const latestWeigh = useRef(weigh);
  const typing = useRef(false);
  const taken = useRef(false);
  const inFlight = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    latestWeigh.current = weigh;
  });

  useEffect(() => {
    let leaving = false;
    let pause: ReturnType<typeof setTimeout> | undefined;

    function ask() {
      if (leaving || typing.current || taken.current) {
        return;
      }
      inFlight.current = latestWeigh.current().then((answer) => {
        if (answer.kind === "taken") {
          taken.current = true;
          setPhase(answer);
        } else if (answer.kind === "scale_unavailable") {
          setPhase((current) => (current.kind === "weighing" ? answer : current));
          typing.current = true;
        } else if (answer.kind === "weighing") {
          pause = setTimeout(ask, PAUSE_BETWEEN_ANSWERS_MS);
        }
      });
    }

    ask();
    return () => {
      leaving = true;
      clearTimeout(pause);
    };
  }, []);

  function typeInstead() {
    typing.current = true;
    setPhase((current) => (current.kind === "weighing" ? { kind: "typing" } : current));
  }

  async function ifNotTaken<Result>(
    work: () => Promise<Result>,
  ): Promise<Result | "taken_by_the_scale"> {
    await inFlight.current;
    return taken.current ? "taken_by_the_scale" : work();
  }

  return { phase, typeInstead, ifNotTaken };
}

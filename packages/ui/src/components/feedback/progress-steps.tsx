import { Check, Loader } from "lucide-react";

export type ProgressStepState = "done" | "current" | "upcoming";

export type ProgressStep = {
  id: string;
  label: string;
  detail?: string;
  state: ProgressStepState;
};

export type ProgressStepsProps = {
  steps: readonly ProgressStep[];
};

const stateText: Record<ProgressStepState, string> = {
  done: "Completado",
  current: "En curso",
  upcoming: "Pendiente",
};

const markerClassName = "flex size-6 shrink-0 items-center justify-center rounded-full";

const labelClassName: Record<ProgressStepState, string> = {
  done: "text-body text-text",
  current: "text-body font-bold text-text",
  upcoming: "text-body text-text-subtle",
};

function Marker({ state }: { state: ProgressStepState }) {
  if (state === "done") {
    return (
      <span data-marker className={`${markerClassName} bg-success text-text-inverse`}>
        <Check aria-hidden="true" className="size-icon-sm" />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span data-marker className={`${markerClassName} bg-info text-text-inverse`}>
        <Loader
          aria-hidden="true"
          className="size-icon-sm animate-spin motion-reduce:animate-none"
        />
      </span>
    );
  }
  return <span data-marker className={`${markerClassName} border-2 border-border bg-surface`} />;
}

export function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <ol className="flex flex-col font-sans">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li
            key={step.id}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <Marker state={step.state} />
              {isLast ? null : <span data-connector className="w-0.5 flex-1 bg-border" />}
            </div>
            <div className={isLast ? "" : "pb-4"}>
              <p className={labelClassName[step.state]}>
                <span>{step.label}</span> <span className="sr-only">{stateText[step.state]}</span>
              </p>
              {step.detail === undefined ? null : (
                <p className="text-detail text-text-subtle">{step.detail}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

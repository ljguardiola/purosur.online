import { Check, X } from "lucide-react";

export type ProgressStepState = "done" | "current" | "error" | "upcoming";

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
  error: "Con error",
  upcoming: "Pendiente",
};

const markerClassName = "flex size-6 shrink-0 items-center justify-center rounded-full";

const labelClassName: Record<ProgressStepState, string> = {
  done: "text-body text-text",
  current: "text-body text-text",
  error: "text-body text-error-strong",
  upcoming: "text-body text-text",
};

function Marker({ state }: { state: ProgressStepState }) {
  if (state === "done") {
    return (
      <span data-marker className={`${markerClassName} bg-success-strong text-text-inverse`}>
        <Check aria-hidden="true" className="size-icon-sm" />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span data-marker className={`${markerClassName} border-2 border-info-strong bg-surface`}>
        <span data-dot className="size-2.5 rounded-full bg-info-strong" />
      </span>
    );
  }
  if (state === "error") {
    return (
      <span data-marker className={`${markerClassName} bg-error text-text-inverse`}>
        <X aria-hidden="true" className="size-icon-sm" />
      </span>
    );
  }
  return <span data-marker className={`${markerClassName} border-2 border-border bg-surface`} />;
}

export function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <ol className="flex flex-col font-sans">
      {steps.map((step) => (
        <li
          key={step.id}
          aria-current={step.state === "current" ? "step" : undefined}
          className="flex min-h-8.5 items-center gap-3"
        >
          <Marker state={step.state} />
          <div>
            <p className={labelClassName[step.state]}>
              <span>{step.label}</span> <span className="sr-only">{stateText[step.state]}</span>
            </p>
            {step.detail === undefined ? null : (
              <p className="text-detail text-text-subtle">{step.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

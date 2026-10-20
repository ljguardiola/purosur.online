import { Card, Eyebrow, formatDayAndTime, Tag } from "@purosur/ui";
import type { ReactNode } from "react";

type StepState = { done: boolean; doneAt: string | null; available: boolean };

type CompromiseResponseStepCardProps = {
  number: number;
  title: string;
  description: string;
  state: StepState;
  children?: ReactNode;
};

function StateTag({ state }: { state: StepState }) {
  if (state.done && state.doneAt !== null) {
    return (
      <Tag tone="success" variant="status">
        {`Hecho el ${formatDayAndTime(state.doneAt)}`}
      </Tag>
    );
  }
  return state.available ? (
    <Tag tone="info" variant="status">
      Disponible
    </Tag>
  ) : (
    <Tag tone="neutral" variant="status">
      Bloqueado hasta completar el anterior
    </Tag>
  );
}

export function CompromiseResponseStepCard({
  number,
  title,
  description,
  state,
  children,
}: CompromiseResponseStepCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Eyebrow text={`Paso ${number}`} />
          <h2 className="text-text-accent text-subheading">{title}</h2>
        </div>
        <StateTag state={state} />
      </div>
      <p className="text-body text-text">{description}</p>
      {children}
    </Card>
  );
}

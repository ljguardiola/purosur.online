import { Button } from "@purosur/ui";
import type { ReactNode } from "react";
import { Component, Fragment } from "react";
import { BrandPanelScreen } from "./brand-panel-screen";

const AUTOMATIC_RESTART_BUDGET = 2;

interface RenderFailureRecoveryProps {
  children: ReactNode;
  reportFailure: (error: unknown) => void;
}

interface RenderFailureRecoveryState {
  phase: "showing" | "failed" | "exhausted";
  automaticRestartsLeft: number;
  attempt: number;
}

export class RenderFailureRecovery extends Component<
  RenderFailureRecoveryProps,
  RenderFailureRecoveryState
> {
  override state: RenderFailureRecoveryState = {
    phase: "showing",
    automaticRestartsLeft: AUTOMATIC_RESTART_BUDGET,
    attempt: 0,
  };

  static getDerivedStateFromError(): Partial<RenderFailureRecoveryState> {
    return { phase: "failed" };
  }

  override componentDidCatch(error: unknown): void {
    this.props.reportFailure(error);
    this.setState((previous) =>
      previous.automaticRestartsLeft > 0
        ? {
            phase: "showing",
            automaticRestartsLeft: previous.automaticRestartsLeft - 1,
            attempt: previous.attempt + 1,
          }
        : { ...previous, phase: "exhausted" },
    );
  }

  private readonly retry = (): void => {
    this.setState((previous) => ({
      phase: "showing",
      automaticRestartsLeft: AUTOMATIC_RESTART_BUDGET,
      attempt: previous.attempt + 1,
    }));
  };

  override render(): ReactNode {
    if (this.state.phase === "exhausted") {
      return (
        <BrandPanelScreen>
          <div role="alert" className="flex w-full max-w-md flex-col gap-4">
            <p className="text-3xl font-bold text-text-accent">No se pudo mostrar la pantalla</p>
            <Button size="large" onPress={this.retry}>
              Reintentar
            </Button>
          </div>
        </BrandPanelScreen>
      );
    }

    if (this.state.phase === "failed") {
      return null;
    }

    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

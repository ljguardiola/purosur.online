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
  automaticRestartsLeft: number;
  exhausted: boolean;
  attempt: number;
}

export class RenderFailureRecovery extends Component<
  RenderFailureRecoveryProps,
  RenderFailureRecoveryState
> {
  override state: RenderFailureRecoveryState = {
    automaticRestartsLeft: AUTOMATIC_RESTART_BUDGET,
    exhausted: false,
    attempt: 0,
  };

  override componentDidCatch(error: unknown): void {
    this.props.reportFailure(error);
    this.setState((previous) =>
      previous.automaticRestartsLeft > 0
        ? {
            automaticRestartsLeft: previous.automaticRestartsLeft - 1,
            exhausted: false,
            attempt: previous.attempt + 1,
          }
        : { ...previous, exhausted: true },
    );
  }

  private readonly retry = (): void => {
    this.setState((previous) => ({
      automaticRestartsLeft: AUTOMATIC_RESTART_BUDGET,
      exhausted: false,
      attempt: previous.attempt + 1,
    }));
  };

  override render(): ReactNode {
    if (this.state.exhausted) {
      return (
        <BrandPanelScreen>
          <div role="alert" className="flex w-full max-w-md flex-col gap-4">
            <p className="text-3xl font-bold text-brand-blue-strong">
              No se pudo mostrar la pantalla
            </p>
            <Button size="large" onPress={this.retry}>
              Reintentar
            </Button>
          </div>
        </BrandPanelScreen>
      );
    }

    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

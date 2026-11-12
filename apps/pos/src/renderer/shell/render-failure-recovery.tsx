import { LoadFailure } from "@purosur/ui";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Component, Fragment } from "react";
import { KeyLayerProvider, useKeys } from "../platform/key-layer";
import { BrandPanelScreen } from "./brand-panel-screen";

const AUTOMATIC_RESTART_BUDGET = 2;

function RenderFailureNotice({ onRetry }: { onRetry: () => void }) {
  useKeys([{ key: "R", run: onRetry }]);

  return (
    <div className="h-screen w-full">
      <BrandPanelScreen>
        <main className="w-full max-w-110">
          <LoadFailure
            variant="screen"
            icon={<TriangleAlert />}
            title="No se pudo mostrar la pantalla"
            keycap="R"
            onRetry={onRetry}
          />
        </main>
      </BrandPanelScreen>
    </div>
  );
}

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
        <KeyLayerProvider>
          <RenderFailureNotice onRetry={this.retry} />
        </KeyLayerProvider>
      );
    }

    if (this.state.phase === "failed") {
      return null;
    }

    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

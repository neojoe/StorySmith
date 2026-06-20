import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Catches render errors in the subtree and shows a fallback UI.
 * Must be a class component — React error boundaries can only be classes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => this.setState({ hasError: false, error: undefined });

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
              Something went wrong
            </p>
            <p className="text-sm text-neutral-500">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <Button variant="secondary" onClick={this.handleReset}>
              Try again
            </Button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

import { Component, type ReactNode } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';

type ErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
  description?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary] caught error', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Card className="p-6">
            <div className="space-y-2">
              <div className="text-base font-semibold">{this.props.title ?? 'Something went wrong'}</div>
              <div className="text-sm text-muted-foreground">
                {this.props.description ?? 'The page crashed, but the app is still running.'}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button type="button" variant="outline" onClick={() => this.setState({ hasError: false })}>
                Try again
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }
}

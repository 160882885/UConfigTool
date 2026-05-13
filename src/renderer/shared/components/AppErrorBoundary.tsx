import React, { type ErrorInfo, type ReactNode } from 'react';

import { createLogger } from '../logging/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

const logger = createLogger('renderer:AppErrorBoundary');

class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('Renderer crashed', {
      errorMessage: error.message,
      stack: error.stack,
      componentStack: info.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#d4d4d4', background: '#1e1e1e', height: '100%' }}>
          <h1>Something went wrong</h1>
          <p>Please reload the app window.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;

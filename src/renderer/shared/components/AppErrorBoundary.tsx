import React, { type ErrorInfo, type ReactNode } from 'react';

import { createLogger } from '../logging/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  stack: string;
}

const logger = createLogger('renderer:AppErrorBoundary');

class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', stack: '' };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true, errorMessage: '', stack: '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({
      errorMessage: error.message || 'Unknown renderer error',
      stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`.trim()
    });
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
          {this.state.errorMessage ? <p style={{ color: '#f9c74f', whiteSpace: 'pre-wrap' }}>{this.state.errorMessage}</p> : null}
          {this.state.stack ? (
            <pre style={{ marginTop: 12, maxHeight: '50vh', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.stack}</pre>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;

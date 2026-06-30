import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}>⚠️</p>
          <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#E8EAF0' }}>Something went wrong</p>
          <p style={{ fontSize: 13, color: '#8B8FA4', margin: '0 0 20px', maxWidth: 280 }}>{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '10px 24px', borderRadius: 12, background: '#2DD4BF', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

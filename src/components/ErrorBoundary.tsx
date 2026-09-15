import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Terminal, ShieldCheck } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // @ts-expect-error - Ensure compatibility across React 18 & 19 type definitions
  public override props: ErrorBoundaryProps;
  // @ts-expect-error - Ensure state typing compatibility
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[DevSecOps ErrorBoundary] Caught error:', error, errorInfo);
  }

  private handleReset = () => {
    // @ts-expect-error - Method invocation compatibility
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          id="hts-devsecops-error-boundary"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            maxWidth: '420px',
            backgroundColor: '#0D253F',
            color: '#F8FAFC',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid rgba(254, 202, 202, 0.3)',
            boxShadow: '0 12px 32px rgba(13, 37, 63, 0.35)',
            zIndex: 99999,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '0.85rem',
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <AlertTriangle color="#F87171" size={20} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#FFFFFF' }}>
              {this.props.fallbackTitle || 'Asisten AI Mengalami Kendala Tampilan'}
            </h3>
          </div>
          
          <p style={{ margin: '0 0 0.75rem 0', color: '#CBD5E1', fontSize: '0.8rem' }}>
            Sistem pengaman antarmuka (DevSecOps Error Boundary) berhasil mengisolasi kendala runtime tanpa merusak halaman utama.
          </p>

          {this.state.error && (
            <div
              style={{
                backgroundColor: '#071727',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                marginBottom: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                color: '#FCA5A5',
                maxHeight: '80px',
                overflowY: 'auto',
                wordBreak: 'break-all',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px', color: '#94A3B8' }}>
                <Terminal size={11} />
                <span>Diagnostic Info:</span>
              </div>
              {this.state.error.toString()}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10B981', fontSize: '0.72rem', fontWeight: 500 }}>
              <ShieldCheck size={14} />
              <span>Proteksi Aman Aktif</span>
            </div>
            
            <button
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: '#C5A880',
                color: '#0D253F',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} />
              <span>Muat Ulang Widget</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

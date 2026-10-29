import { Component, useState, type JSX, type ReactNode } from 'react';
import { diagnosticReport, onFatal } from './diagnostics';

/** Catches render errors, plus anything diagnostics.ts reports from outside React, and shows a way out. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: { value: unknown } | null }> {
  state: { error: { value: unknown } | null } = { error: null };
  private unsubscribe: (() => void) | null = null;

  static getDerivedStateFromError(error: unknown): { error: { value: unknown } } {
    return { error: { value: error } };
  }

  private readonly showFatal = (value: unknown): void => this.setState((s) => (s.error ? s : { error: { value } }));

  componentDidMount(): void {
    this.unsubscribe = onFatal(this.showFatal);
  }

  componentWillUnmount(): void {
    this.unsubscribe?.();
  }

  render(): ReactNode {
    return this.state.error ? <Recovery error={this.state.error.value} /> : this.props.children;
  }
}

function Recovery({ error }: { error: unknown }): JSX.Element {
  const [report] = useState(() => JSON.stringify(diagnosticReport(error), null, 2));
  const [status, setStatus] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setStatus('Report copied. It stays on your device unless you paste it somewhere.');
    } catch {
      setStatus('Could not copy. Select the report text below instead.');
    }
  };

  return (
    <main className="title" style={{ maxWidth: 720 }}>
      <h1>Something broke.</h1>
      <p className="lede">Reload, or copy a diagnostic report. The game tries to save after each move. If saving failed, reloading may lose recent moves.</p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '1.25rem 0' }}>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          Reload
        </button>
        <button type="button" className="btn" onClick={() => void copy()}>
          Copy diagnostic report
        </button>
      </div>
      <p role="status">{status}</p>
      <details>
        <summary>What the report contains</summary>
        <p>The rules version, the error, your browser's user agent and the time. Nothing is sent anywhere.</p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.8rem' }}>{report}</pre>
      </details>
    </main>
  );
}

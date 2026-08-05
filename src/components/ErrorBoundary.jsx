import { Component } from 'react';

/**
 * Last line of defence. Everything here runs on files the user chose, so an
 * unexpected throw is possible — showing what broke (and offering a clean
 * restart) beats a blank page.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('OSSC crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card elev-sm" style={{ maxWidth: 620 }}>
          <div className="card-kicker">Something went wrong</div>
          <p style={{ fontSize: 13, color: 'var(--color-neutral-300)', margin: '4px 0 10px' }}>
            OSSC hit an unexpected error and stopped rendering. Your audio never left the browser,
            and nothing on your CF card has been touched.
          </p>
          <pre
            className="mono"
            style={{
              fontSize: 11, color: 'var(--color-accent-300)', background: 'var(--color-neutral-900)',
              padding: '8px 10px', borderRadius: 4, maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap',
            }}
          >
            {String(error?.stack || error)}
          </pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
              Try to continue
            </button>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <span className="hint">If it keeps happening, reload and re-import your stems.</span>
          </div>
        </div>
      </div>
    );
  }
}

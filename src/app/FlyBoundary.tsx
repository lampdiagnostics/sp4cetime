import { Component, type ReactNode } from 'react';

interface Props {
  onExit: () => void;
  children: ReactNode;
}

/** If Fly mode fails to load or crashes, say so and offer a way back, instead of hanging. */
export class FlyBoundary extends Component<Props, { error: string | null }> {
  override state = { error: null as string | null };

  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fly-error" role="alert">
        <p>The 3D view couldn’t start: {this.state.error}</p>
        <p>
          <button type="button" onClick={() => location.reload()}>
            Reload
          </button>{' '}
          <button type="button" onClick={this.props.onExit}>
            ← Default view
          </button>
        </p>
      </div>
    );
  }
}

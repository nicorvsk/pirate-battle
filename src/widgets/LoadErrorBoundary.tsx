import { Component, type ReactNode } from 'react';
import { Dialog } from './Dialog';

interface Props {
  onQuit: () => void;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Catches a failed lazy chunk (offline, stale deploy). A rejected dynamic import is cached by
 * React.lazy, so the only reliable retry is a page reload.
 */
export class LoadErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Dialog label="Loading failed">
        <h2>Could not load the match</h2>
        <p role="alert">The game files could not be downloaded. Check your connection and try again.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
        <button onClick={this.props.onQuit}>Main Menu</button>
      </Dialog>
    );
  }
}

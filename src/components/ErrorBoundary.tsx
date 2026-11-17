import React from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyDetail = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          friendlyDetail = `Firestore ${parsed.operationType || 'operation'} denied (${
            parsed.path || 'unknown path'
          }): ${parsed.error}`;
        }
      } catch {
        // Keep original message
      }

      return (
        <div className="min-h-screen bg-[#4A3324] text-[#FAF6F0] flex items-center justify-center p-4 font-manrope">
          <div className="w-full max-w-md rounded-3xl bg-[#F4EDE2] border border-[#D5C4AE] text-[#1A120E] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#3A2418]">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <h1 className="text-base font-bold">Application Protection Triggered</h1>
            </div>
            <p className="text-xs font-medium text-[#3A2418] leading-relaxed break-words">
              {friendlyDetail}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  window.location.hash = '';
                  window.location.reload();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3A2418] hover:bg-[#1A120E] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload Link Hub</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

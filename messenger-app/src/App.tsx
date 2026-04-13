import { lazy, Suspense, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/Login';
import { useAuthStore } from '@/stores/authStore';
import { Toaster } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; componentStack: string | null }> {
  state = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#1a1a1a', color: '#ff6b6b', minHeight: '100vh' }}>
          <h2 style={{ color: '#fff' }}>Application Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{err.message}</pre>
          <pre style={{ color: '#aaffaa', fontSize: 13, marginTop: 16 }}>{this.state.componentStack}</pre>
          <pre style={{ color: '#888', fontSize: 11 }}>{err.stack}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const MessengerPage = lazy(() => import('@/pages/Messenger').then(m => ({ default: m.MessengerPage })));
const SettingsPage = lazy(() => import('@/pages/Settings').then(m => ({ default: m.SettingsPage })));

function PageLoader() {
  return (
    <div className="flex h-dvh items-center justify-center bg-tg-bg">
      <Loader2 className="h-8 w-8 animate-spin text-tg-primary" />
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <MessengerPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <PrivateRoute>
                  <SettingsPage />
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

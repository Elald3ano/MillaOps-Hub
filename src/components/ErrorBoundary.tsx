import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Captura excepciones de renderizado del árbol de React y muestra una tarjeta
 * de error en lugar de dejar la página en blanco.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[MillaOps Hub] Error no controlado en el render:', error, info.componentStack)
  }

  private reintentar = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state

    if (error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <AlertTriangle className="size-5" />
            </div>

            <h1 className="mt-4 text-lg font-bold text-slate-900">
              Ocurrió un error al cargar la aplicación
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              El error fue capturado para evitar una pantalla en blanco.
            </p>

            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs whitespace-pre-wrap text-red-300">
              {error.message}
            </pre>

            <button
              type="button"
              onClick={this.reintentar}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <RotateCcw className="size-4" />
              Reintentar
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

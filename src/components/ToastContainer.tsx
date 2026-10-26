import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '../lib/utils'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  variant: ToastVariant
  mensaje: string
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-white text-emerald-900',
  error: 'border-red-200 bg-white text-red-900',
  info: 'border-slate-200 bg-white text-slate-900',
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
} as const

const ICON_STYLES: Record<ToastVariant, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-slate-500',
}

/** Notificaciones flotantes sutiles (esquina inferior derecha). */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.variant]
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-slate-900/5',
              'animate-[toast-in_180ms_ease-out]',
              VARIANT_STYLES[toast.variant],
            )}
          >
            <Icon className={cn('mt-0.5 size-5 shrink-0', ICON_STYLES[toast.variant])} />
            <p className="flex-1 text-sm leading-snug">{toast.mensaje}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-md p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Cerrar notificación"
            >
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

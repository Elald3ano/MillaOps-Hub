import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface TarjetaAnaliticaProps {
  icon: LucideIcon
  titulo: string
  subtitulo?: string
  /** Acción opcional en la cabecera (ej. conmutador de pestañas). */
  accion?: ReactNode
  children: ReactNode
  className?: string
}

/** Contenedor dark (navy/slate) para las tarjetas de analítica distrital. */
export function TarjetaAnalitica({
  icon: Icon,
  titulo,
  subtitulo,
  accion,
  children,
  className,
}: TarjetaAnaliticaProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl bg-slate-900 p-5 text-slate-100 shadow-lg ring-1 ring-white/10',
        className,
      )}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
            <Icon className="size-4 text-emerald-300" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-white">{titulo}</h3>
            {subtitulo && <p className="mt-0.5 text-xs text-slate-400">{subtitulo}</p>}
          </div>
        </div>
        {accion}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

interface BarraProgresoProps {
  /** Proporción 0..1 (se recorta internamente). */
  valor: number
  /** Clases de Tailwind para el color del relleno. */
  color: string
  className?: string
}

/** Barra de progreso nativa con Tailwind (sin dependencias externas). */
export function BarraProgreso({ valor, color, className }: BarraProgresoProps) {
  const ancho = Math.max(0, Math.min(1, valor)) * 100
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/10', className)}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${ancho}%` }} />
    </div>
  )
}

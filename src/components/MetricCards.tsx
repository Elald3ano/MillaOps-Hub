import { AlertTriangle, Inbox, UserCheck, UserX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Servicio } from '../types'
import { cn } from '../lib/utils'
import { clasificarSla } from '../lib/sla'

interface MetricCardsProps {
  servicios: Servicio[]
}

interface CardShellProps {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  accent: string
  iconBg: string
  pulse?: boolean
}

function CardShell({ label, value, hint, icon: Icon, accent, iconBg, pulse }: CardShellProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn('absolute inset-x-0 top-0 h-1', accent)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            iconBg,
            pulse && 'animate-pulse',
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>
    </div>
  )
}

/** Fila de desglose del semáforo SLA (punto de color + etiqueta + conteo). */
function FilaSemaforo({
  color,
  label,
  valor,
  pulse,
}: {
  color: string
  label: string
  valor: number
  pulse?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-slate-600">
        <span className={cn('size-2.5 rounded-full', color, pulse && 'animate-pulse')} />
        {label}
      </span>
      <span
        className={cn(
          'text-sm font-bold tabular-nums',
          pulse ? 'text-red-600' : 'text-slate-900',
        )}
      >
        {valor}
      </span>
    </div>
  )
}

/** Grid de 4 tarjetas de métricas del despacho activo. */
export function MetricCards({ servicios }: MetricCardsProps) {
  const asignados = servicios.filter((s) => s.tecnico_id !== null).length
  const sinAsignar = servicios.length - asignados
  const alDia = servicios.filter((s) => clasificarSla(s.dias_antiguedad) === 'ok').length
  const dosDias = servicios.filter((s) => clasificarSla(s.dias_antiguedad) === 'warn').length
  const criticos = servicios.filter((s) => clasificarSla(s.dias_antiguedad) === 'critical').length

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <CardShell
        label="Total Órdenes"
        value={servicios.length}
        hint="Filas cargadas en el despacho"
        icon={Inbox}
        accent="bg-slate-700"
        iconBg="bg-slate-100 text-slate-700"
      />

      <CardShell
        label="Órdenes Asignadas"
        value={asignados}
        hint="Con técnico responsable"
        icon={UserCheck}
        accent="bg-emerald-500"
        iconBg="bg-emerald-50 text-emerald-600"
      />

      <CardShell
        label="Sin Asignar"
        value={sinAsignar}
        hint="Requieren técnico"
        icon={sinAsignar > 0 ? AlertTriangle : UserX}
        accent="bg-amber-500"
        iconBg={cn(
          'bg-amber-50 text-amber-600',
          sinAsignar > 0 && 'animate-pulse ring-1 ring-amber-300',
        )}
        pulse={sinAsignar > 0}
      />

      {/* Tarjeta semáforo SLA con desglose de 3 niveles */}
      <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="absolute inset-x-0 top-0 h-1 bg-red-500" />
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Semáforo SLA
        </p>
        <div className="mt-3 space-y-2">
          <FilaSemaforo color="bg-emerald-500" label="1 día" valor={alDia} />
          <FilaSemaforo color="bg-yellow-400" label="2 días" valor={dosDias} />
          <FilaSemaforo color="bg-red-500" label="3+ días" valor={criticos} pulse={criticos > 0} />
        </div>
      </div>
    </div>
  )
}

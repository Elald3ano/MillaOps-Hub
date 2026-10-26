import { AlertTriangle, CheckCircle2, Clock, Inbox, UserX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Servicio } from '../types'
import { cn } from '../lib/utils'
import { clasificarSla, SLA_MAX_OK, SLA_MAX_WARN } from '../lib/sla'

interface MetricCardsProps {
  abiertos: Servicio[]
  cerrados: Servicio[]
}

interface CardShellProps {
  label: string
  value: number | string
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

/** Grid de 4 tarjetas de métricas calculadas en el cliente. */
export function MetricCards({ abiertos, cerrados }: MetricCardsProps) {
  const ok = abiertos.filter((s) => clasificarSla(s.dias_antiguedad) === 'ok').length
  const warn = abiertos.filter((s) => clasificarSla(s.dias_antiguedad) === 'warn').length
  const criticos = abiertos.filter((s) => clasificarSla(s.dias_antiguedad) === 'critical').length
  const sinAsignar = abiertos.filter((s) => s.tecnico_id === null).length

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <CardShell
        label="Total Abiertos"
        value={abiertos.length}
        hint="Órdenes activas en el lote"
        icon={Inbox}
        accent="bg-slate-700"
        iconBg="bg-slate-100 text-slate-700"
      />

      <CardShell
        label="Resueltos / Cerrados"
        value={cerrados.length}
        hint="Cerradas frente a la Línea Base"
        icon={CheckCircle2}
        accent="bg-emerald-500"
        iconBg="bg-emerald-50 text-emerald-600"
      />

      {/* Semáforo de SLA: se renderiza como bloque propio para mostrar 3 niveles */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Semáforo de SLA
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
              {ok + warn + criticos}
            </p>
            <p className="mt-1 text-xs text-slate-500">Órdenes abiertas por antigüedad</p>
          </div>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Clock className="size-5" />
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-emerald-50 px-1 py-1.5 ring-1 ring-emerald-200">
            <p className="text-base font-bold text-emerald-700 tabular-nums">{ok}</p>
            <p className="text-[10px] leading-tight font-medium text-emerald-700">
              🟢 {SLA_MAX_OK} días
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 px-1 py-1.5 ring-1 ring-amber-200">
            <p className="text-base font-bold text-amber-700 tabular-nums">{warn}</p>
            <p className="text-[10px] leading-tight font-medium text-amber-700">
              🟡 {SLA_MAX_OK + 1}-{SLA_MAX_WARN} días
            </p>
          </div>
          <div
            className={cn(
              'rounded-lg bg-red-50 px-1 py-1.5 ring-1 ring-red-200',
              criticos > 0 && 'animate-pulse ring-2 ring-red-400',
            )}
          >
            <p className="text-base font-bold text-red-700 tabular-nums">{criticos}</p>
            <p className="text-[10px] leading-tight font-medium text-red-700">
              🔴 +{SLA_MAX_WARN} días
            </p>
          </div>
        </div>
      </div>

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
    </div>
  )
}

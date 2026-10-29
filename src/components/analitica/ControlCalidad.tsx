import { useMemo } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { Servicio } from '../../types'
import { clasificarSla } from '../../lib/sla'
import { esGarantia, esPqrTecnica } from '../../lib/tiposServicio'
import { BarraProgreso, TarjetaAnalitica } from './TarjetaAnalitica'

// Tickets con más de 60 días se consideran "zombies" y se excluyen del top urgente.
const ZOMBIE_DIAS = 60

/** Control de calidad (Garantía/PQR) y salud del SLA. */
export function ControlCalidad({ servicios }: { servicios: Servicio[] }) {
  const data = useMemo(() => {
    const total = servicios.length
    const garantias = servicios.filter((s) => esGarantia(s.tipo_servicio)).length
    const pqr = servicios.filter((s) => esPqrTecnica(s.tipo_servicio)).length

    const alDia = servicios.filter((s) => clasificarSla(s.dias_antiguedad) === 'ok').length
    const preventivas = servicios.filter((s) => clasificarSla(s.dias_antiguedad) === 'warn').length
    const criticas = servicios.filter((s) => clasificarSla(s.dias_antiguedad) === 'critical').length

    const urgentes = servicios
      .filter((s) => s.dias_antiguedad <= ZOMBIE_DIAS)
      .sort((a, b) => b.dias_antiguedad - a.dias_antiguedad)
      .slice(0, 5)

    const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100))

    return { total, garantias, pqr, alDia, preventivas, criticas, urgentes, pct }
  }, [servicios])

  return (
    <TarjetaAnalitica
      icon={ShieldCheck}
      titulo="Control de Calidad y SLA"
      subtitulo="Garantías, PQR y salud del semáforo"
    >
      {/* Indicador de calidad */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <p className="text-2xl font-bold text-white tabular-nums">{data.garantias}</p>
          <p className="text-[11px] text-slate-400">Garantías</p>
        </div>
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <p className="text-2xl font-bold text-white tabular-nums">{data.pqr}</p>
          <p className="text-[11px] text-slate-400">PQR Técnica</p>
        </div>
      </div>

      {/* Salud del SLA */}
      <div className="space-y-2.5">
        <FilaSla label="Al día (1 día)" valor={data.alDia} pct={data.pct(data.alDia)} color="bg-emerald-500" />
        <FilaSla label="Preventivas (2 días)" valor={data.preventivas} pct={data.pct(data.preventivas)} color="bg-yellow-400" />
        <FilaSla label="Críticas (3+ días)" valor={data.criticas} pct={data.pct(data.criticas)} color="bg-red-500" />
      </div>

      {/* Top 5 más urgentes */}
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="text-xs font-semibold text-slate-300">Top 5 órdenes más urgentes</p>
        {data.urgentes.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            Sin órdenes urgentes (excluyendo tickets de más de 60 días).
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {data.urgentes.map((s) => (
              <li key={s.id} className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-slate-100">
                    {s.nombre_cliente || 'SIN NOMBRE'}
                  </p>
                  <span className="shrink-0 rounded-md bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300 tabular-nums ring-1 ring-red-500/30">
                    {s.dias_antiguedad} días
                  </span>
                </div>
                <p className="truncate text-[11px] text-slate-400">
                  {s.barrio} · {s.telefono_cliente || 'S/T'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </TarjetaAnalitica>
  )
}

function FilaSla({
  label,
  valor,
  pct,
  color,
}: {
  label: string
  valor: number
  pct: number
  color: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-300">{label}</span>
        <span className="text-xs font-semibold text-slate-200 tabular-nums">
          {valor} · {pct}%
        </span>
      </div>
      <BarraProgreso valor={pct / 100} color={color} />
    </div>
  )
}

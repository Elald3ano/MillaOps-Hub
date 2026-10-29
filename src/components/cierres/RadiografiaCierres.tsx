import { useMemo } from 'react'
import { MapPin, Search, X } from 'lucide-react'
import type { Servicio } from '../../types'
import { clasificarSla, SLA_BADGE_CLASSES } from '../../lib/sla'
import { esGarantia } from '../../lib/tiposServicio'
import { limpiarTexto } from '../../lib/normalizer'
import { cn } from '../../lib/utils'
import { TarjetaAnalitica } from '../analitica/TarjetaAnalitica'

interface RadiografiaCierresProps {
  tecnicoId: string | null
  tecnicoNombre: string | null
  cerrados: Servicio[]
  onVerGlobal: () => void
}

/** Radiografía de las órdenes resueltas por un técnico en el corte analizado. */
export function RadiografiaCierres({
  tecnicoId,
  tecnicoNombre,
  cerrados,
  onVerGlobal,
}: RadiografiaCierresProps) {
  const desglose = useMemo(() => {
    const porTipo = new Map<string, number>()
    for (const s of cerrados) {
      const clave = limpiarTexto(s.tipo_servicio)
      porTipo.set(clave, (porTipo.get(clave) ?? 0) + 1)
    }
    return [...porTipo.entries()]
      .map(([clave, cantidad]) => {
        const ejemplo = cerrados.find((s) => limpiarTexto(s.tipo_servicio) === clave)
        return { label: ejemplo?.tipo_servicio ?? clave, cantidad }
      })
      .sort((a, b) => b.cantidad - a.cantidad)
  }, [cerrados])

  const barrios = useMemo(() => {
    const porBarrio = new Map<string, { label: string; cantidad: number }>()
    for (const s of cerrados) {
      const clave = limpiarTexto(s.barrio)
      const prev = porBarrio.get(clave)
      if (prev) prev.cantidad += 1
      else porBarrio.set(clave, { label: s.barrio || 'Sin barrio', cantidad: 1 })
    }
    return [...porBarrio.values()].sort((a, b) => b.cantidad - a.cantidad)
  }, [cerrados])

  return (
    <TarjetaAnalitica
      icon={Search}
      titulo="Radiografía de Órdenes Resueltas"
      subtitulo={
        tecnicoId ? `${tecnicoNombre ?? 'Técnico'} · ${cerrados.length} cerradas` : 'Selecciona un técnico'
      }
      accion={
        tecnicoId ? (
          <button
            type="button"
            onClick={onVerGlobal}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-3.5" /> Ver Global
          </button>
        ) : undefined
      }
    >
      {!tecnicoId ? (
        <p className="text-xs text-slate-400">
          Haz clic en un técnico del ranking para auditar sus órdenes resueltas.
        </p>
      ) : cerrados.length === 0 ? (
        <p className="text-xs text-slate-400">Este técnico no tiene órdenes cerradas en el corte.</p>
      ) : (
        <>
          {/* Desglose de tipos de servicio resueltos */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-300">
              Tipos de servicio resueltos
            </p>
            <div className="flex flex-wrap gap-1.5">
              {desglose.map((d) => (
                <span
                  key={d.label}
                  className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 ring-1 ring-white/10"
                >
                  {d.label}
                  <span className="font-bold text-cyan-300 tabular-nums">{d.cantidad}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Barrios donde cerró órdenes */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-300">Barrios atendidos</p>
            <div className="flex flex-wrap gap-1.5">
              {barrios.map((b) => (
                <span
                  key={b.label}
                  className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 ring-1 ring-white/10"
                >
                  <MapPin className="size-3 text-slate-500" />
                  {b.label}
                  <span className="font-bold text-slate-400 tabular-nums">{b.cantidad}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Lista detallada de clientes atendidos */}
          <div className="overflow-hidden rounded-lg ring-1 ring-white/10">
            <div className="max-h-[550px] overflow-x-auto overflow-y-auto pr-1">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-[10px] tracking-wide text-slate-400 uppercase">
                  <tr>
                    <th className="px-3 py-1.5 font-semibold">Días</th>
                    <th className="px-3 py-1.5 font-semibold">Orden #</th>
                    <th className="px-3 py-1.5 font-semibold">Barrio</th>
                    <th className="px-3 py-1.5 font-semibold">Dirección</th>
                    <th className="px-3 py-1.5 font-semibold">Cliente / Tel / Ref</th>
                    <th className="px-3 py-1.5 font-semibold">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {cerrados.map((s) => (
                    <tr key={s.id} className="align-top">
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-block rounded-md px-2 py-0.5 text-center text-[11px] font-bold tabular-nums',
                            SLA_BADGE_CLASSES[clasificarSla(s.dias_antiguedad)],
                          )}
                        >
                          {s.dias_antiguedad} {s.dias_antiguedad === 1 ? 'día' : 'días'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] font-bold whitespace-nowrap text-white">
                        {s.numero_orden}
                      </td>
                      <td className="px-3 py-1.5 text-slate-300">{s.barrio}</td>
                      <td className="px-3 py-1.5 text-slate-300">{s.direccion || '—'}</td>
                      <td className="px-3 py-1.5">
                        <p className="font-semibold text-slate-100">
                          {s.nombre_cliente || 'SIN NOMBRE'}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {s.telefono_cliente || 'S/T'} · Ref: {s.referencia_pago || 'S/R'}
                        </p>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="text-slate-300">{s.tipo_servicio}</span>
                        {esGarantia(s.tipo_servicio) && (
                          <span className="mt-1 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/30">
                            🛡️ Garantía{s.dias_antiguedad < 15 ? ' (<15d)' : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </TarjetaAnalitica>
  )
}

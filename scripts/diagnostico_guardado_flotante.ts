/**
 * Diagnóstico: ¿por qué las cuadrillas flotantes no persisten en la UI tras F5?
 *
 * Verifica la "verdad" de los datos en Supabase para el técnico "Luis Salas":
 *  1. ID del técnico + cuántas filas tiene en `reglas_asignacion` para Cali.
 *  2. Cuántos BARRIOS y SERVICIOS distintos tiene realmente guardados.
 *  3. Si la consulta de arranque (`select('*')` sin límite) trunca a 1.000 filas.
 *
 * Uso: npx tsx scripts/diagnostico_guardado_flotante.ts
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/database'

try {
  process.loadEnvFile('.env')
} catch {
  console.error('⚠️  No se pudo cargar .env (¿existe en la raíz del proyecto?).')
}

const url = process.env.VITE_SUPABASE_URL ?? ''
const key = process.env.VITE_SUPABASE_ANON_KEY ?? ''
if (!url || !key || url.includes('placeholder')) {
  console.error('❌ Credenciales no válidas. Revisa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}

const supabase = createClient<Database>(url, key)

/** Trae TODAS las filas de una consulta paginando con .range(). */
async function paginar<T>(
  run: (from: number, to: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>,
  pageSize = 1000,
): Promise<T[]> {
  const filas: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await run(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    filas.push(...data)
    if (data.length < pageSize) break
  }
  return filas
}

async function main(): Promise<void> {
  console.log('=== FASE 1 · Diagnóstico de guardado flotante (Luis Salas) ===\n')

  // ── 1. Localizar a Luis Salas ────────────────────────────────────────────
  const { data: candidatos, error: errTec } = await supabase
    .from('tecnicos')
    .select('id, nombre')
    .ilike('nombre', '%Luis%Salas%')

  if (errTec) throw new Error(`Error buscando técnico: ${errTec.message}`)
  console.log('Técnicos que coinciden con "Luis Salas":')
  for (const t of candidatos ?? []) console.log(`   ${t.id}  ${t.nombre}`)

  const luis = (candidatos ?? []).find((t) => t.nombre.toLowerCase().includes('luis salas'))
  if (!luis) {
    console.log('\n❌ No se encontró un técnico llamado exactamente "Luis Salas".')
    return
  }
  const idLuis = luis.id
  console.log(`\n✔ ID de Luis Salas = ${idLuis}`)

  // ── 2. Conteos para Luis Salas en Cali ───────────────────────────────────
  const { count: totalCali } = await supabase
    .from('reglas_asignacion')
    .select('*', { count: 'exact', head: true })
    .eq('tecnico_id', idLuis)
    .ilike('ciudad', 'Cali')
  console.log(`\nFilas de reglas_asignacion (Luis Salas, ciudad ILIKE 'Cali'): ${totalCali}`)

  const filasCali = await paginar<{
    barrio: string | null
    tipo_servicio: string | null
    ciudad: string
  }>((from, to) =>
    supabase
      .from('reglas_asignacion')
      .select('ciudad, barrio, tipo_servicio')
      .eq('tecnico_id', idLuis)
      .ilike('ciudad', 'Cali')
      .order('barrio')
      .range(from, to),
  )

  const barrios = new Set<string>()
  const servicios = new Set<string>()
  for (const r of filasCali) {
    if (r.barrio) barrios.add(r.barrio)
    if (r.tipo_servicio) servicios.add(r.tipo_servicio)
  }

  console.log(`\nBarrios DISTINTOS guardados para Luis Salas en Cali: ${barrios.size}`)
  console.log(`Servicios DISTINTOS guardados para Luis Salas en Cali: ${servicios.size}`)
  console.log(`  (esperado si guardó 50 barrios × 27 servicios: 50 barrios, 27 servicios)`)

  if (barrios.size <= 5) {
    console.log('\n   Barrios encontrados:')
    for (const b of [...barrios].sort()) console.log(`     - ${b}`)
  } else {
    console.log('\n   Primeros 10 barrios:')
    for (const b of [...barrios].sort().slice(0, 10)) console.log(`     - ${b}`)
    console.log('     …')
  }

  // ── 3. Límite de 1.000 filas de PostgREST ────────────────────────────────
  console.log('\n── Verificación del límite de 1.000 filas ──')

  const { count: totalReglasBD } = await supabase
    .from('reglas_asignacion')
    .select('*', { count: 'exact', head: true })
  console.log(`Reglas TOTALES en reglas_asignacion (count exacto): ${totalReglasBD}`)

  // La consulta de arranque de la app: select('*') SIN límite.
  const { data: arranque } = await supabase.from('reglas_asignacion').select('*')
  console.log(`\nselect('*') SIN límite (lo que usa getReglas) devuelve: ${arranque?.length ?? 0} filas`)

  if ((arranque?.length ?? 0) === 1000) {
    console.log(
      '\n🚨 ALERTA CRÍTICA: la consulta devuelve EXACTAMENTE 1.000 filas.',
    )
    console.log(
      '   PostgREST está truncando la respuesta por su límite por defecto (1.000).',
    )
    console.log(
      `   getReglas() oculta ${(totalReglasBD ?? 0) - 1000} reglas adicionales,`,
    )
    console.log('   incluidas la mayoría de las reglas flotantes de Luis Salas.')
  } else if ((arranque?.length ?? 0) < (totalReglasBD ?? 0)) {
    console.log(
      `\n⚠️  La consulta devuelve ${arranque?.length} de ${totalReglasBD} filas (truncada parcialmente).`,
    )
  } else {
    console.log('\n✅ La consulta devuelve TODAS las filas (no hay truncamiento en esta tabla).')
  }

  // ── 4. Diagnóstico de hidratación (qué vería la UI tras F5) ─────────────
  console.log('\n── Simulación de hidratación (derivarConfigs) ──')
  const filasArranque = arranque ?? []
  const deLuisEnArranque = filasArranque.filter(
    (r) => r.tecnico_id === idLuis && r.ciudad.toLowerCase() === 'cali' && r.tipo_servicio,
  )
  const barriosEnUI = new Set<string>()
  for (const r of deLuisEnArranque) if (r.barrio) barriosEnUI.add(r.barrio)
  console.log(
    `Reglas flotantes de Luis Salas en Cali presentes en la respuesta de arranque: ${deLuisEnArranque.length}`,
  )
  console.log(`Barrios flotantes que la UI pintaría seleccionados: ${barriosEnUI.size}`)
  if (barriosEnUI.size > 0) {
    console.log('   Barrios visibles:')
    for (const b of [...barriosEnUI].sort()) console.log(`     - ${b}`)
  }

  // ── 5. Verificación de la solución (lectura paginada) ────────────────────
  console.log('\n── Verificación de la lectura paginada (la solución) ──')
  const todas = await paginar<{ id: string }>((from, to) =>
    supabase.from('reglas_asignacion').select('id').order('id').range(from, to),
  )
  console.log(
    `Lectura paginada de reglas_asignacion devuelve: ${todas.length} filas (total real: ${totalReglasBD})`,
  )
  console.log(
    todas.length === (totalReglasBD ?? -1)
      ? '✅ La paginación recupera el 100% de la matriz (la UI ya no se truncará).'
      : '❌ La paginación NO recupera todo; revisar la implementación.',
  )

  console.log('\n=== Fin del diagnóstico ===')
}

main().catch((error) => {
  console.error('Error en diagnóstico:', error)
  process.exit(1)
})

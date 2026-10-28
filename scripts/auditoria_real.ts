/**
 * Auditoría de la "verdad" de los datos en Supabase.
 *
 * Ejecuta una lectura cruda de las tablas `tecnicos`, `reglas_asignacion` y
 * `servicios` usando las credenciales anónimas del `.env`, imprime muestras
 * JSON reales y simula la comparación servicio ↔ regla para detectar la causa
 * raíz de la asignación fallida.
 *
 * Uso:
 *   npx tsx scripts/auditoria_real.ts
 *   (o, con Node >= 23.6: node scripts/auditoria_real.ts)
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/database'

// 1. Cargar credenciales del .env (no sobreescribe variables ya presentes).
try {
  process.loadEnvFile('.env')
} catch {
  console.error('⚠️  No se pudo cargar .env (¿existe en la raíz del proyecto?).')
}

const url = process.env.VITE_SUPABASE_URL ?? ''
const key = process.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!url || !key || url.includes('placeholder')) {
  console.error('❌ Credenciales no válidas. Revisa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.')
  process.exit(1)
}

const supabase = createClient<Database>(url, key)

/** Limpieza pura (KISS): solo letras y números, sin tildes/espacios/símbolos. */
function limpiar(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function clave(ciudad: string, barrio: string): string {
  return `${limpiar(ciudad)}|${limpiar(barrio)}`
}

/** Compara dos cadenas carácter por carácter (códigos ASCII) si difieren. */
function diagnosticarDiferencia(a: string, b: string): void {
  if (a === b) {
    console.log('   ✅ Idénticas.')
    return
  }
  console.log(`   ❌ Difieren. len(A)=${a.length} len(B)=${b.length}`)
  console.log(`   A = ${JSON.stringify(a)}`)
  console.log(`   B = ${JSON.stringify(b)}`)
  const max = Math.max(a.length, b.length)
  let reportadas = 0
  for (let i = 0; i < max && reportadas < 8; i++) {
    const charA = a[i]
    const charB = b[i]
    if (charA !== charB) {
      const visA = charA === undefined ? '<fin>' : JSON.stringify(charA)
      const visB = charB === undefined ? '<fin>' : JSON.stringify(charB)
      const codeA = charA === undefined ? '—' : charA.charCodeAt(0)
      const codeB = charB === undefined ? '—' : charB.charCodeAt(0)
      console.log(`     pos ${i}: ${visA} (${codeA})  vs  ${visB} (${codeB})`)
      reportadas++
    }
  }
}

async function main(): Promise<void> {
  console.log('=== FASE 1 · Auditoría de la realidad ===\n')

  // 1) Conteos crudos.
  const [tec, reg, serv] = await Promise.all([
    supabase.from('tecnicos').select('*', { count: 'exact', head: true }),
    supabase.from('reglas_asignacion').select('*', { count: 'exact', head: true }),
    supabase.from('servicios').select('*', { count: 'exact', head: true }),
  ])

  console.log(`tecnicos          -> count = ${tec.count ?? '?'}  error = ${tec.error?.message ?? '—'}`)
  console.log(`reglas_asignacion -> count = ${reg.count ?? '?'}  error = ${reg.error?.message ?? '—'}`)
  console.log(`servicios         -> count = ${serv.count ?? '?'}  error = ${serv.error?.message ?? '—'}`)

  if ((reg.count ?? 0) === 0 && (serv.count ?? 0) > 0) {
    console.log('\n🚨 ALERTA CRÍTICA DE RLS:')
    console.log('   `reglas_asignacion` devuelve 0 filas vía API, aunque haya servicios.')
    console.log('   Las políticas RLS pueden estar bloqueando la lectura del rol `anon`.')
  } else if ((tec.count ?? 0) === 0) {
    console.log('\n⚠️  `tecnicos` devuelve 0 filas. Posible RLS o tabla sin sembrar.')
  }

  // 2) Muestras JSON reales (Cerrito o, en su defecto, Cali).
  const { data: servCerrito, error: errCerrito } = await supabase
    .from('servicios')
    .select('*')
    .eq('ciudad', 'Cerrito')
    .limit(2)

  const hayCerrito = (servCerrito?.length ?? 0) > 0
  const ciudadMuestra = hayCerrito ? 'Cerrito' : 'Cali'

  const { data: servMuestra } = hayCerrito
    ? { data: servCerrito }
    : await supabase.from('servicios').select('*').eq('ciudad', 'Cali').limit(2)

  const { data: regMuestra } = await supabase
    .from('reglas_asignacion')
    .select('*')
    .eq('ciudad', ciudadMuestra)
    .limit(2)

  if (!hayCerrito && errCerrito) {
    console.log(`\n(Nota: falló la consulta de Cerrito: ${errCerrito.message})`)
  }

  console.log(`\n--- Muestras (ciudad: ${ciudadMuestra}) ---`)
  for (const s of servMuestra ?? []) {
    console.log('\nSERVICIO REAL:', JSON.stringify(s, null, 2))
  }
  for (const r of regMuestra ?? []) {
    console.log('\nREGLA REAL:', JSON.stringify(r, null, 2))
  }

  // 3) Simulación de comparación.
  console.log('\n--- Comparación servicio vs regla ---')
  const s0 = servMuestra?.[0]
  const r0 = regMuestra?.[0]

  if (!s0) {
    console.log('No hay servicios de muestra para comparar.')
    return
  }
  if (!r0) {
    console.log('No hay reglas de muestra para comparar (¿reglas_asignacion vacía?).')
    return
  }

  console.log(`Servicio: ciudad="${s0.ciudad}" barrio="${s0.barrio}"`)
  console.log(`Regla:    ciudad="${r0.ciudad}" barrio="${r0.barrio ?? ''}"`)

  console.log('\n[ciudad]')
  diagnosticarDiferencia(s0.ciudad, r0.ciudad)

  console.log('[barrio]')
  diagnosticarDiferencia(s0.barrio, r0.barrio ?? '')

  console.log(`\nClave KISS servicio: "${clave(s0.ciudad, s0.barrio)}"`)
  console.log(`Clave KISS regla:    "${clave(r0.ciudad, r0.barrio ?? '')}"`)
  console.log(
    `\n=> ${clave(s0.ciudad, s0.barrio) === clave(r0.ciudad, r0.barrio ?? '') ? 'COINCIDEN ✅' : 'NO coinciden ❌'}`,
  )

  console.log('\n=== Fin de auditoría ===')
}

main().catch((error) => {
  console.error('Error en auditoría:', error)
  process.exit(1)
})

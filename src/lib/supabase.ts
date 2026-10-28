import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_KEY = 'placeholder-anon-key'

const envUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL
const envKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

/** ¿La URL tiene forma de URL http(s) válida? */
function esUrlValida(valor: string | undefined): valor is string {
  if (!valor) return false
  try {
    const url = new URL(valor)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const urlValida = esUrlValida(envUrl)
const keyValida = Boolean(envKey && envKey.trim().length > 20)

/**
 * NUNCA lanzamos una excepción aquí: este módulo se evalúa al cargar el bundle,
 * y un `throw` a nivel raíz dejaría la SPA en blanco sin posibilidad de montar
 * la UI. En su lugar usamos valores dummy y avisamos por consola.
 */
if (!urlValida || !keyValida) {
  console.warn(
    '[MillaOps Hub] Supabase no está configurado. ' +
      'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY (copia .env.example a .env). ' +
      'La aplicación arrancará en modo sin conexión.',
  )
}

export const supabaseUrl = urlValida ? envUrl : PLACEHOLDER_URL
export const supabaseAnonKey = keyValida ? (envKey as string) : PLACEHOLDER_KEY

export const isSupabaseConfigured = Boolean(
  urlValida && keyValida && !supabaseUrl.includes('placeholder'),
)

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

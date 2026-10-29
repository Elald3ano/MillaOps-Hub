import { limpiarTexto } from './normalizer'

/**
 * Catálogo oficial completo de los 73 tipos de servicio de la compañía.
 *
 * Fuente única de verdad para la selección de especialidades de las
 * cuadrillas flotantes. El orden es el oficial y no debe alterarse; el
 * cruce con los datos reales (Sigma) se hace siempre con `limpiarTexto`.
 */
export const TIPOS_SERVICIO_OFICIALES = [
  'Activacion Cable Modem',
  'Activación IP Publica',
  'Alquiler De Router',
  'Ampliacion NAP',
  'Cable De Red Desconectado',
  'Cable Reventado',
  'Camaras sin señal',
  'Cambio Cortesia A Con',
  'Cambio Cpe',
  'Cambio De Cable',
  'Cambio de clave',
  'Cambio De Decodificador (O Catv)',
  'CAMBIO DE ONU',
  'cambio de velocidad',
  'Canales Deficientes',
  'Conectividad Nula',
  'Contrato Eliminado WISPRO',
  'Cpe Malo',
  'Energizacion',
  'Garantia',
  'Instalacion Cortesia',
  'Instalacion Cortesia Comercial',
  'Instalacion Cortesia Empleado',
  'Instalacion Internet Satelital',
  'Instalación Cámaras',
  'Instalación STB',
  'Instalación Televisión Corporativo',
  'Instalación WIFI',
  'Interferencia',
  'Intermitencia Al Navegar',
  'Legalizacion',
  'Lentitud Al Navegar',
  'Llovizna',
  'Mantenimiento preventivo',
  'Modificacion Punto De Internet',
  'Modificar Instalacion Externa',
  'Modificar Instalacion Interna',
  'Navegador Malo',
  'Pendiente por Configuración WISPRO Desconexión',
  'Pendiente por Configuración WISPRO Reconexión',
  'PQR Técnica',
  'PROVISIONAL Marañón-Arándanos',
  'Reconexion',
  'Reconexion Internet',
  'Reinstalacion Por Venta TV',
  'Retencion Usuario',
  'REVISION 1º NIVEL - CAMBIO DE CLAVE',
  'REVISION 1º NIVEL - CAMBIO DE PLAN DE VELOCIDAD',
  'REVISION 1º NIVEL - INTERMITENCIA AL NAVEGAR',
  'REVISION 1º NIVEL - LENTITUD AL NAVEGAR',
  'REVISION 1º NIVEL - SIN SEÑAL INTERNET',
  'REVISION DE INTERNET ( 1º NIVEL)',
  'Revision Deco',
  'Router Desconfigurado',
  'Router Mesh Reactivado',
  'Servicio En Proceso',
  'Servicio Prioridad',
  'Señal Deficiente en Instalación',
  'Sin Señal',
  'Sin señal Digital',
  'Sin Señal Digital FTTH',
  'Sin Señal Internet',
  'Sin Señal TV FTTH',
  'Sin señal Wifi',
  'Sintonizacion',
  'Sintonizar Decodificador',
  'Solicitud Catv',
  'Soporte MAS TV',
  'Soporte Tecnico Cable Modem',
  'Tarjeta De Red Deshabilitada',
  'Traslado Interno Cable Modem',
  'Usuario No Registrado',
  'Venta de Caja Legon',
] as const

/** Tipo de servicio oficial (unión literal de las 73 entradas). */
export type TipoServicioOficial = (typeof TIPOS_SERVICIO_OFICIALES)[number]

/** Cantidad total del catálogo oficial. */
export const TOTAL_TIPOS_SERVICIO = TIPOS_SERVICIO_OFICIALES.length

// ---- Clasificación de tipos de servicio para el módulo de analítica ----
// Todo cruce se hace con `limpiarTexto` (Invariante #1).

// Palabras clave (normalizadas) de trámites livianos resolubles por una moto.
const CLAVES_LIVIANAS = [
  'cambiodeclave', // Cambio de clave / REVISIÓN 1º NIVEL - CAMBIO DE CLAVE
  'cambiodeplan', // Cambio de plan de velocidad
  'cambiodevelocidad', // cambio de velocidad
  'lentitud', // Lentitud al navegar
  'intermitencia', // Intermitencia al navegar
  'actualizaciondatos', // Actualización de datos personales
  'alquilerderouter', // Alquiler de router
  'routerdesconfigurado', // Router desconfigurado
  'routermesh', // Router mesh (reactivado)
  'cambiocpe', // Cambio CPE
  'cambiodeonu', // Cambio de ONU
] as const

/** ¿El tipo de servicio es un trámite liviano (oportunidad para moto)? */
export function esServicioLiviano(tipo: string): boolean {
  const limpio = limpiarTexto(tipo)
  return CLAVES_LIVIANAS.some((clave) => limpio.includes(clave))
}

/** ¿El tipo de servicio corresponde a una falla de "Sin Señal"? */
export function esSinSenal(tipo: string): boolean {
  return limpiarTexto(tipo).includes('sinsenal')
}

/** ¿El tipo de servicio es una "Garantía"? */
export function esGarantia(tipo: string): boolean {
  return limpiarTexto(tipo).includes('garantia')
}

/** ¿El tipo de servicio es una "PQR Técnica"? */
export function esPqrTecnica(tipo: string): boolean {
  return limpiarTexto(tipo).includes('pqr')
}

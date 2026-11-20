/**
 * Tipos compartidos por todos los servicios que hablan con un periférico del
 * dispositivo (cámara, GPS y sensor de movimiento).
 *
 * Patrón aplicado: "Result Object". En vez de lanzar excepciones hacia la capa
 * de presentación, cada servicio devuelve un objeto que describe el éxito o el
 * motivo exacto del fallo. Así la página siempre puede mostrar un mensaje claro
 * al usuario (permiso denegado, periférico no disponible, tiempo agotado, …)
 * sin necesidad de inspeccionar errores nativos de cada plugin.
 */

export type MotivoFallo =
  | 'permiso-denegado'
  | 'permiso-bloqueado'
  | 'no-disponible'
  | 'cancelado'
  | 'tiempo-agotado'
  | 'datos-invalidos'
  | 'error';

export interface ExitoPeriferico<T> {
  ok: true;
  datos: T;
  /** Milisegundos que tardó el periférico en responder (métrica de rendimiento). */
  duracionMs: number;
}

export interface FalloPeriferico {
  ok: false;
  motivo: MotivoFallo;
  mensaje: string;
  duracionMs: number;
}

export type ResultadoPeriferico<T> = ExitoPeriferico<T> | FalloPeriferico;

export function exito<T>(datos: T, duracionMs = 0): ExitoPeriferico<T> {
  return { ok: true, datos, duracionMs };
}

export function fallo(motivo: MotivoFallo, mensaje: string, duracionMs = 0): FalloPeriferico {
  return { ok: false, motivo, mensaje, duracionMs };
}

/** Estado de un permiso ya normalizado para la interfaz de usuario. */
export type EstadoPermiso =
  /** El usuario autorizó el acceso. */
  | 'concedido'
  /** El usuario rechazó la solicitud en esta ocasión; se puede volver a pedir. */
  | 'denegado'
  /** Rechazo permanente: hay que habilitarlo desde los ajustes del sistema. */
  | 'bloqueado'
  /** Todavía no se ha solicitado. */
  | 'pendiente'
  /** La plataforma actual no gestiona ese permiso (por ejemplo, el navegador). */
  | 'no-aplica';

export type ClavePermiso = 'camara' | 'ubicacion' | 'movimiento';

export interface RegistroPermisos {
  camara: EstadoPermiso;
  ubicacion: EstadoPermiso;
  movimiento: EstadoPermiso;
}

/** Foto capturada con la cámara y asociada a una tarea. */
export interface FotoTarea {
  /** Ruta lista para usar en un <img src="…">. */
  src: string;
  /** Ruta del archivo en el dispositivo (sólo en plataformas nativas). */
  uri?: string;
  formato: string;
  capturadaEn: string;
}

/** Punto obtenido desde el GPS del dispositivo. */
export interface UbicacionTarea {
  latitud: number;
  longitud: number;
  /** Precisión horizontal informada por el GPS, en metros. */
  precisionMetros: number;
  obtenidaEn: string;
}

/** Lectura instantánea del acelerómetro. */
export interface LecturaSensor {
  x: number;
  y: number;
  z: number;
  /** Módulo del vector de aceleración, en m/s². */
  magnitud: number;
  medidaEn: string;
}

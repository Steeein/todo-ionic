import { Injectable } from '@angular/core';
import { Camera } from '@capacitor/camera';
import { Capacitor, PermissionState } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

import { ClavePermiso, EstadoPermiso, RegistroPermisos } from '../models/periferico.model';

/** Estados que devuelven los plugins de Capacitor ('limited' sólo en iOS). */
type EstadoNativo = PermissionState | 'limited';

/**
 * Punto único de gestión de permisos de los periféricos.
 *
 * Patrón aplicado: "Facade". Las páginas nunca llaman a `requestPermissions()`
 * de cada plugin: piden el permiso a este servicio, que aplica siempre las
 * mismas reglas de buenas prácticas:
 *
 *  1. Se consulta primero el estado actual (`checkPermissions`) y sólo se
 *     muestra el diálogo del sistema si realmente hace falta: no se molesta al
 *     usuario con solicitudes repetidas.
 *  2. El permiso se pide en el momento en que se va a usar el periférico
 *     (just-in-time), nunca al abrir la aplicación.
 *  3. Un rechazo permanente ("bloqueado") se distingue de un rechazo puntual
 *     ("denegado") para poder guiar al usuario hacia los ajustes del sistema.
 *  4. Si la plataforma no implementa el permiso (navegador de escritorio), se
 *     informa "no-aplica" en lugar de propagar un error.
 */
@Injectable({ providedIn: 'root' })
export class PermisosService {
  /** Motivos que se muestran al usuario antes de abrir el diálogo del sistema. */
  static readonly JUSTIFICACIONES: Record<ClavePermiso, string> = {
    camara: 'Se usa la cámara únicamente para adjuntar una foto a la tarea que estás creando.',
    ubicacion:
      'Se usa el GPS únicamente para registrar el lugar donde creaste la tarea. No se comparte con terceros.',
    movimiento:
      'Se usa el sensor de movimiento para mostrar las lecturas del acelerómetro en la pantalla de diagnóstico.',
  };

  /** Solicita (si corresponde) el permiso de cámara y galería. */
  async asegurarCamara(): Promise<EstadoPermiso> {
    try {
      const actual = await Camera.checkPermissions();
      const estado = this.normalizar(actual.camera);
      if (estado !== 'pendiente') {
        return estado;
      }

      const solicitado = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
      return this.normalizar(solicitado.camera, true);
    } catch {
      // En navegador el plugin no implementa checkPermissions: es el propio
      // navegador el que pregunta al abrir la cámara.
      return 'no-aplica';
    }
  }

  /** Solicita (si corresponde) el permiso de ubicación. */
  async asegurarUbicacion(): Promise<EstadoPermiso> {
    try {
      const actual = await Geolocation.checkPermissions();
      const estado = this.normalizar(actual.location);
      if (estado !== 'pendiente') {
        return estado;
      }

      const solicitado = await Geolocation.requestPermissions({ permissions: ['location'] });
      return this.normalizar(solicitado.location, true);
    } catch {
      return 'no-aplica';
    }
  }

  /**
   * Solicita el permiso de sensores de movimiento. Sólo iOS 13+ exige una
   * autorización explícita (`DeviceMotionEvent.requestPermission`); en Android y
   * en el navegador basta con que el sensor exista.
   */
  async asegurarMovimiento(): Promise<EstadoPermiso> {
    const api = this.apiMovimiento();
    if (!api) {
      return 'no-aplica';
    }

    if (typeof api.requestPermission !== 'function') {
      return 'no-aplica';
    }

    try {
      const respuesta = await api.requestPermission();
      return respuesta === 'granted' ? 'concedido' : 'denegado';
    } catch {
      return 'denegado';
    }
  }

  /**
   * Devuelve el estado de los tres permisos SIN abrir ningún diálogo.
   * Lo usa la pantalla de diagnóstico para mostrar un panel de estado.
   */
  async estadoActual(): Promise<RegistroPermisos> {
    const [camara, ubicacion] = await Promise.all([
      this.consultar(() => Camera.checkPermissions().then((r) => r.camera)),
      this.consultar(() => Geolocation.checkPermissions().then((r) => r.location)),
    ]);

    const api = this.apiMovimiento();
    const movimiento: EstadoPermiso = !api
      ? 'no-aplica'
      : typeof api.requestPermission === 'function'
        ? 'pendiente'
        : 'no-aplica';

    return { camara, ubicacion, movimiento };
  }

  /** Texto de ayuda que se muestra cuando el usuario rechaza un permiso. */
  mensajeDeRechazo(clave: ClavePermiso, estado: EstadoPermiso): string {
    const periferico =
      clave === 'camara' ? 'la cámara' : clave === 'ubicacion' ? 'la ubicación' : 'los sensores';

    if (estado === 'bloqueado') {
      return `El acceso a ${periferico} está bloqueado. Habilítalo en los ajustes del sistema para esta aplicación.`;
    }

    return `Sin permiso de ${periferico} no es posible completar la acción. Puedes continuar usando el resto de la aplicación.`;
  }

  private async consultar(lectura: () => Promise<EstadoNativo>): Promise<EstadoPermiso> {
    try {
      return this.normalizar(await lectura());
    } catch {
      return 'no-aplica';
    }
  }

  /**
   * Traduce el estado de Capacitor al vocabulario de la aplicación.
   * `yaSolicitado` distingue el rechazo puntual del rechazo permanente.
   */
  private normalizar(estado: EstadoNativo, yaSolicitado = false): EstadoPermiso {
    switch (estado) {
      case 'granted':
        return 'concedido';
      case 'denied':
        return yaSolicitado ? 'denegado' : 'bloqueado';
      case 'prompt':
      case 'prompt-with-rationale':
        return 'pendiente';
      default:
        // 'limited' (iOS) permite usar el periférico con restricciones.
        return 'concedido';
    }
  }

  private apiMovimiento(): (typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> }) | null {
    if (Capacitor.getPlatform() === 'android') {
      return null;
    }
    if (typeof DeviceMotionEvent === 'undefined') {
      return null;
    }
    return DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
  }
}

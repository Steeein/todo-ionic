import { Injectable, NgZone, inject } from '@angular/core';
import { PluginListenerHandle } from '@capacitor/core';
import { Motion } from '@capacitor/motion';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { LecturaSensor, ResultadoPeriferico, exito, fallo } from '../models/periferico.model';
import { PermisosService } from './permisos.service';

/**
 * Acceso al acelerómetro del dispositivo (API interna, plugin @capacitor/motion).
 *
 * Patrón aplicado: "Observer". El servicio publica las lecturas en un
 * `Observable` al que se suscriben las páginas, sin que éstas conozcan el
 * plugin ni tengan que administrar listeners nativos.
 *
 * Rendimiento: el acelerómetro emite decenas de eventos por segundo. Aquí se
 * aplica un muestreo (`INTERVALO_MUESTREO_MS`) para refrescar la interfaz unas
 * pocas veces por segundo, y el listener se libera automáticamente al detener
 * la escucha, evitando fugas de memoria y consumo de batería innecesario.
 */
@Injectable({ providedIn: 'root' })
export class SensorService {
  /** Un refresco cada 150 ms (~7 por segundo) es suficiente para la vista. */
  private static readonly INTERVALO_MUESTREO_MS = 150;
  /** Magnitud (m/s²) a partir de la cual se considera que el equipo fue agitado. */
  static readonly UMBRAL_AGITACION = 25;

  private readonly _lectura = new BehaviorSubject<LecturaSensor | null>(null);
  private readonly _agitacion = new Subject<LecturaSensor>();
  private readonly _activo = new BehaviorSubject<boolean>(false);

  private suscripcion: PluginListenerHandle | null = null;
  private ultimaEmision = 0;

  /** Última lectura del acelerómetro (o `null` si aún no hay datos). */
  readonly lectura$: Observable<LecturaSensor | null> = this._lectura.asObservable();
  /** Emite cada vez que se detecta una agitación del dispositivo. */
  readonly agitacion$: Observable<LecturaSensor> = this._agitacion.asObservable();
  /** Indica si la escucha del sensor está activa. */
  readonly activo$: Observable<boolean> = this._activo.asObservable();

  private readonly permisos = inject(PermisosService);
  private readonly zona = inject(NgZone);

  get activo(): boolean {
    return this._activo.value;
  }

  /** `true` si el entorno expone eventos de movimiento. */
  disponible(): boolean {
    return typeof DeviceMotionEvent !== 'undefined';
  }

  /** Comienza a escuchar el acelerómetro. Nunca lanza excepciones. */
  async iniciar(): Promise<ResultadoPeriferico<true>> {
    const inicio = Date.now();

    if (this.suscripcion) {
      return exito(true, Date.now() - inicio);
    }

    if (!this.disponible()) {
      return fallo(
        'no-disponible',
        'Este dispositivo (o este navegador) no expone el acelerómetro.',
        Date.now() - inicio,
      );
    }

    const permiso = await this.permisos.asegurarMovimiento();
    if (permiso === 'denegado' || permiso === 'bloqueado') {
      return fallo(
        permiso === 'bloqueado' ? 'permiso-bloqueado' : 'permiso-denegado',
        this.permisos.mensajeDeRechazo('movimiento', permiso),
        Date.now() - inicio,
      );
    }

    try {
      this.suscripcion = await Motion.addListener('accel', (evento) => this.procesar(evento));
      this._activo.next(true);
      return exito(true, Date.now() - inicio);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error ?? '');
      return fallo('error', `No se pudo iniciar el sensor: ${mensaje || 'error desconocido'}.`, Date.now() - inicio);
    }
  }

  /** Detiene la escucha y libera el listener nativo. */
  async detener(): Promise<void> {
    const suscripcion = this.suscripcion;
    this.suscripcion = null;
    this._activo.next(false);
    this.ultimaEmision = 0;

    if (suscripcion) {
      try {
        await suscripcion.remove();
      } catch {
        // El listener ya no existía.
      }
    }
  }

  /** Convierte el evento nativo en una lectura validada y la publica. */
  private procesar(evento: unknown): void {
    const ahora = Date.now();
    if (ahora - this.ultimaEmision < SensorService.INTERVALO_MUESTREO_MS) {
      return; // Muestreo: se descarta el exceso de eventos.
    }

    const fuente =
      (evento as { accelerationIncludingGravity?: { x: number; y: number; z: number } })
        ?.accelerationIncludingGravity ??
      (evento as { acceleration?: { x: number; y: number; z: number } })?.acceleration;

    if (!fuente) {
      return;
    }

    const x = Number(fuente.x);
    const y = Number(fuente.y);
    const z = Number(fuente.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return; // Lectura inválida: se descarta en vez de mostrar datos erróneos.
    }

    this.ultimaEmision = ahora;
    const lectura: LecturaSensor = {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      z: Number(z.toFixed(2)),
      magnitud: Number(Math.sqrt(x * x + y * y + z * z).toFixed(2)),
      medidaEn: new Date(ahora).toISOString(),
    };

    // El listener nativo corre fuera de Angular: se vuelve a entrar en la zona
    // para que la vista se actualice.
    this.zona.run(() => {
      this._lectura.next(lectura);
      if (lectura.magnitud >= SensorService.UMBRAL_AGITACION) {
        this._agitacion.next(lectura);
      }
    });
  }
}

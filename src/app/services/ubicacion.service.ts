import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';

import { ResultadoPeriferico, UbicacionTarea, exito, fallo } from '../models/periferico.model';
import { PermisosService } from './permisos.service';

/**
 * Acceso al GPS del dispositivo (API interna, plugin @capacitor/geolocation).
 *
 * Fiabilidad de los datos: toda posición entregada por el sistema se valida
 * antes de usarse (rangos de latitud/longitud, números finitos y precisión
 * razonable). Una lectura incoherente se trata como fallo y no se guarda en la
 * tarea, de modo que la aplicación nunca almacena coordenadas inválidas.
 *
 * Rendimiento: se acepta una lectura cacheada de hasta 30 segundos
 * (`maximumAge`) para no encender el GPS en cada pulsación, y se limita la
 * espera con un `timeout` explícito para que la interfaz no quede bloqueada.
 */
@Injectable({ providedIn: 'root' })
export class UbicacionService {
  private static readonly TIEMPO_MAXIMO_MS = 10_000;
  private static readonly ANTIGUEDAD_ACEPTADA_MS = 30_000;
  /** Precisión peor que este valor se considera poco confiable. */
  static readonly PRECISION_MINIMA_METROS = 2_000;

  private readonly permisos = inject(PermisosService);

  /** `true` si la plataforma expone un proveedor de ubicación. */
  disponible(): boolean {
    if (Capacitor.isNativePlatform()) {
      return Capacitor.isPluginAvailable('Geolocation');
    }
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  /** Obtiene la posición actual, ya validada. Nunca lanza excepciones. */
  async obtenerActual(): Promise<ResultadoPeriferico<UbicacionTarea>> {
    const inicio = Date.now();

    const permiso = await this.permisos.asegurarUbicacion();
    if (permiso === 'denegado' || permiso === 'bloqueado') {
      return fallo(
        permiso === 'bloqueado' ? 'permiso-bloqueado' : 'permiso-denegado',
        this.permisos.mensajeDeRechazo('ubicacion', permiso),
        Date.now() - inicio,
      );
    }

    if (!this.disponible()) {
      return fallo(
        'no-disponible',
        'Este dispositivo no entrega información de ubicación.',
        Date.now() - inicio,
      );
    }

    try {
      const posicion = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: UbicacionService.TIEMPO_MAXIMO_MS,
        maximumAge: UbicacionService.ANTIGUEDAD_ACEPTADA_MS,
      });

      const ubicacion = this.validar(posicion);
      if (!ubicacion) {
        return fallo(
          'datos-invalidos',
          'El GPS entregó coordenadas fuera de rango o con precisión insuficiente.',
          Date.now() - inicio,
        );
      }

      return exito(ubicacion, Date.now() - inicio);
    } catch (error) {
      return this.traducirError(error, Date.now() - inicio);
    }
  }

  /** Convierte una posición del sistema en `UbicacionTarea`, o `null` si no es confiable. */
  private validar(posicion: Position | null | undefined): UbicacionTarea | null {
    const coords = posicion?.coords;
    if (!coords) {
      return null;
    }

    const { latitude, longitude, accuracy } = coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return null;
    }

    const precision = Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : Number.NaN;
    if (!Number.isFinite(precision) || precision > UbicacionService.PRECISION_MINIMA_METROS) {
      return null;
    }

    return {
      latitud: Number(latitude.toFixed(6)),
      longitud: Number(longitude.toFixed(6)),
      precisionMetros: Math.round(precision),
      obtenidaEn: new Date(posicion?.timestamp ?? Date.now()).toISOString(),
    };
  }

  private traducirError(error: unknown, duracionMs: number): ResultadoPeriferico<UbicacionTarea> {
    const codigo = (error as { code?: number } | null)?.code;
    const mensaje = error instanceof Error ? error.message : String(error ?? '');

    // Códigos del estándar W3C Geolocation, respetados también por Capacitor.
    if (codigo === 1 || /denied|permission/i.test(mensaje)) {
      return fallo(
        'permiso-denegado',
        this.permisos.mensajeDeRechazo('ubicacion', 'denegado'),
        duracionMs,
      );
    }
    if (codigo === 2 || /unavailable/i.test(mensaje)) {
      return fallo(
        'no-disponible',
        'No hay señal de GPS en este momento. Inténtalo al aire libre.',
        duracionMs,
      );
    }
    if (codigo === 3 || /timeout|time out/i.test(mensaje)) {
      return fallo(
        'tiempo-agotado',
        'El GPS tardó demasiado en responder. Vuelve a intentarlo.',
        duracionMs,
      );
    }

    return fallo('error', `No se pudo obtener la ubicación: ${mensaje || 'error desconocido'}.`, duracionMs);
  }
}

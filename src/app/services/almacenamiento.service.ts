import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { Tarea } from '../models/tarea.model';

/**
 * Persistencia local de las tareas usando el almacenamiento nativo del
 * dispositivo (plugin @capacitor/preferences: SharedPreferences en Android,
 * UserDefaults en iOS y localStorage en navegador).
 *
 * Patrón aplicado: "Repository". El resto de la aplicación no sabe dónde ni
 * cómo se guardan las tareas; sólo pide "cargar" y "guardar". Eso permite
 * cambiar el motor de almacenamiento sin tocar las páginas y sustituirlo por
 * un doble de prueba en los tests.
 *
 * Toda lectura pasa por `normalizar()`, que descarta registros corruptos y
 * completa los campos nuevos de la Unidad 2 en tareas guardadas por la versión
 * anterior de la aplicación (migración tolerante).
 */
@Injectable({ providedIn: 'root' })
export class AlmacenamientoService {
  private static readonly CLAVE = 'tareas';

  async cargar(): Promise<Tarea[]> {
    try {
      const { value } = await Preferences.get({ key: AlmacenamientoService.CLAVE });
      if (!value) {
        return [];
      }

      const crudo: unknown = JSON.parse(value);
      if (!Array.isArray(crudo)) {
        return [];
      }

      return crudo
        .map((registro) => this.normalizar(registro))
        .filter((tarea): tarea is Tarea => tarea !== null);
    } catch {
      // Datos corruptos o almacenamiento no disponible: la app arranca vacía
      // en vez de fallar.
      return [];
    }
  }

  async guardar(tareas: Tarea[]): Promise<void> {
    try {
      await Preferences.set({
        key: AlmacenamientoService.CLAVE,
        value: JSON.stringify(tareas),
      });
    } catch {
      // Sin almacenamiento, la sesión en curso sigue funcionando en memoria.
    }
  }

  async limpiar(): Promise<void> {
    try {
      await Preferences.remove({ key: AlmacenamientoService.CLAVE });
    } catch {
      // Nada que limpiar.
    }
  }

  private normalizar(registro: unknown): Tarea | null {
    if (!registro || typeof registro !== 'object') {
      return null;
    }

    const datos = registro as Record<string, unknown>;
    const titulo = typeof datos['titulo'] === 'string' ? datos['titulo'].trim() : '';
    if (!titulo) {
      return null;
    }

    return {
      id: datos['id'] != null ? String(datos['id']) : `${Date.now()}-${Math.random()}`,
      titulo,
      descripcion: typeof datos['descripcion'] === 'string' ? datos['descripcion'] : '',
      completada: datos['completada'] === true,
      creadaEn: typeof datos['creadaEn'] === 'string' ? datos['creadaEn'] : new Date().toISOString(),
      foto: this.normalizarFoto(datos['foto']),
      ubicacion: this.normalizarUbicacion(datos['ubicacion']),
    };
  }

  private normalizarFoto(valor: unknown): Tarea['foto'] {
    if (!valor || typeof valor !== 'object') {
      return null;
    }
    const foto = valor as Record<string, unknown>;
    if (typeof foto['src'] !== 'string' || !foto['src']) {
      return null;
    }
    return {
      src: foto['src'],
      uri: typeof foto['uri'] === 'string' ? foto['uri'] : undefined,
      formato: typeof foto['formato'] === 'string' ? foto['formato'] : 'jpeg',
      capturadaEn:
        typeof foto['capturadaEn'] === 'string' ? foto['capturadaEn'] : new Date().toISOString(),
    };
  }

  private normalizarUbicacion(valor: unknown): Tarea['ubicacion'] {
    if (!valor || typeof valor !== 'object') {
      return null;
    }
    const ubicacion = valor as Record<string, unknown>;
    const latitud = Number(ubicacion['latitud']);
    const longitud = Number(ubicacion['longitud']);
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
      return null;
    }
    const precision = Number(ubicacion['precisionMetros']);
    return {
      latitud,
      longitud,
      precisionMetros: Number.isFinite(precision) ? precision : 0,
      obtenidaEn:
        typeof ubicacion['obtenidaEn'] === 'string'
          ? ubicacion['obtenidaEn']
          : new Date().toISOString(),
    };
  }
}

import { Injectable, inject } from '@angular/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

import { FotoTarea, ResultadoPeriferico, exito, fallo } from '../models/periferico.model';
import { PermisosService } from './permisos.service';

export type OrigenFoto = 'camara' | 'galeria';

/**
 * Acceso a la cámara del dispositivo (API interna, plugin @capacitor/camera).
 *
 * Patrón aplicado: "Adapter". El plugin nativo queda encapsulado detrás de una
 * interfaz propia de la aplicación (`FotoTarea` + `ResultadoPeriferico`), de
 * modo que las páginas no dependen del SDK y los tests pueden sustituir el
 * plugin por un doble de prueba.
 *
 * Optimización de rendimiento: la imagen se pide ya redimensionada y
 * comprimida por el propio plugin (`width`, `quality`), lo que evita cargar en
 * memoria fotografías de varios megabytes. En plataformas nativas la imagen se
 * guarda además como archivo en el almacenamiento de la app y en la tarea sólo
 * se conserva la ruta, en lugar del base64 completo.
 */
@Injectable({ providedIn: 'root' })
export class CamaraService {
  /** Ancho máximo en píxeles al que el plugin redimensiona la captura. */
  private static readonly ANCHO_MAXIMO = 800;
  /** Calidad de compresión JPEG (0-100). */
  private static readonly CALIDAD = 70;

  private readonly permisos = inject(PermisosService);

  /** `true` si la plataforma actual expone una cámara utilizable. */
  disponible(): boolean {
    if (Capacitor.isNativePlatform()) {
      return Capacitor.isPluginAvailable('Camera');
    }
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices;
  }

  /**
   * Captura una foto con la cámara o la selecciona desde la galería.
   * Nunca lanza excepciones: siempre devuelve un `ResultadoPeriferico`.
   */
  async capturar(origen: OrigenFoto = 'camara'): Promise<ResultadoPeriferico<FotoTarea>> {
    const inicio = Date.now();

    const permiso = await this.permisos.asegurarCamara();
    if (permiso === 'denegado' || permiso === 'bloqueado') {
      return fallo(
        permiso === 'bloqueado' ? 'permiso-bloqueado' : 'permiso-denegado',
        this.permisos.mensajeDeRechazo('camara', permiso),
        Date.now() - inicio,
      );
    }

    if (!this.disponible()) {
      return fallo(
        'no-disponible',
        'Este dispositivo no tiene una cámara disponible para la aplicación.',
        Date.now() - inicio,
      );
    }

    try {
      const foto = await Camera.getPhoto({
        quality: CamaraService.CALIDAD,
        width: CamaraService.ANCHO_MAXIMO,
        allowEditing: false,
        correctOrientation: true,
        resultType: CameraResultType.DataUrl,
        source: origen === 'camara' ? CameraSource.Camera : CameraSource.Photos,
      });

      if (!foto?.dataUrl) {
        return fallo(
          'datos-invalidos',
          'La cámara no devolvió una imagen válida. Inténtalo nuevamente.',
          Date.now() - inicio,
        );
      }

      return exito(await this.persistir(foto), Date.now() - inicio);
    } catch (error) {
      return this.traducirError(error, Date.now() - inicio);
    }
  }

  /**
   * En plataformas nativas escribe la imagen en el directorio privado de la
   * aplicación y devuelve su ruta; en navegador conserva el data URL.
   */
  private async persistir(foto: Photo): Promise<FotoTarea> {
    const formato = foto.format || 'jpeg';
    const capturadaEn = new Date().toISOString();
    const dataUrl = foto.dataUrl as string;

    if (!Capacitor.isNativePlatform()) {
      return { src: dataUrl, formato, capturadaEn };
    }

    try {
      const nombre = `tarea-${Date.now()}.${formato}`;
      const guardado = await Filesystem.writeFile({
        path: nombre,
        data: dataUrl.split(',')[1] ?? dataUrl,
        directory: Directory.Data,
      });

      return {
        src: Capacitor.convertFileSrc(guardado.uri),
        uri: guardado.uri,
        formato,
        capturadaEn,
      };
    } catch {
      // Si el sistema de archivos falla, la foto no se pierde: se conserva en
      // memoria como data URL.
      return { src: dataUrl, formato, capturadaEn };
    }
  }

  /** Borra del dispositivo el archivo asociado a una foto, si existe. */
  async eliminar(foto: FotoTarea | null): Promise<void> {
    if (!foto?.uri || !Capacitor.isNativePlatform()) {
      return;
    }
    try {
      await Filesystem.deleteFile({ path: foto.uri });
    } catch {
      // Un archivo inexistente no es un error para el usuario.
    }
  }

  private traducirError(error: unknown, duracionMs: number): ResultadoPeriferico<FotoTarea> {
    const mensaje = error instanceof Error ? error.message : String(error ?? '');
    const normalizado = mensaje.toLowerCase();

    if (normalizado.includes('cancel')) {
      return fallo('cancelado', 'Captura cancelada por el usuario.', duracionMs);
    }
    if (normalizado.includes('denied') || normalizado.includes('permission')) {
      return fallo(
        'permiso-denegado',
        this.permisos.mensajeDeRechazo('camara', 'denegado'),
        duracionMs,
      );
    }
    if (normalizado.includes('not available') || normalizado.includes('unavailable')) {
      return fallo('no-disponible', 'La cámara no está disponible en este dispositivo.', duracionMs);
    }

    return fallo('error', `No se pudo capturar la imagen: ${mensaje || 'error desconocido'}.`, duracionMs);
  }
}

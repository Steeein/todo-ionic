import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { DatosTarea, Tarea } from '../models/tarea.model';
import { AlmacenamientoService } from './almacenamiento.service';
import { CamaraService } from './camara.service';

/**
 * Estado y operaciones CRUD de la lista de tareas.
 *
 * Patrones aplicados:
 *  - "Observer": la lista se publica en `tareas$`, de modo que cualquier página
 *    suscrita se actualiza sola.
 *  - "Repository": la persistencia se delega por completo en
 *    `AlmacenamientoService`, que guarda en el almacenamiento del dispositivo
 *    tras cada cambio (la lista sobrevive al cierre de la app y funciona sin
 *    conexión a internet).
 */
@Injectable({ providedIn: 'root' })
export class TareaService {
  private readonly _tareas = new BehaviorSubject<Tarea[]>([]);
  private inicializado = false;

  readonly tareas$: Observable<Tarea[]> = this._tareas.asObservable();

  private readonly almacenamiento = inject(AlmacenamientoService);
  private readonly camara = inject(CamaraService);

  /** Carga las tareas guardadas. Es idempotente: sólo lee una vez. */
  async inicializar(): Promise<void> {
    if (this.inicializado) {
      return;
    }
    this.inicializado = true;
    this._tareas.next(await this.almacenamiento.cargar());
  }

  listar(): Tarea[] {
    return this._tareas.value;
  }

  buscar(id: string): Tarea | undefined {
    return this._tareas.value.find((tarea) => tarea.id === id);
  }

  async agregar(datos: DatosTarea): Promise<Tarea> {
    const tarea: Tarea = {
      id: this.nuevoId(),
      titulo: datos.titulo.trim(),
      descripcion: datos.descripcion.trim(),
      completada: false,
      creadaEn: new Date().toISOString(),
      foto: datos.foto,
      ubicacion: datos.ubicacion,
    };

    await this.publicar([...this._tareas.value, tarea]);
    return tarea;
  }

  async actualizar(id: string, datos: DatosTarea): Promise<void> {
    const anterior = this.buscar(id);
    if (!anterior) {
      return;
    }

    // Si la foto fue reemplazada, se borra el archivo antiguo del dispositivo.
    if (anterior.foto && anterior.foto.uri !== datos.foto?.uri) {
      await this.camara.eliminar(anterior.foto);
    }

    await this.publicar(
      this._tareas.value.map((tarea) =>
        tarea.id === id
          ? {
              ...tarea,
              titulo: datos.titulo.trim(),
              descripcion: datos.descripcion.trim(),
              foto: datos.foto,
              ubicacion: datos.ubicacion,
            }
          : tarea,
      ),
    );
  }

  async alternarCompletada(id: string): Promise<void> {
    await this.publicar(
      this._tareas.value.map((tarea) =>
        tarea.id === id ? { ...tarea, completada: !tarea.completada } : tarea,
      ),
    );
  }

  async eliminar(id: string): Promise<void> {
    const tarea = this.buscar(id);
    if (!tarea) {
      return;
    }

    await this.camara.eliminar(tarea.foto);
    await this.publicar(this._tareas.value.filter((item) => item.id !== id));
  }

  private async publicar(tareas: Tarea[]): Promise<void> {
    this._tareas.next(tareas);
    await this.almacenamiento.guardar(tareas);
  }

  private nuevoId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}

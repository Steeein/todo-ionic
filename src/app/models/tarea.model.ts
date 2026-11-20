import { FotoTarea, UbicacionTarea } from './periferico.model';

/**
 * Tarea de la lista. Respecto de la Unidad 1 se agregan los datos capturados
 * desde los periféricos del dispositivo (foto y ubicación) además del estado de
 * cumplimiento y la fecha de creación, necesarios para persistir la lista.
 */
export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string;
  completada: boolean;
  creadaEn: string;
  foto: FotoTarea | null;
  ubicacion: UbicacionTarea | null;
}

/** Datos que entrega el formulario para crear o editar una tarea. */
export interface DatosTarea {
  titulo: string;
  descripcion: string;
  foto: FotoTarea | null;
  ubicacion: UbicacionTarea | null;
}

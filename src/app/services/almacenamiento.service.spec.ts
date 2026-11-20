import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Tarea } from '../models/tarea.model';
import { AlmacenamientoService } from './almacenamiento.service';

/**
 * Pruebas del almacenamiento local (API interna del dispositivo).
 *
 * @capacitor/preferences se reemplaza por un almacén en memoria para comprobar
 * que las tareas se guardan y recuperan íntegras, que los datos corruptos no
 * rompen la aplicación y que las tareas creadas con la versión de la Unidad 1
 * se migran sin perder información.
 */
const dobles = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: dobles.get, set: dobles.set, remove: dobles.remove },
}));

const TAREA: Tarea = {
  id: 'abc',
  titulo: 'Estudiar periféricos',
  descripcion: 'Repasar cámara y GPS',
  completada: false,
  creadaEn: '2026-11-20T12:00:00.000Z',
  foto: { src: 'data:image/jpeg;base64,xx', formato: 'jpeg', capturadaEn: '2026-11-20T12:00:00.000Z' },
  ubicacion: {
    latitud: -33.44,
    longitud: -70.67,
    precisionMetros: 10,
    obtenidaEn: '2026-11-20T12:00:00.000Z',
  },
};

describe('AlmacenamientoService (persistencia local)', () => {
  let servicio: AlmacenamientoService;

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.set.mockResolvedValue(undefined);
    dobles.remove.mockResolvedValue(undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(AlmacenamientoService);
  });

  it('guarda la lista serializada bajo la clave "tareas"', async () => {
    await servicio.guardar([TAREA]);

    expect(dobles.set).toHaveBeenCalledWith({
      key: 'tareas',
      value: JSON.stringify([TAREA]),
    });
  });

  it('recupera las tareas guardadas con todos sus datos de periféricos', async () => {
    dobles.get.mockResolvedValue({ value: JSON.stringify([TAREA]) });

    const tareas = await servicio.cargar();

    expect(tareas).toHaveLength(1);
    expect(tareas[0].foto?.src).toBe(TAREA.foto?.src);
    expect(tareas[0].ubicacion?.latitud).toBe(-33.44);
  });

  it('devuelve una lista vacía la primera vez que se abre la aplicación', async () => {
    dobles.get.mockResolvedValue({ value: null });

    expect(await servicio.cargar()).toEqual([]);
  });

  it('no se cae si el contenido guardado está corrupto', async () => {
    dobles.get.mockResolvedValue({ value: '{esto no es json' });

    expect(await servicio.cargar()).toEqual([]);
  });

  it('descarta registros sin título en lugar de mostrar tareas vacías', async () => {
    dobles.get.mockResolvedValue({ value: JSON.stringify([{ id: 1 }, TAREA]) });

    const tareas = await servicio.cargar();

    expect(tareas).toHaveLength(1);
    expect(tareas[0].titulo).toBe(TAREA.titulo);
  });

  it('migra las tareas de la Unidad 1 completando los campos nuevos', async () => {
    dobles.get.mockResolvedValue({
      value: JSON.stringify([{ id: 1, titulo: 'Tarea antigua', descripcion: 'Sin periféricos' }]),
    });

    const [tarea] = await servicio.cargar();

    expect(tarea.id).toBe('1');
    expect(tarea.completada).toBe(false);
    expect(tarea.foto).toBeNull();
    expect(tarea.ubicacion).toBeNull();
    expect(tarea.creadaEn).toBeTruthy();
  });

  it('ignora ubicaciones con coordenadas inválidas', async () => {
    dobles.get.mockResolvedValue({
      value: JSON.stringify([{ ...TAREA, ubicacion: { latitud: 'x', longitud: null } }]),
    });

    const [tarea] = await servicio.cargar();

    expect(tarea.ubicacion).toBeNull();
  });

  it('mantiene la aplicación en funcionamiento si el almacenamiento falla', async () => {
    dobles.set.mockRejectedValue(new Error('storage lleno'));

    await expect(servicio.guardar([TAREA])).resolves.toBeUndefined();
  });

  it('permite limpiar los datos guardados', async () => {
    await servicio.limpiar();

    expect(dobles.remove).toHaveBeenCalledWith({ key: 'tareas' });
  });
});

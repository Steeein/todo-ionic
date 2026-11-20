import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { DatosTarea, Tarea } from '../models/tarea.model';
import { AlmacenamientoService } from './almacenamiento.service';
import { CamaraService } from './camara.service';
import { TareaService } from './tarea.service';

/**
 * Pruebas del CRUD de tareas y de su persistencia.
 *
 * `AlmacenamientoService` y `CamaraService` se sustituyen por dobles, de modo
 * que estas pruebas verifican únicamente la lógica del servicio: alta, edición,
 * borrado, estado de completada, publicación por el observable y guardado tras
 * cada cambio.
 */
const almacen = {
  cargar: vi.fn<() => Promise<Tarea[]>>(),
  guardar: vi.fn<(tareas: Tarea[]) => Promise<void>>(),
  limpiar: vi.fn(),
};

const camara = {
  eliminar: vi.fn(),
};

function datos(titulo = 'Nueva tarea'): DatosTarea {
  return { titulo, descripcion: '  con espacios  ', foto: null, ubicacion: null };
}

describe('TareaService (CRUD + persistencia)', () => {
  let servicio: TareaService;

  beforeEach(() => {
    vi.clearAllMocks();
    almacen.cargar.mockResolvedValue([]);
    almacen.guardar.mockResolvedValue(undefined);
    camara.eliminar.mockResolvedValue(undefined);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AlmacenamientoService, useValue: almacen },
        { provide: CamaraService, useValue: camara },
      ],
    });
    servicio = TestBed.inject(TareaService);
  });

  it('carga las tareas guardadas al inicializar', async () => {
    almacen.cargar.mockResolvedValue([
      {
        id: '1',
        titulo: 'Guardada',
        descripcion: '',
        completada: false,
        creadaEn: '2026-11-20T12:00:00.000Z',
        foto: null,
        ubicacion: null,
      },
    ]);

    await servicio.inicializar();

    expect(servicio.listar()).toHaveLength(1);
  });

  it('no vuelve a leer el almacenamiento si ya fue inicializado', async () => {
    await servicio.inicializar();
    await servicio.inicializar();

    expect(almacen.cargar).toHaveBeenCalledTimes(1);
  });

  it('agrega una tarea, recorta los textos y la guarda en el dispositivo', async () => {
    const tarea = await servicio.agregar(datos('  Comprar pan  '));

    expect(tarea.titulo).toBe('Comprar pan');
    expect(tarea.descripcion).toBe('con espacios');
    expect(tarea.completada).toBe(false);
    expect(almacen.guardar).toHaveBeenCalledTimes(1);
  });

  it('publica la lista actualizada en el observable', async () => {
    const emisiones: Tarea[][] = [];
    servicio.tareas$.subscribe((tareas) => emisiones.push(tareas));

    await servicio.agregar(datos());

    expect(emisiones.at(-1)).toHaveLength(1);
  });

  it('asigna identificadores únicos', async () => {
    const a = await servicio.agregar(datos('A'));
    const b = await servicio.agregar(datos('B'));

    expect(a.id).not.toBe(b.id);
  });

  it('actualiza una tarea existente conservando su id', async () => {
    const tarea = await servicio.agregar(datos('Original'));

    await servicio.actualizar(tarea.id, { ...datos('Editada'), descripcion: 'nueva' });

    expect(servicio.buscar(tarea.id)?.titulo).toBe('Editada');
    expect(servicio.listar()).toHaveLength(1);
  });

  it('borra del dispositivo la foto reemplazada al editar', async () => {
    const foto = { src: 'file://a.jpeg', uri: '/a.jpeg', formato: 'jpeg', capturadaEn: 'x' };
    const tarea = await servicio.agregar({ ...datos(), foto });

    await servicio.actualizar(tarea.id, { ...datos(), foto: null });

    expect(camara.eliminar).toHaveBeenCalledWith(foto);
  });

  it('alterna el estado de completada', async () => {
    const tarea = await servicio.agregar(datos());

    await servicio.alternarCompletada(tarea.id);
    expect(servicio.buscar(tarea.id)?.completada).toBe(true);

    await servicio.alternarCompletada(tarea.id);
    expect(servicio.buscar(tarea.id)?.completada).toBe(false);
  });

  it('elimina la tarea junto con su foto', async () => {
    const foto = { src: 'file://a.jpeg', uri: '/a.jpeg', formato: 'jpeg', capturadaEn: 'x' };
    const tarea = await servicio.agregar({ ...datos(), foto });

    await servicio.eliminar(tarea.id);

    expect(servicio.listar()).toHaveLength(0);
    expect(camara.eliminar).toHaveBeenCalledWith(foto);
  });

  it('ignora operaciones sobre identificadores inexistentes', async () => {
    await servicio.actualizar('no-existe', datos());
    await servicio.eliminar('no-existe');

    expect(servicio.listar()).toEqual([]);
  });

  it('guarda en el almacenamiento después de cada cambio', async () => {
    const tarea = await servicio.agregar(datos());
    await servicio.alternarCompletada(tarea.id);
    await servicio.eliminar(tarea.id);

    expect(almacen.guardar).toHaveBeenCalledTimes(3);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { FotoTarea, UbicacionTarea, exito, fallo } from '../models/periferico.model';
import { Tarea } from '../models/tarea.model';
import { CamaraService } from '../services/camara.service';
import { TareaService } from '../services/tarea.service';
import { UbicacionService } from '../services/ubicacion.service';
import { HomePageModule } from './home.module';
import { HomePage } from './home.page';

/**
 * Pruebas de integración de la página de tareas con los periféricos.
 *
 * Los servicios de cámara y GPS se sustituyen por dobles para comprobar que la
 * página adjunta correctamente los datos capturados y que informa al usuario
 * cuando un permiso es rechazado, sin dejar la interfaz bloqueada.
 */
const FOTO: FotoTarea = {
  src: 'data:image/jpeg;base64,xx',
  formato: 'jpeg',
  capturadaEn: '2026-11-20T12:00:00.000Z',
};

const UBICACION: UbicacionTarea = {
  latitud: -33.44,
  longitud: -70.67,
  precisionMetros: 8,
  obtenidaEn: '2026-11-20T12:00:00.000Z',
};

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  const tareas$ = new BehaviorSubject<Tarea[]>([]);
  const tareaService = {
    tareas$,
    inicializar: vi.fn().mockResolvedValue(undefined),
    agregar: vi.fn().mockResolvedValue(undefined),
    actualizar: vi.fn().mockResolvedValue(undefined),
    eliminar: vi.fn().mockResolvedValue(undefined),
    alternarCompletada: vi.fn().mockResolvedValue(undefined),
  };
  const camara = { capturar: vi.fn(), eliminar: vi.fn() };
  const ubicacion = { obtenerActual: vi.fn() };
  const presentar = vi.fn().mockResolvedValue(undefined);
  const controlador = { create: vi.fn().mockResolvedValue({ present: presentar }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    tareas$.next([]);
    controlador.create.mockResolvedValue({ present: presentar });

    await TestBed.configureTestingModule({
      imports: [HomePageModule, RouterModule.forRoot([])],
      providers: [
        { provide: TareaService, useValue: tareaService },
        { provide: CamaraService, useValue: camara },
        { provide: UbicacionService, useValue: ubicacion },
        { provide: ToastController, useValue: controlador },
        { provide: AlertController, useValue: controlador },
        { provide: ActionSheetController, useValue: controlador },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra las tareas publicadas por el servicio', () => {
    tareas$.next([
      {
        id: '1',
        titulo: 'Tarea',
        descripcion: 'desc',
        completada: false,
        creadaEn: '2026-11-20T12:00:00.000Z',
        foto: null,
        ubicacion: null,
      },
    ]);

    expect(component.tareas).toHaveLength(1);
    expect(component.pendientes).toBe(1);
  });

  it('adjunta al formulario la foto capturada con la cámara', async () => {
    camara.capturar.mockResolvedValue(exito(FOTO, 120));

    await component.capturarFoto('camara');

    expect(component.foto).toEqual(FOTO);
    expect(component.capturandoFoto).toBe(false);
  });

  it('avisa y no adjunta nada si se rechaza el permiso de cámara', async () => {
    camara.capturar.mockResolvedValue(fallo('permiso-denegado', 'Sin permiso de la cámara', 30));

    await component.capturarFoto('camara');

    expect(component.foto).toBeNull();
    expect(controlador.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Sin permiso de la cámara' }),
    );
  });

  it('no molesta al usuario cuando éste cancela la captura', async () => {
    camara.capturar.mockResolvedValue(fallo('cancelado', 'Captura cancelada', 10));

    await component.capturarFoto('camara');

    expect(controlador.create).not.toHaveBeenCalled();
  });

  it('adjunta la ubicación obtenida del GPS', async () => {
    ubicacion.obtenerActual.mockResolvedValue(exito(UBICACION, 450));

    await component.capturarUbicacion();

    expect(component.ubicacion).toEqual(UBICACION);
    expect(component.buscandoUbicacion).toBe(false);
  });

  it('libera el indicador de carga aunque el GPS falle', async () => {
    ubicacion.obtenerActual.mockResolvedValue(fallo('tiempo-agotado', 'El GPS tardó demasiado', 10_000));

    await component.capturarUbicacion();

    expect(component.ubicacion).toBeNull();
    expect(component.buscandoUbicacion).toBe(false);
  });

  it('guarda la tarea con la foto y la ubicación capturadas', async () => {
    component.titulo = 'Comprar pan';
    component.descripcion = 'En la esquina';
    component.foto = FOTO;
    component.ubicacion = UBICACION;

    await component.guardar();

    expect(tareaService.agregar).toHaveBeenCalledWith({
      titulo: 'Comprar pan',
      descripcion: 'En la esquina',
      foto: FOTO,
      ubicacion: UBICACION,
    });
    expect(component.titulo).toBe('');
    expect(component.foto).toBeNull();
  });

  it('no guarda si falta el título o la descripción', async () => {
    component.titulo = '   ';
    component.descripcion = 'algo';

    await component.guardar();

    expect(component.formularioValido).toBe(false);
    expect(tareaService.agregar).not.toHaveBeenCalled();
  });

  it('carga en el formulario los datos de la tarea en edición', () => {
    const tarea: Tarea = {
      id: '9',
      titulo: 'Editar',
      descripcion: 'desc',
      completada: false,
      creadaEn: '2026-11-20T12:00:00.000Z',
      foto: FOTO,
      ubicacion: UBICACION,
    };

    component.editar(tarea);

    expect(component.editando).toBe(true);
    expect(component.foto).toEqual(FOTO);
    expect(component.ubicacion).toEqual(UBICACION);
  });

  it('construye el enlace al mapa con las coordenadas registradas', () => {
    expect(component.enlaceMapa(UBICACION)).toContain('mlat=-33.44');
    expect(component.enlaceMapa(UBICACION)).toContain('mlon=-70.67');
  });
});

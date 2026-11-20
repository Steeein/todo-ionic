import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { vi } from 'vitest';

import { LecturaSensor, RegistroPermisos, exito, fallo } from '../models/periferico.model';
import { CamaraService } from '../services/camara.service';
import { PermisosService } from '../services/permisos.service';
import { SensorService } from '../services/sensor.service';
import { UbicacionService } from '../services/ubicacion.service';
import { PerifericosPageModule } from './perifericos.module';
import { PerifericosPage } from './perifericos.page';

/**
 * Pruebas de la pantalla de diagnóstico: comprueban que cada prueba manual
 * queda registrada con su resultado y su tiempo de respuesta, que el estado de
 * los permisos se refresca y que el listener del sensor se libera al salir.
 */
describe('PerifericosPage', () => {
  let component: PerifericosPage;
  let fixture: ComponentFixture<PerifericosPage>;

  const lectura$ = new BehaviorSubject<LecturaSensor | null>(null);
  const activo$ = new BehaviorSubject<boolean>(false);
  const agitacion$ = new Subject<LecturaSensor>();

  const permisos: RegistroPermisos = {
    camara: 'concedido',
    ubicacion: 'pendiente',
    movimiento: 'no-aplica',
  };

  const permisosService = {
    estadoActual: vi.fn().mockResolvedValue(permisos),
    mensajeDeRechazo: vi.fn().mockReturnValue('sin permiso'),
  };
  const camara = { capturar: vi.fn(), disponible: vi.fn().mockReturnValue(true) };
  const ubicacion = { obtenerActual: vi.fn(), disponible: vi.fn().mockReturnValue(true) };
  const sensor = {
    lectura$,
    activo$,
    agitacion$,
    activo: false,
    disponible: vi.fn().mockReturnValue(true),
    iniciar: vi.fn(),
    detener: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    sensor.activo = false;
    permisosService.estadoActual.mockResolvedValue(permisos);

    await TestBed.configureTestingModule({
      imports: [PerifericosPageModule, RouterModule.forRoot([])],
      providers: [
        { provide: PermisosService, useValue: permisosService },
        { provide: CamaraService, useValue: camara },
        { provide: UbicacionService, useValue: ubicacion },
        { provide: SensorService, useValue: sensor },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerifericosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra el estado de los permisos sin solicitarlos', async () => {
    await component.refrescarPermisos();

    expect(component.permisos.camara).toBe('concedido');
    expect(permisosService.estadoActual).toHaveBeenCalled();
  });

  it('registra la prueba del GPS con sus datos y su tiempo de respuesta', async () => {
    ubicacion.obtenerActual.mockResolvedValue(
      exito({ latitud: -33.44, longitud: -70.67, precisionMetros: 8, obtenidaEn: 'x' }, 320),
    );

    await component.probarUbicacion();

    expect(component.registro[0].exito).toBe(true);
    expect(component.registro[0].duracionMs).toBe(320);
    expect(component.registro[0].detalle).toContain('±8 m');
  });

  it('registra el motivo cuando una prueba falla', async () => {
    camara.capturar.mockResolvedValue(fallo('permiso-bloqueado', 'Permiso bloqueado', 15));

    await component.probarCamara();

    expect(component.registro[0].exito).toBe(false);
    expect(component.registro[0].detalle).toBe('Permiso bloqueado');
  });

  it('inicia y detiene la escucha del acelerómetro', async () => {
    sensor.iniciar.mockResolvedValue(exito(true, 5));

    await component.alternarSensor();
    expect(sensor.iniciar).toHaveBeenCalledTimes(1);

    sensor.activo = true;
    await component.alternarSensor();
    expect(sensor.detener).toHaveBeenCalled();
  });

  it('cuenta las agitaciones detectadas por el sensor', () => {
    agitacion$.next({ x: 30, y: 0, z: 0, magnitud: 30, medidaEn: 'x' });

    expect(component.agitaciones).toBe(1);
  });

  it('refleja en pantalla la última lectura publicada', () => {
    lectura$.next({ x: 1, y: 2, z: 3, magnitud: 3.74, medidaEn: 'x' });

    expect(component.lectura?.magnitud).toBe(3.74);
  });

  it('ejecuta el diagnóstico completo en orden', async () => {
    ubicacion.obtenerActual.mockResolvedValue(
      exito({ latitud: 0, longitud: 0, precisionMetros: 5, obtenidaEn: 'x' }, 100),
    );
    sensor.iniciar.mockResolvedValue(exito(true, 5));

    await component.diagnosticoCompleto();

    expect(ubicacion.obtenerActual).toHaveBeenCalled();
    expect(sensor.iniciar).toHaveBeenCalled();
    expect(component.registro.length).toBeGreaterThanOrEqual(2);
  });

  it('permite limpiar el registro de pruebas', async () => {
    camara.capturar.mockResolvedValue(fallo('cancelado', 'cancelado', 5));
    await component.probarCamara();

    component.limpiarRegistro();

    expect(component.registro).toEqual([]);
    expect(component.agitaciones).toBe(0);
  });

  it('libera el listener del sensor al abandonar la página', async () => {
    await component.ngOnDestroy();

    expect(sensor.detener).toHaveBeenCalled();
  });
});

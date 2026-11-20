import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { LecturaSensor } from '../models/periferico.model';
import { SensorService } from './sensor.service';

/**
 * Pruebas automatizadas del sensor de movimiento (acelerómetro).
 *
 * Se sustituye @capacitor/motion por un doble que permite inyectar eventos a
 * voluntad. Así se comprueba el cálculo de la magnitud, el muestreo que protege
 * el rendimiento, el descarte de lecturas inválidas, la detección de agitación
 * y la liberación del listener al detener la escucha.
 */
const dobles = vi.hoisted(() => ({
  addListener: vi.fn(),
  remove: vi.fn(),
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => true),
}));

vi.mock('@capacitor/motion', () => ({
  Motion: { addListener: dobles.addListener },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: dobles.getPlatform,
    isNativePlatform: dobles.isNativePlatform,
    isPluginAvailable: dobles.isPluginAvailable,
    convertFileSrc: (ruta: string) => ruta,
  },
}));

vi.mock('@capacitor/camera', () => ({
  Camera: { checkPermissions: vi.fn(), requestPermissions: vi.fn(), getPhoto: vi.fn() },
  CameraResultType: { DataUrl: 'dataUrl' },
  CameraSource: { Camera: 'CAMERA', Photos: 'PHOTOS' },
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: { checkPermissions: vi.fn(), requestPermissions: vi.fn(), getCurrentPosition: vi.fn() },
}));

type Oyente = (evento: unknown) => void;

function evento(x: number, y: number, z: number) {
  return { accelerationIncludingGravity: { x, y, z } };
}

describe('SensorService (acelerómetro)', () => {
  let servicio: SensorService;
  let emitir: Oyente;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // jsdom no define DeviceMotionEvent: se simula su presencia.
    (globalThis as Record<string, unknown>)['DeviceMotionEvent'] = class {};
    dobles.addListener.mockImplementation((_nombre: string, oyente: Oyente) => {
      emitir = oyente;
      return Promise.resolve({ remove: dobles.remove });
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(SensorService);
  });

  afterEach(async () => {
    await servicio.detener();
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>)['DeviceMotionEvent'];
  });

  it('inicia la escucha y marca el sensor como activo', async () => {
    const resultado = await servicio.iniciar();

    expect(resultado.ok).toBe(true);
    expect(dobles.addListener).toHaveBeenCalledWith('accel', expect.any(Function));
    expect(servicio.activo).toBe(true);
  });

  it('publica la lectura con la magnitud del vector de aceleración', async () => {
    await servicio.iniciar();
    const lecturas: (LecturaSensor | null)[] = [];
    servicio.lectura$.subscribe((lectura) => lecturas.push(lectura));

    emitir(evento(3, 4, 0));

    const ultima = lecturas.at(-1);
    expect(ultima).not.toBeNull();
    expect(ultima?.x).toBe(3);
    expect(ultima?.magnitud).toBe(5); // sqrt(3² + 4²)
  });

  it('aplica muestreo: descarta los eventos que llegan demasiado seguidos', async () => {
    await servicio.iniciar();
    const lecturas: LecturaSensor[] = [];
    servicio.lectura$.subscribe((lectura) => lectura && lecturas.push(lectura));

    emitir(evento(1, 0, 0));
    emitir(evento(2, 0, 0)); // llega de inmediato: se descarta
    expect(lecturas.length).toBe(1);

    vi.advanceTimersByTime(200);
    emitir(evento(3, 0, 0)); // ya pasó el intervalo de muestreo
    expect(lecturas.length).toBe(2);
    expect(lecturas.at(-1)?.x).toBe(3);
  });

  it('descarta lecturas con valores no numéricos', async () => {
    await servicio.iniciar();
    const lecturas: LecturaSensor[] = [];
    servicio.lectura$.subscribe((lectura) => lectura && lecturas.push(lectura));

    emitir({ accelerationIncludingGravity: { x: 'a', y: null, z: undefined } });

    expect(lecturas.length).toBe(0);
  });

  it('detecta una agitación cuando se supera el umbral configurado', async () => {
    await servicio.iniciar();
    const agitaciones: LecturaSensor[] = [];
    servicio.agitacion$.subscribe((lectura) => agitaciones.push(lectura));

    emitir(evento(1, 1, 1)); // magnitud ≈ 1,73: no es agitación
    vi.advanceTimersByTime(200);
    emitir(evento(30, 0, 0)); // magnitud 30 > umbral 25

    expect(agitaciones.length).toBe(1);
    expect(agitaciones[0].magnitud).toBe(30);
  });

  it('libera el listener nativo al detener la escucha', async () => {
    await servicio.iniciar();

    await servicio.detener();

    expect(dobles.remove).toHaveBeenCalledTimes(1);
    expect(servicio.activo).toBe(false);
  });

  it('no registra dos listeners si se inicia dos veces', async () => {
    await servicio.iniciar();
    await servicio.iniciar();

    expect(dobles.addListener).toHaveBeenCalledTimes(1);
  });

  it('informa "no-disponible" si el entorno no expone el sensor', async () => {
    delete (globalThis as Record<string, unknown>)['DeviceMotionEvent'];

    const resultado = await servicio.iniciar();

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('no-disponible');
    }
  });

  it('devuelve un fallo controlado si el plugin lanza un error', async () => {
    dobles.addListener.mockRejectedValue(new Error('sensor ocupado'));

    const resultado = await servicio.iniciar();

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('error');
      expect(resultado.mensaje).toContain('sensor ocupado');
    }
  });
});

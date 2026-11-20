import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { UbicacionService } from './ubicacion.service';

/**
 * Pruebas automatizadas del periférico GPS.
 *
 * El plugin @capacitor/geolocation se reemplaza por un doble de prueba, de modo
 * que los casos se ejecutan sin hardware y de forma determinista: posición
 * válida, coordenadas fuera de rango, precisión insuficiente, permiso denegado,
 * tiempo agotado y ausencia de señal.
 */
const dobles = vi.hoisted(() => ({
  getCurrentPosition: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  isNativePlatform: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => true),
  getPlatform: vi.fn(() => 'android'),
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    getCurrentPosition: dobles.getCurrentPosition,
    checkPermissions: dobles.checkPermissions,
    requestPermissions: dobles.requestPermissions,
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: dobles.isNativePlatform,
    isPluginAvailable: dobles.isPluginAvailable,
    getPlatform: dobles.getPlatform,
    convertFileSrc: (ruta: string) => ruta,
  },
}));

vi.mock('@capacitor/camera', () => ({
  Camera: { checkPermissions: vi.fn(), requestPermissions: vi.fn(), getPhoto: vi.fn() },
  CameraResultType: { DataUrl: 'dataUrl' },
  CameraSource: { Camera: 'CAMERA', Photos: 'PHOTOS' },
}));

function posicion(coords: Partial<GeolocationCoordinates>) {
  return {
    timestamp: Date.parse('2026-11-20T12:00:00.000Z'),
    coords: {
      latitude: -33.447487,
      longitude: -70.673676,
      accuracy: 12.4,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      ...coords,
    },
  };
}

describe('UbicacionService (periférico GPS)', () => {
  let servicio: UbicacionService;

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.isNativePlatform.mockReturnValue(true);
    dobles.isPluginAvailable.mockReturnValue(true);
    dobles.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(UbicacionService);
  });

  it('entrega una ubicación validada y redondeada cuando el GPS responde', async () => {
    dobles.getCurrentPosition.mockResolvedValue(posicion({}));

    const resultado = await servicio.obtenerActual();

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.datos.latitud).toBe(-33.447487);
      expect(resultado.datos.longitud).toBe(-70.673676);
      expect(resultado.datos.precisionMetros).toBe(12);
      expect(resultado.datos.obtenidaEn).toBe('2026-11-20T12:00:00.000Z');
      expect(resultado.duracionMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('pide alta precisión y limita el tiempo de espera', async () => {
    dobles.getCurrentPosition.mockResolvedValue(posicion({}));

    await servicio.obtenerActual();

    expect(dobles.getCurrentPosition).toHaveBeenCalledWith(
      expect.objectContaining({ enableHighAccuracy: true, timeout: 10_000 }),
    );
  });

  it('rechaza coordenadas fuera de rango en lugar de guardarlas', async () => {
    dobles.getCurrentPosition.mockResolvedValue(posicion({ latitude: 120 }));

    const resultado = await servicio.obtenerActual();

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('datos-invalidos');
    }
  });

  it('rechaza lecturas sin precisión confiable', async () => {
    dobles.getCurrentPosition.mockResolvedValue(posicion({ accuracy: 9_999 }));

    const resultado = await servicio.obtenerActual();

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('datos-invalidos');
    }
  });

  it('rechaza valores no numéricos entregados por el sistema', async () => {
    dobles.getCurrentPosition.mockResolvedValue(posicion({ longitude: Number.NaN }));

    const resultado = await servicio.obtenerActual();

    expect(resultado.ok).toBe(false);
  });

  it('no consulta el GPS si el permiso está bloqueado', async () => {
    dobles.checkPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });

    const resultado = await servicio.obtenerActual();

    expect(dobles.getCurrentPosition).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('permiso-bloqueado');
      expect(resultado.mensaje).toContain('ajustes del sistema');
    }
  });

  it('solicita el permiso sólo cuando todavía no fue concedido', async () => {
    dobles.checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    dobles.requestPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    dobles.getCurrentPosition.mockResolvedValue(posicion({}));

    const resultado = await servicio.obtenerActual();

    expect(dobles.requestPermissions).toHaveBeenCalledTimes(1);
    expect(resultado.ok).toBe(true);
  });

  it('informa permiso denegado cuando el usuario rechaza la solicitud', async () => {
    dobles.checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    dobles.requestPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });

    const resultado = await servicio.obtenerActual();

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('permiso-denegado');
    }
  });

  it('traduce el código 3 del sistema a "tiempo-agotado"', async () => {
    dobles.getCurrentPosition.mockRejectedValue({ code: 3, message: 'Timeout expired' });

    const resultado = await servicio.obtenerActual();

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('tiempo-agotado');
    }
  });

  it('traduce el código 2 del sistema a "no-disponible"', async () => {
    dobles.getCurrentPosition.mockRejectedValue({ code: 2, message: 'Position unavailable' });

    const resultado = await servicio.obtenerActual();

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('no-disponible');
    }
  });

  it('informa que el periférico no existe cuando el plugin no está disponible', async () => {
    dobles.isPluginAvailable.mockReturnValue(false);

    const resultado = await servicio.obtenerActual();

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('no-disponible');
    }
  });
});

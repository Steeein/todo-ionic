import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { PermisosService } from './permisos.service';

/**
 * Pruebas de la gestión de permisos de los periféricos.
 *
 * Verifican las reglas de buenas prácticas implementadas en el servicio: no
 * volver a pedir un permiso ya concedido, distinguir el rechazo puntual del
 * rechazo permanente, consultar el estado sin abrir diálogos y no romper la
 * aplicación en plataformas que no gestionan permisos.
 */
const dobles = vi.hoisted(() => ({
  camCheck: vi.fn(),
  camRequest: vi.fn(),
  geoCheck: vi.fn(),
  geoRequest: vi.fn(),
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => true),
}));

vi.mock('@capacitor/camera', () => ({
  Camera: { checkPermissions: dobles.camCheck, requestPermissions: dobles.camRequest, getPhoto: vi.fn() },
  CameraResultType: { DataUrl: 'dataUrl' },
  CameraSource: { Camera: 'CAMERA', Photos: 'PHOTOS' },
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: dobles.geoCheck,
    requestPermissions: dobles.geoRequest,
    getCurrentPosition: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: dobles.getPlatform,
    isNativePlatform: dobles.isNativePlatform,
    isPluginAvailable: dobles.isPluginAvailable,
    convertFileSrc: (ruta: string) => ruta,
  },
}));

describe('PermisosService', () => {
  let servicio: PermisosService;

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.getPlatform.mockReturnValue('android');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(PermisosService);
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['DeviceMotionEvent'];
  });

  it('no vuelve a mostrar el diálogo si el permiso ya está concedido', async () => {
    dobles.camCheck.mockResolvedValue({ camera: 'granted', photos: 'granted' });

    expect(await servicio.asegurarCamara()).toBe('concedido');
    expect(dobles.camRequest).not.toHaveBeenCalled();
  });

  it('solicita el permiso cuando aún no se ha preguntado', async () => {
    dobles.camCheck.mockResolvedValue({ camera: 'prompt', photos: 'prompt' });
    dobles.camRequest.mockResolvedValue({ camera: 'granted', photos: 'granted' });

    expect(await servicio.asegurarCamara()).toBe('concedido');
    expect(dobles.camRequest).toHaveBeenCalledWith({ permissions: ['camera', 'photos'] });
  });

  it('distingue el rechazo permanente ("bloqueado") del rechazo puntual', async () => {
    dobles.camCheck.mockResolvedValue({ camera: 'denied', photos: 'denied' });
    expect(await servicio.asegurarCamara()).toBe('bloqueado');

    dobles.camCheck.mockResolvedValue({ camera: 'prompt', photos: 'prompt' });
    dobles.camRequest.mockResolvedValue({ camera: 'denied', photos: 'denied' });
    expect(await servicio.asegurarCamara()).toBe('denegado');
  });

  it('acepta el acceso limitado de iOS como permiso concedido', async () => {
    dobles.camCheck.mockResolvedValue({ camera: 'limited', photos: 'limited' });

    expect(await servicio.asegurarCamara()).toBe('concedido');
  });

  it('devuelve "no-aplica" cuando la plataforma no gestiona el permiso', async () => {
    dobles.geoCheck.mockRejectedValue(new Error('Not implemented on web'));

    expect(await servicio.asegurarUbicacion()).toBe('no-aplica');
  });

  it('gestiona el permiso de ubicación igual que el de cámara', async () => {
    dobles.geoCheck.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    dobles.geoRequest.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });

    expect(await servicio.asegurarUbicacion()).toBe('concedido');
    expect(dobles.geoRequest).toHaveBeenCalledWith({ permissions: ['location'] });
  });

  it('en Android el sensor de movimiento no requiere permiso explícito', async () => {
    dobles.getPlatform.mockReturnValue('android');

    expect(await servicio.asegurarMovimiento()).toBe('no-aplica');
  });

  it('en iOS solicita autorización para el sensor de movimiento', async () => {
    dobles.getPlatform.mockReturnValue('ios');
    const requestPermission = vi.fn().mockResolvedValue('granted');
    (globalThis as Record<string, unknown>)['DeviceMotionEvent'] = { requestPermission };

    expect(await servicio.asegurarMovimiento()).toBe('concedido');
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('informa "denegado" si el usuario rechaza el sensor de movimiento', async () => {
    dobles.getPlatform.mockReturnValue('ios');
    (globalThis as Record<string, unknown>)['DeviceMotionEvent'] = {
      requestPermission: vi.fn().mockResolvedValue('denied'),
    };

    expect(await servicio.asegurarMovimiento()).toBe('denegado');
  });

  it('consulta el estado de los tres permisos sin abrir ningún diálogo', async () => {
    dobles.camCheck.mockResolvedValue({ camera: 'granted', photos: 'granted' });
    dobles.geoCheck.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });

    const estado = await servicio.estadoActual();

    expect(estado.camara).toBe('concedido');
    expect(estado.ubicacion).toBe('pendiente');
    expect(dobles.camRequest).not.toHaveBeenCalled();
    expect(dobles.geoRequest).not.toHaveBeenCalled();
  });

  it('explica al usuario cómo recuperar un permiso bloqueado', () => {
    const bloqueado = servicio.mensajeDeRechazo('camara', 'bloqueado');
    const denegado = servicio.mensajeDeRechazo('camara', 'denegado');

    expect(bloqueado).toContain('ajustes del sistema');
    expect(denegado).not.toBe(bloqueado);
  });

  it('declara el motivo de uso de cada permiso', () => {
    expect(PermisosService.JUSTIFICACIONES.camara).toContain('foto');
    expect(PermisosService.JUSTIFICACIONES.ubicacion).toContain('GPS');
    expect(PermisosService.JUSTIFICACIONES.movimiento).toContain('acelerómetro');
  });
});

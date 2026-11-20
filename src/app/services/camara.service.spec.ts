import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CamaraService } from './camara.service';

/**
 * Pruebas automatizadas del periférico cámara.
 *
 * Se verifica la captura correcta, el almacenamiento de la imagen como archivo
 * en plataformas nativas, la optimización solicitada al plugin (tamaño y
 * calidad), y el manejo de cancelación, permisos denegados y respuestas vacías.
 */
const dobles = vi.hoisted(() => ({
  getPhoto: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  isNativePlatform: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => true),
  getPlatform: vi.fn(() => 'android'),
}));

vi.mock('@capacitor/camera', () => ({
  Camera: {
    getPhoto: dobles.getPhoto,
    checkPermissions: dobles.checkPermissions,
    requestPermissions: dobles.requestPermissions,
  },
  CameraResultType: { DataUrl: 'dataUrl', Uri: 'uri', Base64: 'base64' },
  CameraSource: { Camera: 'CAMERA', Photos: 'PHOTOS', Prompt: 'PROMPT' },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: dobles.writeFile, deleteFile: dobles.deleteFile },
  Directory: { Data: 'DATA' },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: dobles.isNativePlatform,
    isPluginAvailable: dobles.isPluginAvailable,
    getPlatform: dobles.getPlatform,
    convertFileSrc: (ruta: string) => `capacitor://${ruta}`,
  },
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: { checkPermissions: vi.fn(), requestPermissions: vi.fn(), getCurrentPosition: vi.fn() },
}));

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('CamaraService (periférico cámara)', () => {
  let servicio: CamaraService;

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.isNativePlatform.mockReturnValue(true);
    dobles.isPluginAvailable.mockReturnValue(true);
    dobles.checkPermissions.mockResolvedValue({ camera: 'granted', photos: 'granted' });
    dobles.writeFile.mockResolvedValue({ uri: '/data/user/0/app/files/tarea.jpeg' });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(CamaraService);
  });

  it('captura la foto y la guarda como archivo en el dispositivo', async () => {
    dobles.getPhoto.mockResolvedValue({ dataUrl: DATA_URL, format: 'jpeg' });

    const resultado = await servicio.capturar('camara');

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(dobles.writeFile).toHaveBeenCalledTimes(1);
      // Se guarda sólo el base64, sin el prefijo del data URL.
      expect(dobles.writeFile.mock.calls[0][0].data).toBe('/9j/4AAQSkZJRg==');
      expect(resultado.datos.uri).toBe('/data/user/0/app/files/tarea.jpeg');
      expect(resultado.datos.src).toContain('capacitor://');
      expect(resultado.datos.formato).toBe('jpeg');
    }
  });

  it('solicita la imagen ya optimizada (ancho y calidad limitados)', async () => {
    dobles.getPhoto.mockResolvedValue({ dataUrl: DATA_URL, format: 'jpeg' });

    await servicio.capturar('camara');

    expect(dobles.getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ width: 800, quality: 70, correctOrientation: true }),
    );
  });

  it('usa la galería cuando el origen es "galeria"', async () => {
    dobles.getPhoto.mockResolvedValue({ dataUrl: DATA_URL, format: 'png' });

    await servicio.capturar('galeria');

    expect(dobles.getPhoto).toHaveBeenCalledWith(expect.objectContaining({ source: 'PHOTOS' }));
  });

  it('en navegador conserva el data URL sin tocar el sistema de archivos', async () => {
    dobles.isNativePlatform.mockReturnValue(false);
    // jsdom no implementa mediaDevices: se simula el soporte del navegador.
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    dobles.getPhoto.mockResolvedValue({ dataUrl: DATA_URL, format: 'jpeg' });

    const resultado = await servicio.capturar('camara');

    expect(dobles.writeFile).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.datos.src).toBe(DATA_URL);
    }
  });

  it('conserva la foto en memoria si falla la escritura del archivo', async () => {
    dobles.getPhoto.mockResolvedValue({ dataUrl: DATA_URL, format: 'jpeg' });
    dobles.writeFile.mockRejectedValue(new Error('disk full'));

    const resultado = await servicio.capturar('camara');

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.datos.src).toBe(DATA_URL);
      expect(resultado.datos.uri).toBeUndefined();
    }
  });

  it('trata la cancelación del usuario como un caso esperado, no como error', async () => {
    dobles.getPhoto.mockRejectedValue(new Error('User cancelled photos app'));

    const resultado = await servicio.capturar('camara');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('cancelado');
    }
  });

  it('no abre la cámara cuando el permiso está bloqueado', async () => {
    dobles.checkPermissions.mockResolvedValue({ camera: 'denied', photos: 'denied' });

    const resultado = await servicio.capturar('camara');

    expect(dobles.getPhoto).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('permiso-bloqueado');
    }
  });

  it('informa permiso denegado cuando el usuario rechaza el diálogo', async () => {
    dobles.checkPermissions.mockResolvedValue({ camera: 'prompt', photos: 'prompt' });
    dobles.requestPermissions.mockResolvedValue({ camera: 'denied', photos: 'denied' });

    const resultado = await servicio.capturar('camara');

    expect(dobles.requestPermissions).toHaveBeenCalledTimes(1);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('permiso-denegado');
    }
  });

  it('rechaza una respuesta sin imagen en lugar de adjuntar datos vacíos', async () => {
    dobles.getPhoto.mockResolvedValue({ format: 'jpeg' });

    const resultado = await servicio.capturar('camara');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('datos-invalidos');
    }
  });

  it('informa cuando el dispositivo no tiene cámara disponible', async () => {
    dobles.isPluginAvailable.mockReturnValue(false);

    const resultado = await servicio.capturar('camara');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('no-disponible');
    }
  });

  it('borra el archivo de la foto al eliminarla en plataformas nativas', async () => {
    dobles.deleteFile.mockResolvedValue(undefined);

    await servicio.eliminar({
      src: 'capacitor:///data/foto.jpeg',
      uri: '/data/foto.jpeg',
      formato: 'jpeg',
      capturadaEn: new Date().toISOString(),
    });

    expect(dobles.deleteFile).toHaveBeenCalledWith({ path: '/data/foto.jpeg' });
  });

  it('no falla al eliminar una tarea sin foto', async () => {
    await expect(servicio.eliminar(null)).resolves.toBeUndefined();
    expect(dobles.deleteFile).not.toHaveBeenCalled();
  });
});

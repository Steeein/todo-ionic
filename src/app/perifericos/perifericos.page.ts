import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  cameraOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  helpCircleOutline,
  locationOutline,
  playOutline,
  pulseOutline,
  refreshOutline,
  stopOutline,
} from 'ionicons/icons';
import { Subscription } from 'rxjs';

import {
  ClavePermiso,
  EstadoPermiso,
  LecturaSensor,
  RegistroPermisos,
  ResultadoPeriferico,
} from '../models/periferico.model';
import { CamaraService } from '../services/camara.service';
import { PermisosService } from '../services/permisos.service';
import { SensorService } from '../services/sensor.service';
import { UbicacionService } from '../services/ubicacion.service';

/** Una línea del registro de pruebas manuales. */
interface RegistroPrueba {
  periferico: string;
  exito: boolean;
  detalle: string;
  duracionMs: number;
  momento: string;
}

/**
 * Pantalla de diagnóstico de periféricos.
 *
 * Permite ejecutar, sobre el dispositivo real, las mismas comprobaciones que
 * cubren las pruebas automatizadas: estado de cada permiso, captura de imagen,
 * lectura del GPS (con su precisión) y lectura continua del acelerómetro. Cada
 * prueba queda registrada con su resultado y el tiempo de respuesta del
 * periférico, lo que sirve como evidencia de funcionamiento y de rendimiento.
 */
@Component({
  selector: 'app-perifericos',
  templateUrl: './perifericos.page.html',
  styleUrls: ['./perifericos.page.scss'],
  standalone: false,
})
export class PerifericosPage implements OnInit, OnDestroy {
  plataforma = Capacitor.getPlatform();
  esNativo = Capacitor.isNativePlatform();

  permisos: RegistroPermisos = {
    camara: 'pendiente',
    ubicacion: 'pendiente',
    movimiento: 'pendiente',
  };

  lectura: LecturaSensor | null = null;
  sensorActivo = false;
  agitaciones = 0;

  registro: RegistroPrueba[] = [];
  ejecutando = false;

  private suscripciones = new Subscription();

  private readonly permisosService = inject(PermisosService);
  private readonly camara = inject(CamaraService);
  private readonly ubicacion = inject(UbicacionService);
  private readonly sensor = inject(SensorService);
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    addIcons({
      alertCircleOutline,
      cameraOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      helpCircleOutline,
      locationOutline,
      playOutline,
      pulseOutline,
      refreshOutline,
      stopOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    this.suscripciones.add(
      this.sensor.lectura$.subscribe((lectura) => {
        this.lectura = lectura;
        this.cdr.markForCheck();
      }),
    );
    this.suscripciones.add(
      this.sensor.activo$.subscribe((activo) => {
        this.sensorActivo = activo;
        this.cdr.markForCheck();
      }),
    );
    this.suscripciones.add(
      this.sensor.agitacion$.subscribe(() => {
        this.agitaciones++;
        this.cdr.markForCheck();
      }),
    );
    await this.refrescarPermisos();
  }

  async ngOnDestroy(): Promise<void> {
    this.suscripciones.unsubscribe();
    await this.sensor.detener(); // Libera el listener al salir de la página.
  }

  get camaraDisponible(): boolean {
    return this.camara.disponible();
  }

  get gpsDisponible(): boolean {
    return this.ubicacion.disponible();
  }

  get sensorDisponible(): boolean {
    return this.sensor.disponible();
  }

  /** Relee el estado de los permisos sin abrir ningún diálogo del sistema. */
  async refrescarPermisos(): Promise<void> {
    this.permisos = await this.permisosService.estadoActual();
    this.cdr.markForCheck();
  }

  justificacion(clave: ClavePermiso): string {
    return PermisosService.JUSTIFICACIONES[clave];
  }

  colorPermiso(estado: EstadoPermiso): string {
    switch (estado) {
      case 'concedido':
        return 'success';
      case 'denegado':
        return 'warning';
      case 'bloqueado':
        return 'danger';
      default:
        return 'medium';
    }
  }

  iconoPermiso(estado: EstadoPermiso): string {
    switch (estado) {
      case 'concedido':
        return 'checkmark-circle-outline';
      case 'denegado':
        return 'alert-circle-outline';
      case 'bloqueado':
        return 'close-circle-outline';
      default:
        return 'help-circle-outline';
    }
  }

  // --- Pruebas individuales ----------------------------------------------

  async probarCamara(): Promise<void> {
    await this.ejecutar('Cámara', () => this.camara.capturar('camara'), (foto) =>
      `Imagen ${foto.formato} capturada y almacenada en el dispositivo.`,
    );
  }

  async probarUbicacion(): Promise<void> {
    await this.ejecutar('GPS', () => this.ubicacion.obtenerActual(), (u) =>
      `Lat ${u.latitud} / Lon ${u.longitud} con precisión de ±${u.precisionMetros} m.`,
    );
  }

  async alternarSensor(): Promise<void> {
    if (this.sensor.activo) {
      await this.sensor.detener();
      this.anotar('Acelerómetro', true, 'Escucha detenida y listener liberado.', 0);
      return;
    }

    await this.ejecutar('Acelerómetro', () => this.sensor.iniciar(), () =>
      'Escucha iniciada: las lecturas se actualizan en pantalla.',
    );
  }

  /** Ejecuta las tres pruebas de lectura en orden. */
  async diagnosticoCompleto(): Promise<void> {
    await this.refrescarPermisos();
    await this.probarUbicacion();
    if (!this.sensor.activo) {
      await this.alternarSensor();
    }
    await this.refrescarPermisos();
  }

  limpiarRegistro(): void {
    this.registro = [];
    this.agitaciones = 0;
  }

  private async ejecutar<T>(
    periferico: string,
    accion: () => Promise<ResultadoPeriferico<T>>,
    describir: (datos: T) => string,
  ): Promise<void> {
    if (this.ejecutando) {
      return;
    }

    this.ejecutando = true;
    try {
      const resultado = await accion();
      this.anotar(
        periferico,
        resultado.ok,
        resultado.ok ? describir(resultado.datos) : resultado.mensaje,
        resultado.duracionMs,
      );
      await this.refrescarPermisos();
    } finally {
      this.ejecutando = false;
    }
  }

  private anotar(periferico: string, exito: boolean, detalle: string, duracionMs: number): void {
    this.registro = [
      {
        periferico,
        exito,
        detalle,
        duracionMs,
        momento: new Date().toLocaleTimeString('es-CL'),
      },
      ...this.registro,
    ].slice(0, 20);
    this.cdr.markForCheck();
  }
}

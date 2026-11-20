import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  cameraOutline,
  checkmarkOutline,
  closeOutline,
  createOutline,
  imagesOutline,
  listOutline,
  locationOutline,
  navigateCircleOutline,
  trashOutline,
} from 'ionicons/icons';
import { Subscription } from 'rxjs';

import { FotoTarea, ResultadoPeriferico, UbicacionTarea } from '../models/periferico.model';
import { Tarea } from '../models/tarea.model';
import { CamaraService, OrigenFoto } from '../services/camara.service';
import { TareaService } from '../services/tarea.service';
import { UbicacionService } from '../services/ubicacion.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  tareas: Tarea[] = [];

  titulo = '';
  descripcion = '';
  foto: FotoTarea | null = null;
  ubicacion: UbicacionTarea | null = null;
  idEnEdicion: string | null = null;

  /** Bandera para mostrar el spinner mientras el GPS responde. */
  buscandoUbicacion = false;
  /** Bandera para evitar dobles capturas mientras la cámara está abierta. */
  capturandoFoto = false;

  private suscripcion?: Subscription;

  private readonly tareaService = inject(TareaService);
  private readonly camara = inject(CamaraService);
  private readonly ubicacionService = inject(UbicacionService);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    addIcons({
      addCircleOutline,
      cameraOutline,
      checkmarkOutline,
      closeOutline,
      createOutline,
      imagesOutline,
      listOutline,
      locationOutline,
      navigateCircleOutline,
      trashOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    this.suscripcion = this.tareaService.tareas$.subscribe((tareas) => {
      this.tareas = tareas;
      this.cdr.markForCheck();
    });
    await this.tareaService.inicializar();
  }

  ngOnDestroy(): void {
    this.suscripcion?.unsubscribe();
  }

  get editando(): boolean {
    return this.idEnEdicion !== null;
  }

  get formularioValido(): boolean {
    return this.titulo.trim().length > 0 && this.descripcion.trim().length > 0;
  }

  get pendientes(): number {
    return this.tareas.filter((tarea) => !tarea.completada).length;
  }

  // --- Periférico: cámara -------------------------------------------------

  /** Pregunta al usuario si quiere usar la cámara o la galería. */
  async elegirOrigenFoto(): Promise<void> {
    const hoja = await this.actionSheetCtrl.create({
      header: 'Adjuntar imagen a la tarea',
      buttons: [
        { text: 'Tomar foto', icon: 'camera-outline', handler: () => void this.capturarFoto('camara') },
        { text: 'Elegir de la galería', icon: 'images-outline', handler: () => void this.capturarFoto('galeria') },
        { text: 'Cancelar', role: 'cancel', icon: 'close-outline' },
      ],
    });
    await hoja.present();
  }

  async capturarFoto(origen: OrigenFoto): Promise<void> {
    if (this.capturandoFoto) {
      return;
    }

    this.capturandoFoto = true;
    try {
      const resultado = await this.camara.capturar(origen);
      if (resultado.ok) {
        this.foto = resultado.datos;
        await this.avisar('Imagen adjuntada a la tarea.', 'success');
      } else {
        await this.informarFallo(resultado);
      }
    } finally {
      this.capturandoFoto = false;
      this.cdr.markForCheck();
    }
  }

  quitarFoto(): void {
    this.foto = null;
  }

  // --- Periférico: GPS ----------------------------------------------------

  async capturarUbicacion(): Promise<void> {
    if (this.buscandoUbicacion) {
      return;
    }

    this.buscandoUbicacion = true;
    try {
      const resultado = await this.ubicacionService.obtenerActual();
      if (resultado.ok) {
        this.ubicacion = resultado.datos;
        await this.avisar(
          `Ubicación registrada (±${resultado.datos.precisionMetros} m).`,
          'success',
        );
      } else {
        await this.informarFallo(resultado);
      }
    } finally {
      this.buscandoUbicacion = false;
      this.cdr.markForCheck();
    }
  }

  quitarUbicacion(): void {
    this.ubicacion = null;
  }

  enlaceMapa(ubicacion: UbicacionTarea): string {
    return `https://www.openstreetmap.org/?mlat=${ubicacion.latitud}&mlon=${ubicacion.longitud}#map=17/${ubicacion.latitud}/${ubicacion.longitud}`;
  }

  // --- CRUD ---------------------------------------------------------------

  async guardar(): Promise<void> {
    if (!this.formularioValido) {
      return;
    }

    const datos = {
      titulo: this.titulo,
      descripcion: this.descripcion,
      foto: this.foto,
      ubicacion: this.ubicacion,
    };

    if (this.idEnEdicion !== null) {
      await this.tareaService.actualizar(this.idEnEdicion, datos);
      await this.avisar('Tarea actualizada.', 'success');
    } else {
      await this.tareaService.agregar(datos);
      await this.avisar('Tarea guardada en el dispositivo.', 'success');
    }

    this.limpiarFormulario();
    this.cdr.markForCheck();
  }

  editar(tarea: Tarea): void {
    this.idEnEdicion = tarea.id;
    this.titulo = tarea.titulo;
    this.descripcion = tarea.descripcion;
    this.foto = tarea.foto;
    this.ubicacion = tarea.ubicacion;
  }

  async alternar(tarea: Tarea): Promise<void> {
    await this.tareaService.alternarCompletada(tarea.id);
  }

  async confirmarEliminar(tarea: Tarea): Promise<void> {
    const alerta = await this.alertCtrl.create({
      header: 'Eliminar tarea',
      message: `¿Seguro que quieres eliminar "${tarea.titulo}"? También se borrará la foto adjunta.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => void this.eliminar(tarea.id),
        },
      ],
    });
    await alerta.present();
  }

  async eliminar(id: string): Promise<void> {
    if (this.idEnEdicion === id) {
      this.limpiarFormulario();
    }
    await this.tareaService.eliminar(id);
    await this.avisar('Tarea eliminada.', 'medium');
  }

  cancelarEdicion(): void {
    this.limpiarFormulario();
  }

  private limpiarFormulario(): void {
    this.titulo = '';
    this.descripcion = '';
    this.foto = null;
    this.ubicacion = null;
    this.idEnEdicion = null;
  }

  /** Muestra el motivo del fallo de un periférico con el tono adecuado. */
  private async informarFallo(resultado: ResultadoPeriferico<unknown>): Promise<void> {
    if (resultado.ok || resultado.motivo === 'cancelado') {
      return; // Cancelar no es un error: no se molesta al usuario.
    }

    const esPermiso =
      resultado.motivo === 'permiso-denegado' || resultado.motivo === 'permiso-bloqueado';
    await this.avisar(resultado.mensaje, esPermiso ? 'warning' : 'danger');
  }

  private async avisar(mensaje: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 2600,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}

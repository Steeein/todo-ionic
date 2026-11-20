import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { addIcons } from 'ionicons';
import {
  cameraOutline,
  checkmarkCircleOutline,
  codeSlashOutline,
  hardwareChipOutline,
  listOutline,
  locationOutline,
  peopleOutline,
  phonePortraitOutline,
} from 'ionicons/icons';
import { Subscription } from 'rxjs';

import { Tarea } from '../models/tarea.model';
import { TareaService } from '../services/tarea.service';

@Component({
  selector: 'app-acerca',
  templateUrl: './acerca.page.html',
  styleUrls: ['./acerca.page.scss'],
  standalone: false,
})
export class AcercaPage implements OnInit, OnDestroy {
  tecnologias = [
    { nombre: 'Ionic Framework', version: '9.0.0' },
    { nombre: 'Angular', version: '22.2.3' },
    { nombre: 'Capacitor', version: '8.5.3' },
    { nombre: 'Node.js', version: '24.20.0' },
    { nombre: 'TypeScript', version: '6.0' },
  ];

  plugins = [
    { nombre: '@capacitor/camera', uso: 'Cámara y galería' },
    { nombre: '@capacitor/geolocation', uso: 'GPS del dispositivo' },
    { nombre: '@capacitor/motion', uso: 'Acelerómetro' },
    { nombre: '@capacitor/preferences', uso: 'Almacenamiento local' },
    { nombre: '@capacitor/filesystem', uso: 'Archivos de las fotos' },
  ];

  integrantes = ['Diego Abaroa', 'Claudio Ramos'];

  plataforma = Capacitor.getPlatform();
  tareas: Tarea[] = [];

  private suscripcion?: Subscription;

  private readonly tareaService = inject(TareaService);
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    addIcons({
      cameraOutline,
      checkmarkCircleOutline,
      codeSlashOutline,
      hardwareChipOutline,
      listOutline,
      locationOutline,
      peopleOutline,
      phonePortraitOutline,
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

  get totalTareas(): number {
    return this.tareas.length;
  }

  get conFoto(): number {
    return this.tareas.filter((tarea) => tarea.foto).length;
  }

  get conUbicacion(): number {
    return this.tareas.filter((tarea) => tarea.ubicacion).length;
  }
}

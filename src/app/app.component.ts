import { Component } from '@angular/core';
import { addIcons } from 'ionicons';
import { hardwareChipOutline, informationCircleOutline, listOutline } from 'ionicons/icons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  paginas = [
    { titulo: 'Mis Tareas', ruta: '/home', icono: 'list-outline' },
    { titulo: 'Periféricos', ruta: '/perifericos', icono: 'hardware-chip-outline' },
    { titulo: 'Acerca de', ruta: '/acerca', icono: 'information-circle-outline' },
  ];

  constructor() {
    addIcons({ listOutline, hardwareChipOutline, informationCircleOutline });
  }
}

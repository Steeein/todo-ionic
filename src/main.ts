import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { defineCustomElements } from '@ionic/pwa-elements/loader';

import { AppModule } from './app/app.module';

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.log(err));

// Habilita la cámara y el selector de archivos de Capacitor cuando la
// aplicación se ejecuta en un navegador (PWA Elements).
defineCustomElements(window);

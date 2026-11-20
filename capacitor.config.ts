import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.ipss.todoionic',
  appName: 'Mis Tareas',
  webDir: 'www',
  plugins: {
    // Textos que acompañan a la solicitud de permiso de cámara/galería.
    Camera: {
      androidxExifInterfaceVersion: '1.3.7',
    },
  },
};

export default config;

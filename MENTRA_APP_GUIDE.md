# **Guía de Integración: Creando tu MiniApp para Mentra Glasses**

Esta guía te ayudará a crear una MiniApp en **MentraOS** que se conecte con tu `numa_ai_api` para dotar a tus gafas de inteligencia en tiempo real.

---

## **1. Configuración Inicial**

1.  **Registro:** Crea una cuenta en la [Mentra Developer Console](https://console.mentraglass.com/).
2.  **Entorno de Desarrollo:**
    - Instala **Node.js v20.x**.
    - Usa **bun** o **npm** para gestionar paquetes.
    - Clona el SDK de MentraOS desde el [repositorio oficial](https://github.com/Mentra-Community/MentraOS).

---

## **2. Crear la MiniApp en la Consola**

En el portal de desarrolladores:
1.  Haz clic en **"Create New MiniApp"**.
2.  Define el nombre (ej. `Numa AI Assistant`) y una descripción corta.
3.  Obtén tu **App ID**, lo necesitarás para el código.

---

## **3. Estructura del Código (TypeScript SDK)**

Tu MiniApp debe realizar tres tareas principales: capturar audio, enviarlo a la API y mostrar la respuesta.

### **Ejemplo de Implementación (`index.ts`):**

```typescript
import { MentraApp, GlassesIO } from '@mentra/sdk';

const API_URL = 'https://tu-api-desplegada.com/api/v1/query';

const app = new MentraApp({
  id: 'tu-app-id',
  name: 'Numa AI Assistant',
});

// Evento al presionar el botón de las gafas (ej. botón derecho)
app.onButtonPress('right', async () => {
  console.log('Iniciando captura de audio...');
  
  try {
    // 1. Capturar audio y convertir a texto (STT nativo de MentraOS)
    const transcript = await GlassesIO.captureTranscription();
    
    if (!transcript) {
      GlassesIO.displayMessage('No te escuché bien, intenta de nuevo.');
      return;
    }

    GlassesIO.displayMessage('Procesando...');

    // 2. Enviar a numa_ai_api
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: transcript }),
    });

    const data = await response.json();

    // 3. Mostrar respuesta en el display de las gafas
    if (data.response) {
      GlassesIO.displayMessage(data.response);
      // Opcional: Leer en voz alta
      GlassesIO.speak(data.response);
    }

  } catch (error) {
    console.error('Error en la integración:', error);
    GlassesIO.displayMessage('Error de conexión con Numa AI');
  }
});

app.run();
```

---

## **4. Despliegue y Pruebas**

1.  **Local Testing:** Usa el simulador de MentraOS incluido en el SDK para probar el flujo sin necesidad de las gafas físicas inicialmente.
2.  **Sideloading:** Una vez que el código esté listo, puedes cargar la app en tus gafas a través de la consola de desarrollador seleccionando **"Deploy to My Devices"**.

---

## **5. Mejores Prácticas**

- **Concisión:** Las respuestas de Groq deben ser cortas, ya que el espacio en el display de las gafas es limitado.
- **Feedback Visual:** Siempre muestra un mensaje como "Escuchando..." o "Pensando..." para que el usuario sepa que la app está trabajando.
- **Manejo de Errores:** Asegúrate de manejar casos de falta de internet o fallos en la API de forma elegante.

---

Para más detalles técnicos, consulta la [Documentación Oficial de MentraOS](https://docs.mentraglass.com/).

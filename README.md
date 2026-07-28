# 🤖 Bot de Twitch con Dashboard SPA, Spotify & Overlays para OBS

Sistema modular e inteligente en **Node.js** para administrar el chat de Twitch (IRC), lectura por voz con control granular (**Text-to-Speech con EdgeTTS**), reproducción e interacción con **Spotify Web API**, detección de estado en vivo del stream mediante **Twitch Helix API**, y **Overlays personalizables para OBS Studio / Streamlabs**.

---

## 📋 Tabla de Contenidos
- [Requisitos Previos](#-requisitos-previos)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Paso 1: Configurar la Aplicación en Twitch](#paso-1-configurar-la-aplicación-en-twitch)
- [Paso 2: Configurar las Variables de Entorno (.env)](#paso-2-configurar-las-variables-de-entorno-env)
- [Paso 3: Instalación de Dependencias](#paso-3-instalación-de-dependencias)
- [Paso 4: Ejecución de la Aplicación](#paso-4-ejecución-de-la-aplicación)
- [💬 Comandos del Chat de Twitch](#-comandos-del-chat-de-twitch)
- [🖥️ Dashboard Web & Indicadores en Tiempo Real](#️-dashboard-web--indicadores-en-tiempo-real)
- [🔊 Sistema Multivoz TTS e Interruptores Granulares](#-sistema-multivoz-tts-e-interruptores-granulares)
- [🎨 Overlays para OBS Studio / Streamlabs](#-overlays-para-obs-studio--streamlabs)

---

## 📌 Requisitos Previos

1. **Node.js** (v18.0.0 o superior).
2. **Cuenta de Twitch** activa (bot o streamer).
3. **Spotify Premium** (para control e integración de la reproducción en tiempo real).
4. **OBS Studio** o **Streamlabs Desktop** (para fuentes de navegador).

---

## 📁 Estructura del Proyecto

```text
bot-twitch/
├── public/               # Frontend Single-Page Application (SPA)
│   ├── views/            # Vistas parciales HTML dinámicas (SPA)
│   │   ├── dashboard.html # Vista principal con reproductor, logs y cola
│   │   ├── search.html    # Buscador de canciones Spotify
│   │   ├── history.html   # Historial de pedidos
│   │   ├── overlays.html  # Editor visual y configurador de Overlays para OBS
│   │   └── settings.html  # Formulario de ajustes del sistema
│   ├── app.js            # Lógica SPA, sincronización en tiempo real (SSE) y controles
│   ├── overlay.html      # Widget de Spotify & Subtítulos para OBS
│   ├── alert-follower.html # Overlay configurable de Alertas de Seguidores
│   ├── style.css         # Sistema de diseño CSS responsivo (Glassmorphism)
│   └── index.html        # Shell HTML principal (Sidebar + Header + Status Bar)
├── src/                  # Backend en Node.js (Módulos ES)
│   ├── config.js         # Configuración centralizada (.env)
│   ├── logger.js         # Logging estructurado con Winston
│   ├── auth.js           # Flujo OAuth 2.0, tokens y detección de Stream (Helix API)
│   ├── spotifyAuth.js    # Flujo OAuth 2.0 y renovación de tokens de Spotify
│   ├── spotify.js        # Integración con Spotify Web API (Play, Skip, Polling)
│   ├── server.js         # Servidor HTTP, SSE (/api/events) y API REST
│   ├── chat.js           # Cliente IRC tmi.js e integración con comandos
│   └── voz.js            # Motor TTS (EdgeTTS + reproductor de audio secuencial)
├── logs/                 # Archivos de registro (app.log, chat.log)
├── tokens/               # Almacenamiento seguro de tokens OAuth
├── index.js              # Punto de entrada del bot
├── .env                  # Variables de entorno privadas
└── package.json          # Dependencias y scripts
```

---

## Paso 1: Configurar la Aplicación en Twitch

1. Dirígete a la [Consola de Desarrolladores de Twitch](https://dev.twitch.tv/console/apps).
2. Registra tu aplicación con **OAuth Redirect URL**: `http://localhost:3000`.
3. Copia el **Client ID** y genera un **Client Secret**.

---

## Paso 2: Configurar las Variables de Entorno (.env)

Crea el archivo `.env` en la raíz del proyecto basándote en `.env.example`:

```env
# Credenciales de Twitch
TWITCH_CLIENT_ID=tu_client_id_aqui
TWITCH_CLIENT_SECRET=tu_client_secret_aqui
TWITCH_CHANNEL=nombre_de_tu_canal

# Credenciales de Spotify
SPOTIFY_CLIENT_ID=tu_spotify_client_id
SPOTIFY_CLIENT_SECRET=tu_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/spotify-callback

# Servidor Web & Dashboard
PORT=3000
REDIRECT_URI=http://localhost:3000
```

---

## Paso 3: Instalación de Dependencias

```bash
npm install
```

---

## Paso 4: Ejecución de la Aplicación

Para iniciar el bot y el servidor web:

```bash
npm start
```

- **Dashboard Web**: Accede desde tu navegador a `http://localhost:3000/`
- **Overlay Spotify para OBS**: `http://127.0.0.1:3000/overlay`
- **Overlay Alerta de Seguidores**: `http://127.0.0.1:3000/alert-follower`

---

## 💬 Comandos del Chat de Twitch

### 🎵 Comandos de Spotify *(Respuestas solo por texto en chat, sin audio TTS)*
| Comando | Descripción |
| :--- | :--- |
| `!sr <canción o artista>` | Busca en Spotify y añade la canción a la cola de reproducción. |
| `!cancion` | Muestra en el chat la canción que está sonando actualmente. |
| `!siguiente` | Salta la canción actual en Spotify a la siguiente de la cola. |
| `!cola` | Muestra las próximas canciones en la cola de reproducción. |

### 🎙️ Comandos de Texto a Voz (TTS)
| Comando | Descripción |
| :--- | :--- |
| `!tts <mensaje>` | Lee el mensaje en voz alta usando la **Voz General / Predeterminada**. |
| `!m <mensaje>` | Lee el mensaje usando la **Voz de Mujer** (`es-MX-DaliaNeural`). |
| `!h <mensaje>` | Lee el mensaje usando la **Voz de Hombre** (`es-MX-JorgeNeural`). |

### 🤖 Comandos Generales
| Comando | Descripción |
| :--- | :--- |
| `!comandos` (`!help`) | Lista en el chat y lee por voz todos los comandos activos del bot. |

---

## 🖥️ Dashboard Web & Indicadores en Tiempo Real

El dashboard funciona como una **Single Page Application (SPA)** modular moderna:
- **Gestión de la Cola de Spotify**: Icono de papelera (🗑️) junto a cada canción en la cola para eliminarla o saltarla con 1 clic.
- **Estado de Stream en Vivo**: Detecta automáticamente si estás transmitiendo en directo en Twitch (`Stream: En Vivo`) u offline (`Stream: Offline`) consultando Twitch Helix API.
- **Control de Voces TTS en Tiempo Real**: Tres chips interactivos (`Gen`, `Mujer`, `Hombre`) en la barra superior te permiten silenciar o activar cualquiera de las 3 voces individualmente con un solo clic.
- **Monitor de Chat y Subtítulos**: Registra mensajes en vivo, lecturas por voz y eventos del sistema sin parpadeos vía Server-Sent Events (SSE).

---

## 🔊 Sistema Multivoz TTS e Interruptores Granulares

- **Voz General (`Gen`)**: Utilizada en `!tts` o lectura automática del chat.
- **Voz Femenina (`Mujer`)**: Activada mediante el comando `!m <mensaje>`.
- **Voz Masculina (`Hombre`)**: Activada mediante el comando `!h <mensaje>`.
- **Control Granular**: Puedes deshabilitar únicamente la voz masculina sin afectar la de mujer ni la general.
- **Silenciador General**: Botón de altavoz global para pausar todo el audio TTS de inmediato.

---

## 🎨 Overlays para OBS Studio / Streamlabs

### 1. Overlay de Spotify & Subtítulos (`/overlay`)
- Muestra la portada del álbum en HD, título, artista y subtítulos flotantes de voz.
- Personalizable mediante parámetros CSS/URL (`accent`, `opacity`, `theme`, `hideLabel`).

### 2. Overlay de Alertas de Seguidores (`/alert-follower`)
- Editor visual integrado en el Dashboard (`Overlays OBS`).
- Múltiples diseños (Centrado, Banner, Compacto, Solo texto).
- Soporte para **URLs de GIFs animados e imágenes personalizadas** con accesos directos de prueba.
- Opciones para **quitar bordes** y activar **fondo 100% transparente**.
- Integración de efectos de sonido (chime o URL personalizada de MP3).

---

## 🛡️ Seguridad y Buenas Prácticas

- Mantén protegidos tus archivos `.env` y los tokens guardados en `tokens/*.json`. Nunca los subas a repositorios públicos.

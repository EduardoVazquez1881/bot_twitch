# 🤖 Bot de Twitch con Autenticación OAuth 2.0 & Chat IRC

Sistema completo en **Node.js** para autenticarse con la API de Twitch mediante **OAuth 2.0 (Confidencial)** en `localhost` con HTTPS autofirmado, y conectarse al chat del canal a través de **IRC (tmi.js)**.

---

## 📋 Tabla de Contenidos
- [Requisitos Previos](#-requisitos-previos)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Paso 1: Configurar la Aplicación en Twitch](#paso-1-configurar-la-aplicación-en-twitch)
- [Paso 2: Configurar las Variables de Entorno (.env)](#paso-2-configurar-las-variables-de-entorno-env)
- [Paso 3: Instalación de Dependencias](#paso-3-instalación-de-dependencias)
- [Paso 4: Ejecución de la Aplicación](#paso-4-ejecución-de-la-aplicación)
- [⚙️ Cómo Funciona el Sistema](#️-cómo-funciona-el-sistema)
  - [Autenticación OAuth 2.0 & Certificados SSL](#1-autenticación-oauth-20--certificados-ssl)
  - [Gestión y Renovación Automática de Tokens](#2-gestión-y-renovación-automática-de-tokens)
  - [Conexión al Chat e Interacción](#3-conexión-al-chat-e-interacción)
  - [Sistema de Logging](#4-sistema-de-logging)

---

## 📌 Requisitos Previos

1. **Node.js** (v18.0.0 o superior instalado).
2. **Cuenta de Twitch** activa (la cuenta del bot o tu cuenta de streamer).

---

## 📁 Estructura del Proyecto

```text
bot-twitch/
├── src/                  # Código fuente del bot
│   ├── config.js         # Configuración centralizada (.env y rutas)
│   ├── logger.js         # Módulo de logging profesional con Winston
│   ├── auth.js           # Servidor HTTPS, flujo OAuth 2.0 y gestión de tokens
│   ├── chat.js           # Cliente IRC tmi.js y comandos de voz
│   └── voz.js            # Motor TTS de lectura por voz (EdgeTTS + mpg123)
├── logs/                 # Archivos de logs del sistema
│   ├── app.log           # Historial de logs del sistema y errores
│   └── chat.log          # Historial de mensajes de chat guardados
├── tokens/               # Almacenamiento seguro de credenciales OAuth
│   └── tokens.json       # Tokens de Twitch (access_token y refresh_token)
├── certs/                # Certificados SSL para HTTPS local
│   ├── cert.pem          # Certificado SSL autofirmado para localhost
│   └── key.pem           # Clave privada SSL autofirmada
├── test/                 # Pruebas y scripts de prueba
│   └── test-voice.js     # Script de prueba de voz
├── index.js              # Punto de entrada principal
├── .env                  # Variables de entorno privadas
├── .env.example          # Plantilla de ejemplo de variables de entorno
└── package.json          # Dependencias y scripts
```

---

## Paso 1: Configurar la Aplicación en Twitch

1. Dirígete a la [Consola de Desarrolladores de Twitch](https://dev.twitch.tv/console/apps).
2. Inicia sesión con tu cuenta de Twitch y haz clic en **Register Your Application** (Registrar tu aplicación).
3. Completa los campos del formulario:
   - **Name**: Nombre de tu bot (debe ser único en Twitch).
   - **OAuth Redirect URLs**: `https://localhost:3000`
   - **Category**: `Chat Bot` o `Application`
   - **Client Type**: Selecciona **Confidential** (Confidencial).
4. Haz clic en **Create**.
5. En la lista de aplicaciones, haz clic en **Manage** sobre tu aplicación creada.
6. Copia el **Client ID**.
7. Haz clic en **New Secret** (Nuevo Secret) y copia el **Client Secret** generado.

---

## Paso 2: Configurar las Variables de Entorno (.env)

Crea o edita el archivo `.env` en la raíz del proyecto (puedes basarte en `.env.example`):

```env
# Credenciales de tu Aplicación en Twitch Console
TWITCH_CLIENT_ID=tu_client_id_aqui
TWITCH_CLIENT_SECRET=tu_client_secret_aqui

# Nombre del canal de Twitch al que se unirá el bot (sin espacios)
TWITCH_CHANNEL=nombre_de_tu_canal

# Configuración del servidor HTTPS local para OAuth
PORT=3000
REDIRECT_URI=https://localhost:3000
SCOPES=user:read:chat user:write:chat chat:read chat:edit

# Opciones de Voz TTS (EdgeTTS)
TTS_ALL_MESSAGES=false # Si lo cambias a true, el bot leerá todos los mensajes del chat
```

---

## 🔊 Integración de Sistema Multivoz (Text-to-Speech con EdgeTTS)

El bot cuenta con un sistema de **3 voces diferenciadas**:

1. **Voz General del Chat (3ra Voz - `VOICE_DEFAULT`)**:
   - **Comportamiento**: Lee automáticamente en voz alta todos los mensajes normales que envíen los espectadores en el chat: `"[Usuario] dice: [Mensaje]"`.
   - **Voz por defecto**: `es-US-PalomaNeural` (Voz femenina en español neutro).

2. **Comando `!m <mensaje>` (Voz Femenina - `VOICE_FEMALE`)**:
   - Escribir `!m Hola a todos` reproducirá el mensaje únicamente con la voz femenina secundaria (`es-MX-DaliaNeural`).

3. **Comando `!h <mensaje>` (Voz Masculina - `VOICE_MALE`)**:
   - Escribir `!h Saludos al canal` reproducirá el mensaje únicamente con la voz masculina (`es-MX-JorgeNeural`).

4. **Cola de reproducción secuencial**:
   - Todos los mensajes de voz se encolan para reproducirse secuencialmente en orden sin superposición.

---

## Paso 3: Instalación de Dependencias

Ejecuta el siguiente comando en la terminal para instalar todos los paquetes necesarios:

```bash
npm install
```

---

## Paso 4: Ejecución de la Aplicación

Para iniciar el bot de Twitch, ejecuta:

```bash
npm start
```

O directamente con Node:

```bash
node index.js
```

---

## ⚙️ Cómo Funciona el Sistema

### 1. Autenticación OAuth 2.0 & Certificados SSL
- En el primer inicio, el sistema genera automáticamente un certificado SSL autofirmado (`cert.pem` y `key.pem`) para ejecutar un servidor HTTPS seguro en `https://localhost:3000`.
- Se abrirá automáticamente tu navegador predeterminado cargando la URL de autorización de Twitch (`https://id.twitch.tv/oauth2/authorize`).
- Una vez que haces clic en **Autorizar**, Twitch redirige a `https://localhost:3000/callback` con un código de autorización.
- El servidor HTTPS captura el código, lo intercambia por un `access_token` y un `refresh_token`, los guarda en `tokens.json` y cierra el servidor local.

### 2. Gestión y Renovación Automática de Tokens
- El sistema valida el estado del token guardado en `tokens.json`.
- Si el `access_token` ha expirado o está a menos de 5 minutos de expirar, el módulo `auth.js` solicita automáticamente un nuevo `access_token` a Twitch utilizando el `refresh_token` sin requerir que abras el navegador nuevamente.
- Si Twitch devuelve un error de autenticación `401 Unauthorized` en cualquier momento, el bot renovará el token de inmediato de forma transparente.

### 3. Conexión al Chat e Interacción
- El bot se conecta al servidor IRC seguro de Twitch (`irc.chat.twitch.tv:6697`) utilizando la librería `tmi.js` y el token de acceso obtenido (`oauth:<access_token>`).
- Se une al canal configurado en `TWITCH_CHANNEL`.
- **Comando integrado de prueba**: Escribe `!ping` en el chat del canal y el bot responderá `@usuario ¡pong! 🏓`.
- Si se pierde la conexión de red, el sistema incluye un mecanismo de reconexión automática con reintentos incrementales.

### 4. Sistema de Logging
- Todos los mensajes de chat enviados por los usuarios se registran en el archivo `chat.log` incluyendo timestamp y nombre de usuario.
- Todos los eventos de sistema, advertencias y errores se registran en `app.log` y en la consola formateados con colores.

---

## 🛡️ Seguridad
- **Nunca subas tu archivo `.env` o `tokens.json` a repositorios públicos.**
- El `TWITCH_CLIENT_SECRET` y los tokens de acceso permanecen protegidos localmente.
# bot_twitch

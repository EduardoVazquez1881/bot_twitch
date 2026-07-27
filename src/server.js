import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { URL } from 'url';
import { config } from './config.js';
import { logger } from './logger.js';
import { skipTrack, getCurrentlyPlaying, getSpotifyQueue } from './spotify.js';
import { hablarTexto } from './voz.js';

let sseClients = [];
export let isTTSMuted = false;
let lastPlayingTrackKey = null;

/**
 * Transmite un evento en tiempo real a todos los clientes conectados a través de SSE
 */
export function broadcastEvent(eventType, payload) {
  const dataString = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.res.write(dataString);
    } catch (err) {
      // Ignorar errores de clientes desconectados
    }
  });
}

/**
 * Bucle en segundo plano que detecta en tiempo real cuando cambia la canción en Spotify
 * (por ejemplo al cambiar desde el teclado, app móvil o PC) y actualiza la Web y el Overlay.
 */
export function startSpotifyPollingLoop(intervalMs = 4000) {
  setInterval(async () => {
    try {
      const playing = await getCurrentlyPlaying();
      const currentKey = playing ? `${playing.track}-${playing.artist}` : 'none';

      if (currentKey !== lastPlayingTrackKey) {
        lastPlayingTrackKey = currentKey;
        const queueData = await getSpotifyQueue().catch(() => ({ queue: [] }));

        // Transmitir inmediatamente la canción y la cola a la web y OBS
        broadcastEvent('spotify', playing);
        broadcastEvent('status', {
          isMuted: isTTSMuted,
          spotify: playing,
          queue: queueData.queue
        });

        if (playing) {
          logger.info(`Sincronización en tiempo real: Sonando "${playing.track}" - ${playing.artist}`);
        }
      }
    } catch (err) {
      // Ignorar errores silenciosos de polling
    }
  }, intervalMs);
}

/**
 * Determina el tipo MIME de los archivos estáticos
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Manejador principal de peticiones HTTP/HTTPS
 */
export async function handleServerRequest(req, res) {
  const parsedUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. API: Server-Sent Events (/api/events)
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n');

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    req.on('close', () => {
      sseClients = sseClients.filter((c) => c.id !== clientId);
    });

    // Enviar estado inicial
    const initialPlaying = await getCurrentlyPlaying().catch(() => null);
    const initialQueue = await getSpotifyQueue().catch(() => ({ queue: [] }));
    res.write(`event: status\ndata: ${JSON.stringify({ isMuted: isTTSMuted, spotify: initialPlaying, queue: initialQueue.queue })}\n\n`);
    return;
  }

  // 2. API: Estado (/api/status)
  if (pathname === '/api/status' && req.method === 'GET') {
    const currentlyPlaying = await getCurrentlyPlaying().catch(() => null);
    const queueData = await getSpotifyQueue().catch(() => ({ queue: [] }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      isMuted: isTTSMuted,
      spotify: currentlyPlaying,
      queue: queueData.queue,
      twitchChannel: config.channel
    }));
    return;
  }

  // 2b. API: Cola (/api/queue)
  if (pathname === '/api/queue' && req.method === 'GET') {
    const queueData = await getSpotifyQueue().catch(() => ({ queue: [] }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(queueData));
    return;
  }

  // 3. API: Control (/api/control)
  if (pathname === '/api/control' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (payload.action === 'toggleMute') {
          isTTSMuted = Boolean(payload.value);
          logger.info(`TTS ${isTTSMuted ? 'Silenciado' : 'Activado'} desde la interfaz web.`);
          broadcastEvent('status', { isMuted: isTTSMuted });
        } else if (payload.action === 'skipSpotify') {
          await skipTrack();
        } else if (payload.action === 'testVoice') {
          hablarTexto('Prueba de voz desde la interfaz web.', config.voiceDefault, 'es-MX');
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 4. Servir archivos estáticos del Dashboard y OBS Overlay desde public/
  let filePath = path.join(config.projectRoot, 'public', pathname === '/' || pathname === '/dashboard' ? 'index.html' : pathname === '/overlay' ? 'overlay.html' : pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 404 No encontrado
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>404 - Página no encontrada</h1>');
}

/**
 * Crea e inicia los servidores web:
 * - HTTPS en puerto 3000 (Dashboard en navegador)
 * - HTTP en puerto 3001 (Overlay para OBS sin problemas de SSL)
 */
export function startWebServer() {
  // Servidor HTTPS principal en puerto 3000 para el dashboard
  const options = {
    key: fs.readFileSync(config.sslKeyFile),
    cert: fs.readFileSync(config.sslCertFile)
  };

  const httpsServer = https.createServer(options, handleServerRequest);

  httpsServer.listen(config.port, () => {
    logger.info(`Interfaz Web & Dashboard accesible en: https://localhost:${config.port}/`);

    // Iniciar detector en tiempo real de cambios de canción en Spotify
    startSpotifyPollingLoop(2500);
  });

  httpsServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`El puerto ${config.port} ya está en uso.`);
    } else {
      logger.error(`Error en servidor web HTTPS: ${err.message}`);
    }
  });

  // Servidor HTTP en puerto 3001 exclusivo para OBS (sin bloqueo de certificados SSL)
  const httpPort = Number(config.port) + 1;
  const httpServer = http.createServer(handleServerRequest);

  httpServer.listen(httpPort, '0.0.0.0', () => {
    logger.info(`Overlay para OBS (HTTP): http://127.0.0.1:${httpPort}/overlay`);
  });

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`El puerto HTTP ${httpPort} ya está en uso.`);
    }
  });

  return httpsServer;
}

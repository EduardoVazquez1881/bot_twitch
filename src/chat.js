import tmi from 'tmi.js';
import { config } from './config.js';
import { logger, logChatMessage } from './logger.js';
import { getValidAccessToken } from './auth.js';
import { hablarTexto } from './voz.js';
import { getCurrentlyPlaying, searchAndQueueTrack, skipTrack, getSpotifyQueue } from './spotify.js';

import { broadcastEvent } from './server.js';

export class TwitchChatBot {
  constructor() {
    this.client = null;
    this.accessToken = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async initialize() {
    try {
      this.accessToken = await getValidAccessToken();
      const channelName = config.channel.replace('#', '').toLowerCase();

      const options = {
        options: {
          debug: false
        },
        connection: {
          reconnect: true,
          secure: true,
          port: 6697,
          timeout: 10000
        },
        identity: {
          username: channelName,
          password: `oauth:${this.accessToken}`
        },
        channels: [channelName]
      };

      this.client = new tmi.Client(options);
      this.setupEventListeners();

      logger.info(`Conectando al chat de Twitch IRC para el canal #${channelName}...`);
      await this.client.connect();
      this.reconnectAttempts = 0;
    } catch (error) {
      logger.error(`Error inicializando TwitchChatBot: ${error.message}`);
      await this.handleConnectionFailure();
    }
  }

  setupEventListeners() {
    if (!this.client) return;

    this.client.on('connected', (address, port) => {
      logger.info(`¡Conectado exitosamente al chat IRC de Twitch (${address}:${port})!`);
    });

    this.client.on('disconnected', (reason) => {
      logger.warn(`Desconectado del chat IRC de Twitch. Razón: ${reason}`);
    });

    this.client.on('reconnect', () => {
      logger.info('Reconectando al servidor de chat de Twitch...');
    });

    this.client.on('message', async (channel, tags, message, self) => {
      const username = tags['display-name'] || tags.username || 'Desconocido';
      
      // Registrar mensaje en log y transmitir a Dashboard
      logChatMessage(username, message);
      broadcastEvent('chat', { username, message });

      // Ignorar mensajes enviados por el propio bot
      if (self) return;

      const trimmedMessage = message.trim();
      const lowerMsg = trimmedMessage.toLowerCase();      // Comandos de Spotify
      if (lowerMsg === '!song' || lowerMsg === '!cancion' || lowerMsg === '!np') {
        const currentlyPlaying = await getCurrentlyPlaying();
        if (currentlyPlaying) {
          const textMsg = `Sonando ahora: ${currentlyPlaying.track} - ${currentlyPlaying.artist}`;
          await this.sendMessage(channel, `@${username} ${textMsg}`);
          hablarTexto(`Sonando ahora: ${currentlyPlaying.track} de ${currentlyPlaying.artist}`, config.voiceDefault, 'es-MX');
        } else {
          await this.sendMessage(channel, `@${username} No hay ninguna canción reproduciéndose en Spotify actualmente.`);
          hablarTexto('No hay ninguna canción reproduciéndose en Spotify actualmente.', config.voiceDefault, 'es-MX');
        }
      } else if (lowerMsg.startsWith('!sr ') || lowerMsg.startsWith('!pedir ')) {
        const partes = trimmedMessage.split(' ');
        const query = partes.slice(1).join(' ').trim();
        if (query) {
          const res = await searchAndQueueTrack(query);
          if (res.success) {
            await this.sendMessage(channel, `@${username} Canción añadida a la cola: ${res.trackName} - ${res.artistName}`);
            hablarTexto(`${username} añadió a la cola de Spotify: ${res.trackName} de ${res.artistName}`, config.voiceDefault, 'es-MX');
          } else {
            await this.sendMessage(channel, `@${username} ${res.message}`);
          }
        } else {
          await this.sendMessage(channel, `@${username} Uso correcto: !sr <nombre de la canción o artista>`);
        }
      } else if (lowerMsg === '!skip' || lowerMsg === '!siguiente') {
        const skipped = await skipTrack();
        if (skipped) {
          await this.sendMessage(channel, `@${username} Canción saltada en Spotify.`);
          hablarTexto(`${username} saltó la canción en Spotify.`, config.voiceDefault, 'es-MX');
        } else {
          await this.sendMessage(channel, `@${username} No se pudo saltar la canción. Asegúrate de tener Spotify activo.`);
        }
      } else if (lowerMsg === '!queue' || lowerMsg === '!cola') {
        const queueData = await getSpotifyQueue();
        if (queueData && queueData.queue && queueData.queue.length > 0) {
          const nextSongs = queueData.queue.slice(0, 3).map((item, idx) => `${idx + 1}. ${item.track} - ${item.artist}`).join(' | ');
          const textMsg = `Próximas canciones: ${nextSongs}`;
          await this.sendMessage(channel, `@${username} ${textMsg}`);
          hablarTexto(`Próxima canción en cola: ${queueData.queue[0].track} de ${queueData.queue[0].artist}`, config.voiceDefault, 'es-MX');
        } else {
          await this.sendMessage(channel, `@${username} La cola de Spotify está vacía.`);
          hablarTexto('La cola de Spotify está vacía.', config.voiceDefault, 'es-MX');
        }

      // Comandos de voz explícitos por género
      } else if (lowerMsg.startsWith('!m ')) {
        const mensajeTexto = trimmedMessage.substring(3).trim();
        if (mensajeTexto) {
          logger.info(`Comando !m (Voz Mujer) de ${username}: "${mensajeTexto}"`);
          hablarTexto(`${username} dice: ${mensajeTexto}`, config.voiceFemale, 'es-MX');
        }
      } else if (lowerMsg.startsWith('!h ')) {
        const mensajeTexto = trimmedMessage.substring(3).trim();
        if (mensajeTexto) {
          logger.info(`Comando !h (Voz Hombre) de ${username}: "${mensajeTexto}"`);
          hablarTexto(`${username} dice: ${mensajeTexto}`, config.voiceMale, 'es-MX');
        }
      } else if (lowerMsg === '!ping') {
        logger.info(`Comando !ping detectado de ${username}. Respondiendo !pong con voz`);
        await this.sendMessage(channel, `@${username} ¡pong!`);
        hablarTexto('¡Pong!', config.voiceDefault, 'es-MX');
      } else if (lowerMsg === '!bot') {
        await this.sendMessage(channel, `@${username} Bot de Twitch activo.`);
        hablarTexto('Bot de Twitch activo.', config.voiceDefault, 'es-MX');
      } else if (lowerMsg.startsWith('!habla ') || lowerMsg.startsWith('!tts ') || lowerMsg.startsWith('!say ')) {
        const partes = trimmedMessage.split(' ');
        const textoAHablar = partes.slice(1).join(' ').trim();
        if (textoAHablar) {
          logger.info(`Comando de voz recibido de ${username}: "${textoAHablar}"`);
          hablarTexto(textoAHablar, config.voiceDefault, 'es-MX');
        }
      } else if (config.ttsAllMessages) {
        // Lectura automática de cualquier mensaje del chat usando la 3ra voz (VOICE_DEFAULT)
        logger.info(`Lectura automática (Voz General) de ${username}: "${trimmedMessage}"`);
        hablarTexto(`${username} dice: ${trimmedMessage}`, config.voiceDefault, 'es-MX');
      }
    });

    this.client.on('notice', (channel, msgid, message) => {
      logger.warn(`Aviso de Twitch IRC [${msgid}]: ${message}`);
      if (msgid === 'login_unsuccessful' || msgid === 'authentication_failed') {
        logger.error('Error de autenticación IRC. Renovando token...');
        this.reconnectWithFreshToken();
      }
    });
  }

  async sendMessage(channel, message) {
    if (!this.client) {
      logger.error('No se puede enviar mensaje: cliente IRC no inicializado.');
      return;
    }
    try {
      await this.client.say(channel, message);
      logChatMessage('BOT', message);
    } catch (err) {
      logger.error(`Error al enviar mensaje al chat: ${err.message}`);
    }
  }

  async reconnectWithFreshToken() {
    try {
      if (this.client) {
        await this.client.disconnect().catch(() => {});
      }
      logger.info('Obteniendo nuevo access_token tras fallo de autenticación IRC...');
      this.accessToken = await getValidAccessToken();
      
      if (this.client) {
        this.client.opts.identity.password = `oauth:${this.accessToken}`;
        await this.client.connect();
        logger.info('Reconexión exitosa con nuevo token.');
      }
    } catch (err) {
      logger.error(`Fallo en reconexión con nuevo token: ${err.message}`);
    }
  }

  async handleConnectionFailure() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(5000 * this.reconnectAttempts, 30000);
      logger.warn(`Reintentando conexión al chat (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts}) en ${delay / 1000}s...`);
      setTimeout(() => this.initialize(), delay);
    } else {
      logger.error('Se alcanzó el límite máximo de reintentos de conexión IRC.');
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (err) {
        // Ignorar silenciósamente errores de socket ya cerrado
      }
      logger.info('Desconectado del chat de Twitch.');
    }
  }
}

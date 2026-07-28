import { EdgeTTS } from 'node-edge-tts';
import playsound from 'play-sound';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { logger } from './logger.js';
import { broadcastEvent, isTTSMuted, voiceStatus } from './server.js';
import { config } from './config.js';

const sound = playsound();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cola de reproducción de audio para evitar superposición y colisión de archivos
const audioQueue = [];
let isProcessingQueue = false;

export async function generarAudio(texto, voice = 'es-MX-DaliaNeural', lang = 'es-MX', outputFile = './audio.mp3') {
  try {
    const tts = new EdgeTTS({ voice, lang });
    await tts.ttsPromise(texto, outputFile);
    return true;
  } catch (error) {
    const detail = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    logger.error(`Error generando TTS para "${texto}": ${detail}`);
    return false;
  }
}

export function reproducirAudio(audioFile = './audio.mp3') {
  return new Promise((resolve, reject) => {
    // Intentar mpg123 primero (reproductor MP3 nativo en Linux)
    const player = spawn('mpg123', ['-q', audioFile]);

    player.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        sound.play(audioFile, (err) => {
          if (err) {
            logger.error(`Error al reproducir audio ${audioFile}: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        });
      }
    });

    player.on('error', () => {
      sound.play(audioFile, (err) => {
        if (err) {
          logger.error(`Error al reproducir audio ${audioFile}: ${err.message}`);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

export function eliminarAudio(audioFile = './audio.mp3') {
  try {
    if (fs.existsSync(audioFile)) {
      fs.unlinkSync(audioFile);
    }
    return true;
  } catch (err) {
    logger.error(`Error eliminando archivo ${audioFile}: ${err.message}`);
    return false;
  }
}

/**
 * Procesa la cola de textos a voz de forma secuencial
 */
async function processQueue() {
  if (isProcessingQueue || audioQueue.length === 0) return;

  isProcessingQueue = true;
  const { texto, voice, lang } = audioQueue.shift();
  const tempFile = path.join(__dirname, `tts_${Date.now()}.mp3`);

  try {
    logger.info(`🔊 Generando y reproduciendo voz TTS: "${texto}"`);
    const generado = await generarAudio(texto, voice, lang, tempFile);
    if (generado) {
      await reproducirAudio(tempFile);
    }
  } catch (err) {
    logger.error(`Fallo en flujo de lectura de voz: ${err.message}`);
  } finally {
    eliminarAudio(tempFile);
    isProcessingQueue = false;
    // Procesar siguiente en cola
    processQueue();
  }
}

/**
 * Encola un texto para ser reproducido por voz TTS sin superposición
 */
export function hablarTexto(texto, voice = config.voiceDefault, lang = 'es-MX') {
  if (!texto || typeof texto !== 'string' || texto.trim().length === 0) return;

  // Transmitir evento SSE para Subtítulos en Vivo del Dashboard y OBS Overlay
  broadcastEvent('tts', { text: texto.trim(), voice });

  // Si el TTS está silenciado globalmente
  if (isTTSMuted) {
    logger.info(`[MUTE] TTS Silenciado Globalmente. Omitiendo audio: "${texto.trim()}"`);
    return;
  }

  // Verificar si la voz específica está desactivada individualmente desde la web
  if (voiceStatus) {
    if (voice === config.voiceFemale && !voiceStatus.female) {
      logger.info(`[MUTE] Voz de Mujer (!m) Desactivada. Omitiendo audio: "${texto.trim()}"`);
      return;
    }
    if (voice === config.voiceMale && !voiceStatus.male) {
      logger.info(`[MUTE] Voz de Hombre (!h) Desactivada. Omitiendo audio: "${texto.trim()}"`);
      return;
    }
    if (voice === config.voiceDefault && !voiceStatus.default) {
      logger.info(`[MUTE] Voz General Desactivada. Omitiendo audio: "${texto.trim()}"`);
      return;
    }
  }

  audioQueue.push({ texto: texto.trim(), voice, lang });
  processQueue();
}

// Compatibilidad con funciones previas
export { generarAudio as main, reproducirAudio as leerAudio, eliminarAudio as eliminar };

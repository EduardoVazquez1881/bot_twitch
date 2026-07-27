import { validateConfig, config } from './src/config.js';
import { logger } from './src/logger.js';
import { TwitchChatBot } from './src/chat.js';
import { getValidSpotifyToken } from './src/spotifyAuth.js';
import { startWebServer } from './src/server.js';

async function main() {
  logger.info('====================================================');
  logger.info('Iniciando Sistema de Autenticación & Bot Chat Twitch');
  logger.info('====================================================');

  validateConfig();

  // Iniciar Servidor Web & OBS Overlay
  startWebServer();

  // Inicializar autenticación de Spotify si las credenciales existen
  if (config.spotifyClientId && config.spotifyClientId !== 'tu_spotify_client_id' && config.spotifyClientId !== 'your_spotify_client_id_here') {
    try {
      logger.info('Inicializando autenticación con Spotify Web API...');
      await getValidSpotifyToken();
    } catch (err) {
      logger.warn(`Advertencia al inicializar Spotify: ${err.message}`);
    }
  }

  const bot = new TwitchChatBot();

  // Capturar señales de terminación para desconexión limpia
  const handleShutdown = async (signal) => {
    logger.info(`Recibida señal ${signal}. Desconectando bot de chat...`);
    await bot.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  try {
    await bot.initialize();
  } catch (error) {
    logger.error(`Error crítico en inicio del bot: ${error.message}`);
    process.exit(1);
  }
}

main();

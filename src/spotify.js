import axios from 'axios';
import { getValidSpotifyToken, refreshSpotifyAccessToken, loadStoredSpotifyTokens } from './spotifyAuth.js';
import { logger } from './logger.js';

function getSpotifyErrorMessage(err) {
  if (err.response && err.response.data) {
    if (typeof err.response.data === 'string') return err.response.data;
    if (err.response.data.error) {
      if (typeof err.response.data.error === 'string') return err.response.data.error;
      if (err.response.data.error.message) return err.response.data.error.message;
    }
    if (err.response.data.message) return err.response.data.message;
  }
  return err.message;
}

/**
 * Ejecuta una petición HTTP a la API de Spotify manejando refresco transparente de token en error 401
 */
async function spotifyApiRequest(method, endpoint, data = null, params = null) {
  let token = await getValidSpotifyToken();
  if (!token) {
    throw new Error('Spotify no está autenticado o falta la configuración en el archivo .env.');
  }

  const makeReq = async (accessToken) => {
    const configReq = {
      method,
      url: `https://api.spotify.com/v1${endpoint}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };
    if (params) configReq.params = params;
    if (data !== null) configReq.data = data;

    return axios(configReq);
  };

  try {
    return await makeReq(token);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      logger.warn('Petición a Spotify devolvió 401 Unauthorized. Refrescando token...');
      const stored = loadStoredSpotifyTokens();
      if (stored && stored.refresh_token) {
        const refreshed = await refreshSpotifyAccessToken(stored.refresh_token);
        return await makeReq(refreshed.access_token);
      }
    }
    throw err;
  }
}

/**
 * Obtiene la canción que está sonando actualmente en el reproductor de Spotify
 */
export async function getCurrentlyPlaying() {
  try {
    const res = await spotifyApiRequest('GET', '/me/player/currently-playing');
    if (!res.data || !res.data.item) {
      return null;
    }

    const item = res.data.item;
    const track = item.name;
    const artist = item.artists.map((a) => a.name).join(', ');
    const album = item.album ? item.album.name : '';
    const albumArt = item.album && item.album.images && item.album.images.length > 0 ? item.album.images[0].url : '';
    const isPlaying = res.data.is_playing;
    const url = item.external_urls ? item.external_urls.spotify : '';

    return {
      track,
      artist,
      album,
      albumArt,
      isPlaying,
      url
    };
  } catch (err) {
    if (err.response && (err.response.status === 204 || err.response.status === 404)) {
      return null;
    }
    logger.error(`Error obteniendo canción actual de Spotify: ${getSpotifyErrorMessage(err)}`);
    return null;
  }
}

/**
 * Obtiene la cola de reproducción de Spotify (próximas canciones)
 */
export async function getSpotifyQueue() {
  try {
    const res = await spotifyApiRequest('GET', '/me/player/queue');
    if (!res.data) return { currentlyPlaying: null, queue: [] };

    const currentlyPlaying = res.data.currently_playing ? {
      track: res.data.currently_playing.name,
      artist: res.data.currently_playing.artists.map((a) => a.name).join(', ')
    } : null;

    const queue = (res.data.queue || []).slice(0, 10).map((item) => ({
      track: item.name,
      artist: item.artists.map((a) => a.name).join(', '),
      album: item.album ? item.album.name : '',
      url: item.external_urls ? item.external_urls.spotify : ''
    }));

    return { currentlyPlaying, queue };
  } catch (err) {
    if (err.response && (err.response.status === 204 || err.response.status === 404)) {
      return { currentlyPlaying: null, queue: [] };
    }
    logger.error(`Error obteniendo la cola de Spotify: ${getSpotifyErrorMessage(err)}`);
    return { currentlyPlaying: null, queue: [] };
  }
}

/**
 * Busca una canción en Spotify y la añade a la cola del reproductor activo
 */
export async function searchAndQueueTrack(query) {
  if (!query || query.trim().length === 0) {
    return { success: false, message: 'Especifica el nombre de la canción o artista.' };
  }

  try {
    // 1. Buscar la canción
    const searchRes = await spotifyApiRequest('GET', '/search', null, {
      q: query.trim(),
      type: 'track',
      limit: 1
    });

    const tracks = searchRes.data?.tracks?.items;
    if (!tracks || tracks.length === 0) {
      return { success: false, message: `No se encontraron resultados para "${query}".` };
    }

    const matchedTrack = tracks[0];
    const trackUri = matchedTrack.uri;
    const trackName = matchedTrack.name;
    const artistName = matchedTrack.artists.map((a) => a.name).join(', ');
    const songUrl = matchedTrack.external_urls?.spotify || '';

    // 2. Añadir a la cola de reproducción activa
    try {
      await spotifyApiRequest('POST', '/me/player/queue', null, { uri: trackUri });
      logger.info(`Canción añadida a la cola de Spotify: ${trackName} - ${artistName}`);
      return {
        success: true,
        trackName,
        artistName,
        url: songUrl
      };
    } catch (queueErr) {
      const errMsg = getSpotifyErrorMessage(queueErr);
      logger.warn(`Error al encolar canción en Spotify: ${errMsg}`);
      if (queueErr.response && (queueErr.response.status === 404 || queueErr.response.status === 400)) {
        return {
          success: false,
          message: `Abre la app de Spotify en tu PC/celular con música sonando (${errMsg}).`
        };
      }
      return { success: false, message: `Error en Spotify: ${errMsg}` };
    }
  } catch (err) {
    const errMsg = getSpotifyErrorMessage(err);
    logger.error(`Error buscando/añadiendo canción a cola de Spotify: ${errMsg}`);
    return { success: false, message: `Error al procesar la canción: ${errMsg}` };
  }
}

/**
 * Salta a la siguiente canción en el reproductor de Spotify
 */
export async function skipTrack() {
  try {
    await spotifyApiRequest('POST', '/me/player/next');
    logger.info('Canción saltada en Spotify.');
    return true;
  } catch (err) {
    logger.error(`Error al saltar canción en Spotify: ${getSpotifyErrorMessage(err)}`);
    return false;
  }
}

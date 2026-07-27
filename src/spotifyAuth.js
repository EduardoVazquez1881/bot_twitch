import fs from 'fs';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import open from 'open';
import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

export function loadStoredSpotifyTokens() {
  try {
    if (fs.existsSync(config.spotifyTokensFile)) {
      const data = fs.readFileSync(config.spotifyTokensFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    logger.warn(`No se pudieron leer los tokens de Spotify: ${err.message}`);
  }
  return null;
}

export function saveSpotifyTokens(tokenData) {
  try {
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);
    const existing = loadStoredSpotifyTokens() || {};

    const tokensToSave = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || existing.refresh_token,
      scope: tokenData.scope || existing.scope,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    };

    fs.writeFileSync(config.spotifyTokensFile, JSON.stringify(tokensToSave, null, 2), 'utf8');
    logger.info('Tokens de Spotify guardados correctamente en tokens/spotify_tokens.json');
    return tokensToSave;
  } catch (err) {
    logger.error(`Error guardando tokens de Spotify: ${err.message}`);
    throw err;
  }
}

export async function refreshSpotifyAccessToken(refreshToken) {
  logger.info('Renovando access_token de Spotify usando refresh_token...');
  try {
    const authHeader = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const response = await axios.post('https://accounts.spotify.com/api/token', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`
      }
    });

    logger.info('Token de Spotify renovado exitosamente.');
    return saveSpotifyTokens(response.data);
  } catch (err) {
    const errorData = err.response ? JSON.stringify(err.response.data) : err.message;
    logger.error(`Error al renovar token de Spotify: ${errorData}`);
    throw err;
  }
}

export async function startSpotifyOAuthFlow() {
  if (!config.spotifyClientId || config.spotifyClientId === 'tu_spotify_client_id' || config.spotifyClientId === 'your_spotify_client_id_here') {
    logger.warn('SPOTIFY_CLIENT_ID no configurado en .env. Salteando autenticación de Spotify.');
    return null;
  }

  const redirectUri = new URL(config.spotifyRedirectUri);
  const callbackPort = redirectUri.port ? parseInt(redirectUri.port, 10) : (redirectUri.protocol === 'https:' ? 443 : 80);
  const callbackPath = redirectUri.pathname || '/spotify-callback';
  const isHttps = redirectUri.protocol === 'https:';

  const authUrl = `https://accounts.spotify.com/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id: config.spotifyClientId,
    scope: config.spotifyScopes.join(' '),
    redirect_uri: config.spotifyRedirectUri
  }).toString();

  return new Promise((resolve, reject) => {
    const requestHandler = async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `${redirectUri.protocol}//localhost:${callbackPort}`);
        if (reqUrl.pathname === callbackPath) {
          const code = reqUrl.searchParams.get('code');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>Error de Autenticación en Spotify</h1><p>${error}</p>`);
            server.close();
            return reject(new Error(`Spotify Auth Error: ${error}`));
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>¡Autenticación con Spotify Exitosa!</h1><p>Puedes cerrar esta pestaña y volver al bot de Twitch.</p>');

            server.close();

            logger.info('Intercambiando código de autorización por tokens de Spotify...');
            const authHeader = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64');
            const params = new URLSearchParams({
              grant_type: 'authorization_code',
              code,
              redirect_uri: config.spotifyRedirectUri
            });

            const tokenRes = await axios.post('https://accounts.spotify.com/api/token', params.toString(), {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${authHeader}`
              }
            });

            const tokens = saveSpotifyTokens(tokenRes.data);
            resolve(tokens);
          }
        }
      } catch (err) {
        logger.error(`Error procesando callback de Spotify: ${err.message}`);
        reject(err);
      }
    };

    let server;
    if (isHttps) {
      const options = {
        key: fs.readFileSync(config.sslKeyFile),
        cert: fs.readFileSync(config.sslCertFile)
      };
      server = https.createServer(options, requestHandler);
    } else {
      server = http.createServer(requestHandler);
    }

    server.listen(callbackPort, async () => {
      logger.info(`Servidor ${isHttps ? 'HTTPS' : 'HTTP'} de callback Spotify iniciado en puerto ${callbackPort}`);
      logger.info(`Abriendo navegador para autorización de Spotify: ${authUrl}`);
      try {
        await open(authUrl);
      } catch (err) {
        logger.warn(`No se pudo abrir automáticamente el navegador. Por favor abre manualmente: ${authUrl}`);
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`El puerto ${callbackPort} está ocupado para callback de Spotify.`);
      } else {
        logger.error(`Error en servidor de callback Spotify: ${err.message}`);
      }
      reject(err);
    });
  });
}

export async function getValidSpotifyToken() {
  if (!config.spotifyClientId || config.spotifyClientId === 'tu_spotify_client_id' || config.spotifyClientId === 'your_spotify_client_id_here') {
    return null;
  }

  let tokens = loadStoredSpotifyTokens();

  if (!tokens || !tokens.access_token || !tokens.refresh_token) {
    logger.info('No se encontraron tokens guardados de Spotify. Iniciando flujo OAuth 2.0...');
    tokens = await startSpotifyOAuthFlow();
    return tokens ? tokens.access_token : null;
  }

  // Comprobar expiración (renovar 5 minutos antes de expirar)
  const isExpired = tokens.expires_at ? (Date.now() >= tokens.expires_at - 300000) : false;

  if (isExpired) {
    logger.info('El access_token de Spotify expiró o está por expirar. Renovando...');
    try {
      tokens = await refreshSpotifyAccessToken(tokens.refresh_token);
      return tokens.access_token;
    } catch (err) {
      logger.warn('Fallo al renovar token de Spotify. Re-iniciando autorización...');
      tokens = await startSpotifyOAuthFlow();
      return tokens ? tokens.access_token : null;
    }
  }

  return tokens.access_token;
}

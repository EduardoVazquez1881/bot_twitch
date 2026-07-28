import https from 'https';
import fs from 'fs';
import { URL } from 'url';
import selfsigned from 'selfsigned';
import open from 'open';
import axios from 'axios';
import { exec } from 'child_process';
import { config } from './config.js';
import { logger } from './logger.js';

// 1. SSL Certificate Generation & Management for localhost
export async function getOrCreateSSLCertificate() {
  if (fs.existsSync(config.sslCertFile) && fs.existsSync(config.sslKeyFile)) {
    logger.info('Certificados SSL existentes cargados desde disco.');
    return {
      cert: fs.readFileSync(config.sslCertFile, 'utf8'),
      key: fs.readFileSync(config.sslKeyFile, 'utf8')
    };
  }

  logger.info('Generando certificado SSL autofirmado para localhost...');
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pkey = await selfsigned.generate(attrs, { days: 365 });

  fs.writeFileSync(config.sslCertFile, pkey.cert);
  fs.writeFileSync(config.sslKeyFile, pkey.private);
  logger.info('Certificado SSL autofirmado generado y guardado.');

  return {
    cert: pkey.cert,
    key: pkey.private
  };
}

// 2. Token File Management
export function loadStoredTokens() {
  try {
    if (fs.existsSync(config.tokensFile)) {
      const data = fs.readFileSync(config.tokensFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error(`Error leyendo tokens.json: ${error.message}`);
  }
  return null;
}

export function saveTokens(tokens) {
  try {
    const updated = {
      ...tokens,
      saved_at: new Date().toISOString()
    };
    fs.writeFileSync(config.tokensFile, JSON.stringify(updated, null, 2), 'utf8');
    logger.info('Tokens guardados correctamente en tokens.json');
  } catch (error) {
    logger.error(`Error guardando tokens en disco: ${error.message}`);
  }
}

// 3. Browser Helper
export async function openBrowser(url) {
  try {
    logger.info(`Abriendo navegador automáticamente: ${url}`);
    await open(url);
  } catch (err) {
    logger.warn(`No se pudo abrir 'open' directamente, reintentando con child_process...`);
    const startCmd = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
    exec(startCmd, (execErr) => {
      if (execErr) {
        logger.error(`Por favor abre manualmente la URL en tu navegador: ${url}`);
      }
    });
  }
}

// 4. Token Exchange & Refresh Functions
export async function exchangeCodeForTokens(code) {
  logger.info('Intercambiando código de autorización por tokens...');
  try {
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri
    });

    const response = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const tokenData = response.data;
    const expiresAt = Date.now() + tokenData.expires_in * 1000;
    
    const storedData = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      expires_at: expiresAt,
      scope: tokenData.scope,
      token_type: tokenData.token_type
    };

    saveTokens(storedData);
    logger.info(`Token de acceso obtenido exitosamente. Expira en: ${tokenData.expires_in} segundos.`);
    return storedData;
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    logger.error(`Error en intercambio de código OAuth: ${errorMsg}`);
    throw error;
  }
}

export async function refreshAccessToken(refreshTokenValue) {
  logger.info('Renovando access_token de Twitch usando refresh_token...');
  try {
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshTokenValue
    });

    const response = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const tokenData = response.data;
    const expiresAt = Date.now() + tokenData.expires_in * 1000;

    const storedData = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refreshTokenValue,
      expires_in: tokenData.expires_in,
      expires_at: expiresAt,
      scope: tokenData.scope,
      token_type: tokenData.token_type
    };

    saveTokens(storedData);
    logger.info(`Access Token renovado exitosamente. Nuevo tiempo de expiración: ${tokenData.expires_in}s (${new Date(expiresAt).toLocaleString()}).`);
    return storedData;
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    logger.error(`Error al refrescar token: ${errorMsg}`);
    throw error;
  }
}

// 5. Start HTTP/HTTPS OAuth Server for Callback
export function startOAuthFlow() {
  return new Promise(async (resolve, reject) => {
    try {
      const isHttps = config.redirectUri.startsWith('https://');
      const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&response_type=code&scope=${encodeURIComponent(config.scopes.join(' '))}`;

      const requestHandler = async (req, res) => {
        const baseUrl = `${isHttps ? 'https' : 'http'}://localhost:${config.port}`;
        const parsedUrl = new URL(req.url, baseUrl);

        if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/callback') {
          const code = parsedUrl.searchParams.get('code');
          const error = parsedUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>Error de Autenticación</h1><p>${error}</p>`);
            server.close();
            return reject(new Error(`OAuth error: ${error}`));
          }

          if (code) {
            try {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                  <h1 style="color: #9146FF;">¡Autenticación con Twitch exitosa!</h1>
                  <p>El bot ha capturado los tokens correctamente. Puedes cerrar esta ventana.</p>
                </div>
              `);

              server.close();
              const tokens = await exchangeCodeForTokens(code);
              resolve(tokens);
            } catch (exErr) {
              reject(exErr);
            }
          }
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      };

      let server;
      if (isHttps) {
        const ssl = await getOrCreateSSLCertificate();
        server = https.createServer({ key: ssl.key, cert: ssl.cert }, requestHandler);
      } else {
        const http = await import('http');
        server = http.createServer(requestHandler);
      }

      server.listen(config.port, 'localhost', () => {
        logger.info(`Servidor ${isHttps ? 'HTTPS' : 'HTTP'} de callback iniciado en ${config.redirectUri}`);
        openBrowser(authUrl);
      });

    server.on('error', (err) => {
      logger.error(`Error en servidor HTTPS callback: ${err.message}`);
      reject(err);
    });
    } catch (err) {
      reject(err);
    }
  });
}

// 6. Token Validation & High-level Retrieval Function
export async function validateToken(accessToken) {
  try {
    const response = await axios.get('https://id.twitch.tv/oauth2/validate', {
      headers: { 'Authorization': `OAuth ${accessToken}` }
    });
    return response.data;
  } catch (err) {
    if (err.response && err.response.status === 401) {
      logger.warn('El token de acceso actual fue rechazado (401 No Autorizado).');
      return null;
    }
    throw err;
  }
}

export async function getValidAccessToken() {
  let tokens = loadStoredTokens();

  if (!tokens || !tokens.access_token || !tokens.refresh_token) {
    logger.info('No se encontraron tokens guardados válidos. Iniciando flujo OAuth 2.0...');
    tokens = await startOAuthFlow();
    return tokens.access_token;
  }

  // Check expiration (refresh 5 minutes before expiration)
  const isExpired = tokens.expires_at ? (Date.now() >= tokens.expires_at - 300000) : false;

  if (isExpired) {
    logger.info('El access_token ha expirado o está cerca de expirar. Intentando renovar...');
    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
      return tokens.access_token;
    } catch (err) {
      logger.warn('Falló la renovación de token. Se iniciará de nuevo el flujo de autorización OAuth...');
      tokens = await startOAuthFlow();
      return tokens.access_token;
    }
  }

  // Validate current token with Twitch API
  const validation = await validateToken(tokens.access_token);
  if (!validation) {
    logger.info('Token no válido según Twitch API (401). Intentando renovar con refresh_token...');
    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
      return tokens.access_token;
    } catch (err) {
      logger.warn('Fallo al refrescar token 401. Re-iniciando flujo OAuth...');
      tokens = await startOAuthFlow();
      return tokens.access_token;
    }
  }

  // Verificar si el token tiene todos los permisos (scopes) requeridos para el chat IRC
  const currentScopes = validation.scopes || [];
  const missingScopes = config.scopes.filter(s => !currentScopes.includes(s));
  if (missingScopes.length > 0) {
    logger.info(`El token actual carece de los siguientes permisos (scopes): ${missingScopes.join(', ')}. Re-iniciando flujo OAuth 2.0...`);
    tokens = await startOAuthFlow();
    return tokens.access_token;
  }

  const remainingSecs = Math.floor((tokens.expires_at - Date.now()) / 1000);
  logger.info(`Token válido para el canal de Twitch. Expira en aproximadamente ${remainingSecs} segundos.`);
  return tokens.access_token;
}

/**
 * Consulta la API Helix de Twitch para verificar en tiempo real si el canal está en directo
 */
export async function checkStreamIsLive(channelName) {
  try {
    const token = await getValidAccessToken().catch(() => null);
    if (!token || !config.clientId) return false;
    const cleanChannel = (channelName || config.channel || '').replace('#', '').toLowerCase();
    if (!cleanChannel) return false;

    const response = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${cleanChannel}`, {
      headers: {
        'Client-ID': config.clientId,
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });

    const isLive = Boolean(response.data && response.data.data && response.data.data.length > 0);
    return isLive;
  } catch (err) {
    return false;
  }
}

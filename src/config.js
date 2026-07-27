import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Asegurar que existan los directorios necesarios
const logsDir = path.join(projectRoot, 'logs');
const tokensDir = path.join(projectRoot, 'tokens');
const certsDir = path.join(projectRoot, 'certs');

[logsDir, tokensDir, certsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

dotenv.config({ path: path.join(projectRoot, '.env') });

export const config = {
  projectRoot,
  logsDir,
  tokensDir,
  certsDir,
  clientId: process.env.TWITCH_CLIENT_ID || '',
  clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  channel: process.env.TWITCH_CHANNEL || '',
  port: parseInt(process.env.PORT || '3000', 10),
  redirectUri: process.env.REDIRECT_URI || 'https://localhost:3000',
  scopes: process.env.SCOPES ? process.env.SCOPES.split(' ') : ['user:read:chat', 'user:write:chat', 'chat:read', 'chat:edit'],
  tokensFile: path.join(tokensDir, 'tokens.json'),
  chatLogFile: path.join(logsDir, 'chat.log'),
  appLogFile: path.join(logsDir, 'app.log'),
  sslCertFile: path.join(certsDir, 'cert.pem'),
  sslKeyFile: path.join(certsDir, 'key.pem'),
  ttsAllMessages: process.env.TTS_ALL_MESSAGES !== 'false',
  voiceFemale: process.env.VOICE_FEMALE || 'es-MX-DaliaNeural',
  voiceMale: process.env.VOICE_MALE || 'es-MX-JorgeNeural',
  voiceDefault: process.env.VOICE_DEFAULT || 'es-US-PalomaNeural',
  // Spotify Integration Config
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback',
  spotifyTokensFile: path.join(tokensDir, 'spotify_tokens.json'),
  spotifyScopes: ['user-read-currently-playing', 'user-read-playback-state', 'user-modify-playback-state']
};

export function validateConfig() {
  const missing = [];
  if (!config.clientId || config.clientId === 'your_twitch_client_id_here') missing.push('TWITCH_CLIENT_ID');
  if (!config.clientSecret || config.clientSecret === 'your_twitch_client_secret_here') missing.push('TWITCH_CLIENT_SECRET');
  if (!config.channel || config.channel === 'your_streamer_channel_name') missing.push('TWITCH_CHANNEL');

  if (missing.length > 0) {
    console.warn(`[CONFIG WARNING] Missing or default environment variables: ${missing.join(', ')}`);
    console.warn('[CONFIG WARNING] Please update your .env file before attempting full authentication.');
  }
}

let isMuted = false;
let eventCounter = 0;
let currentFilter = 'all';
let currentView = 'dashboard';
let currentSpotifyState = null;
let currentQueueData = [];
const viewCache = {};

// Subscribir a eventos en tiempo real a través de Server-Sent Events
function initSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('status', (e) => {
    const data = JSON.parse(e.data);
    updateDashboardStatus(data);
  });

  evtSource.addEventListener('chat', (e) => {
    const data = JSON.parse(e.data);
    addLogEntry('chat', `<strong>${escapeHtml(data.username)}:</strong> ${escapeHtml(data.message)}`);
  });

  evtSource.addEventListener('tts', (e) => {
    const data = JSON.parse(e.data);
    addLogEntry('tts', `<strong>Voz [${escapeHtml(data.voice)}]:</strong> ${escapeHtml(data.text)}`);
  });

  evtSource.addEventListener('spotify', (e) => {
    const data = JSON.parse(e.data);
    currentSpotifyState = data;
    if (currentView === 'dashboard') {
      updateSpotifyPlayer(data);
    }
  });

  evtSource.onerror = () => {
    console.warn('SSE Desconectado. Reintentando en 5s...');
  };
}

// Cargar vista HTML parcial dinámicamente sin recargar la sidebar
async function loadView(viewName) {
  const container = document.getElementById('view-container');
  const titles = {
    dashboard: 'Dashboard Principal',
    search: 'Buscar Canción en Spotify',
    history: 'Historial de Pedidos',
    overlays: 'Overlays para OBS & Streamlabs',
    settings: 'Ajustes del Sistema'
  };

  currentView = viewName;

  // Actualizar clase activa del Sidebar
  document.querySelectorAll('.nav-item').forEach(nav => {
    nav.classList.toggle('active', nav.id === `nav-${viewName}`);
  });

  // Actualizar Título
  const pageTitle = document.getElementById('page-title');
  if (pageTitle && titles[viewName]) {
    pageTitle.textContent = titles[viewName];
  }

  try {
    if (!viewCache[viewName]) {
      const res = await fetch(`/views/${viewName}.html`);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      viewCache[viewName] = await res.text();
    }

    container.innerHTML = viewCache[viewName];

    // Re-vincular estado actual de la vista tras renderizar
    if (viewName === 'dashboard') {
      if (currentSpotifyState) updateSpotifyPlayer(currentSpotifyState);
      updateQueueList(currentQueueData);
    }
  } catch (err) {
    console.error(`Error cargando vista ${viewName}:`, err);
    container.innerHTML = `<div class="card"><p style="color: var(--danger)">Error al cargar la vista ${viewName}.</p></div>`;
  }
}

// Actualizar estado general del Dashboard
function updateDashboardStatus(data) {
  if (data.spotify) {
    currentSpotifyState = data.spotify;
    if (currentView === 'dashboard') updateSpotifyPlayer(data.spotify);
  }
  if (data.queue) {
    currentQueueData = data.queue;
    if (currentView === 'dashboard') updateQueueList(data.queue);
  }
  if (data.isMuted !== undefined) {
    isMuted = data.isMuted;
    updateMuteButton();
  }
}

// Actualizar Widget de Spotify
function updateSpotifyPlayer(data) {
  const trackName = document.getElementById('track-name');
  const artistName = document.getElementById('artist-name');
  const albumArt = document.getElementById('album-art');

  if (!trackName || !artistName) return;

  if (data && data.track) {
    trackName.textContent = data.track;
    artistName.textContent = data.artist;
    if (data.albumArt && albumArt) {
      albumArt.src = data.albumArt;
    }
  } else {
    trackName.textContent = 'Sin reproducción activa';
    artistName.textContent = 'Abre Spotify e inicia una canción';
  }
}

// Filtro de categorías del Log
function filterLogs(type) {
  currentFilter = type;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${type}'`));
  });

  const entries = document.querySelectorAll('.log-entry');
  entries.forEach(entry => {
    if (type === 'all' || entry.classList.contains(type)) {
      entry.style.display = 'block';
    } else {
      entry.style.display = 'none';
    }
  });
}

// Agregar entrada al log en tiempo real
function addLogEntry(type, htmlContent) {
  eventCounter++;
  const counterEl = document.getElementById('event-count');
  if (counterEl) counterEl.textContent = `Eventos: ${eventCounter}`;

  const logBox = document.getElementById('log-box');
  if (!logBox) return;

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = htmlContent;

  if (currentFilter !== 'all' && !entry.classList.contains(currentFilter)) {
    entry.style.display = 'none';
  }

  logBox.appendChild(entry);
  logBox.scrollTop = logBox.scrollHeight;

  if (logBox.children.length > 100) {
    logBox.removeChild(logBox.firstChild);
  }
}

// Acciones de Botón
async function toggleMuteTTS() {
  isMuted = !isMuted;
  updateMuteButton();
  try {
    await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggleMute', value: isMuted })
    });
    addLogEntry('system', `<strong>[CONTROL]</strong> TTS ${isMuted ? 'Silenciado' : 'Activado'}`);
  } catch (err) {
    console.error('Error enviando control de mute:', err);
  }
}

function updateMuteButton() {
  const btn = document.getElementById('btn-mute');
  const dot = document.getElementById('dot-tts');
  const text = document.getElementById('text-tts');

  if (isMuted) {
    if (btn) {
      btn.classList.add('muted');
      btn.setAttribute('title', 'Activar TTS');
    }
    if (dot) dot.className = 'dot warning';
    if (text) text.textContent = 'TTS: Silenciado';
  } else {
    if (btn) {
      btn.classList.remove('muted');
      btn.setAttribute('title', 'Silenciar TTS');
    }
    if (dot) dot.className = 'dot active';
    if (text) text.textContent = 'TTS: Activo';
  }
}

async function skipSpotifyTrack() {
  try {
    const res = await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skipSpotify' })
    });
    const data = await res.json();
    if (data.success) {
      addLogEntry('system', '<strong>[SPOTIFY]</strong> Canción saltada');
    }
  } catch (err) {
    console.error('Error saltando canción:', err);
  }
}

async function testVoiceTTS() {
  try {
    await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'testVoice' })
    });
  } catch (err) {
    console.error('Error probando voz:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function fetchQueue() {
  try {
    const res = await fetch('/api/queue');
    const data = await res.json();
    currentQueueData = data.queue || [];
    if (currentView === 'dashboard') {
      updateQueueList(currentQueueData);
    }
  } catch (err) {
    console.error('Error obteniendo la cola:', err);
  }
}

function updateQueueList(queue) {
  const container = document.getElementById('queue-list');
  if (!container) return;

  if (!queue || queue.length === 0) {
    container.innerHTML = '<p style="font-size: 13px; color: var(--text-secondary);">La cola de Spotify está vacía.</p>';
    return;
  }

  container.innerHTML = queue.map((item, idx) => `
    <div style="padding: 6px 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 2px solid var(--accent-cyan); display: flex; justify-content: space-between; align-items: center;">
      <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        <strong style="font-size: 13px; color: var(--text-primary);">${idx + 1}. ${escapeHtml(item.track)}</strong>
        <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(item.artist)}</div>
      </div>
    </div>
  `).join('');
}

function copyOverlayUrl(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const originalText = btnEl.textContent;
    btnEl.textContent = '¡Copiado!';
    btnEl.classList.add('active');
    setTimeout(() => {
      btnEl.textContent = originalText;
      btnEl.classList.remove('active');
    }, 2000);
  }).catch(err => {
    console.error('Error al copiar la URL:', err);
  });
}

// Carga Inicial
window.addEventListener('DOMContentLoaded', () => {
  initSSE();
  loadView('dashboard');
  fetch('/api/status')
    .then((res) => res.json())
    .then((data) => {
      updateDashboardStatus(data);
    })
    .catch((err) => console.warn('Status poll warning:', err));

  fetchQueue();
});

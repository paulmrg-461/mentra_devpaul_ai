import { createRequire } from 'module';
import type { AppSession } from '@mentra/sdk';
const _req = createRequire(import.meta.url);
const { AppServer } = _req('@mentra/sdk') as typeof import('@mentra/sdk');
const ActualAppServer = AppServer;
import { config } from '../../shared/config/env.js';
import { USER_MESSAGES } from '../../shared/config/constants.js';
import { SessionHandler } from '../handlers/session.handler.js';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class NumaAppServer extends ActualAppServer {
  constructor(private sessionHandler: SessionHandler) {
    super({
      packageName: config.app.id,
      apiKey: config.app.apiKey,
      port: config.app.port,
    });

    if (process.env.NODE_ENV !== 'test') {
      this.initializeWebview();
    }
  }

  private initializeWebview() {
    const app = this.getExpressApp();
    if (!app) return;

    // Serve static files from public directory
    const publicPath = path.resolve(__dirname, '../../../public');
    app.use('/public', express.static(publicPath));
    
    app.get('/webview', (_req: Request, res: Response) => {
      const externalUrl = process.env.WEBVIEW_URL;
      if (externalUrl) {
        res.redirect(302, externalUrl);
        return;
      }
      res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>${config.app.name}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --cyan:    #00e5ff;
      --gold:    #ffd700;
      --red:     #ff4444;
      --green:   #00e676;
      --bg:      #080d14;
      --surface: #0f1621;
      --border:  rgba(0,229,255,0.15);
      --muted:   #5a6478;
      --text:    #e2e8f0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 32px 24px;
      width: 100%;
      max-width: 380px;
      text-align: center;
      box-shadow: 0 0 48px rgba(0,229,255,0.08);
    }

    /* ── Header ── */
    .logo {
      width: 80px;
      height: 80px;
      border-radius: 20px;
      border: 1px solid var(--border);
      box-shadow: 0 0 24px rgba(0,229,255,0.2);
      margin-bottom: 16px;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--cyan);
      letter-spacing: 0.5px;
    }
    .tagline {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: var(--gold);
      margin-top: 4px;
      font-weight: 600;
    }

    /* ── Status pill ── */
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(0,230,118,0.08);
      border: 1px solid rgba(0,230,118,0.25);
      color: var(--green);
      padding: 6px 14px;
      border-radius: 99px;
      font-size: 0.78rem;
      font-weight: 600;
      margin: 20px 0 28px;
    }
    .status-dot {
      width: 7px; height: 7px;
      background: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 6px var(--green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }

    /* ── Button grid ── */
    .btn-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 28px;
    }

    .btn-wrap {
      position: relative;
    }

    .btn {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      color: var(--text);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
      padding: 16px 8px;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:active { transform: scale(0.95); }

    .btn .icon  { font-size: 1.8rem; line-height: 1; }
    .btn .label {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--muted);
    }

    /* Accent variants */
    .btn-talk   { border-color: rgba(0,229,255,0.3); }
    .btn-talk:hover, .btn-talk:focus   { background: rgba(0,229,255,0.1); border-color: var(--cyan); }
    .btn-talk:hover .label   { color: var(--cyan); }

    .btn-photo  { border-color: rgba(255,215,0,0.3); }
    .btn-photo:hover, .btn-photo:focus  { background: rgba(255,215,0,0.08); border-color: var(--gold); }
    .btn-photo:hover .label  { color: var(--gold); }

    .btn-meeting { border-color: rgba(0,230,118,0.3); }
    .btn-meeting:hover, .btn-meeting:focus { background: rgba(0,230,118,0.08); border-color: var(--green); }
    .btn-meeting:hover .label { color: var(--green); }

    .btn-continuous { border-color: rgba(180,100,255,0.3); }
    .btn-continuous:hover, .btn-continuous:focus { background: rgba(180,100,255,0.08); border-color: #b464ff; }
    .btn-continuous:hover .label { color: #b464ff; }
    .btn-continuous.active { background: rgba(180,100,255,0.18); border-color: #b464ff; }
    .btn-continuous.active .label { color: #b464ff; }

    .btn-stop   { border-color: rgba(255,68,68,0.3); }
    .btn-stop:hover, .btn-stop:focus   { background: rgba(255,68,68,0.08); border-color: var(--red); }
    .btn-stop:hover .label   { color: var(--red); }

    /* ── Tooltip ── */
    .tooltip {
      position: absolute;
      bottom: calc(100% + 10px);
      left: 50%;
      transform: translateX(-50%);
      background: #1a2233;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      width: 200px;
      text-align: left;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 10;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: #1a2233;
    }
    .tooltip-title {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--muted);
      margin-bottom: 6px;
      font-weight: 600;
    }
    .tooltip-cmd {
      font-size: 0.75rem;
      color: var(--cyan);
      font-family: 'SF Mono', 'Fira Code', monospace;
      background: rgba(0,229,255,0.06);
      border-radius: 5px;
      padding: 3px 6px;
      margin-bottom: 4px;
      display: block;
    }
    .tooltip-hw {
      font-size: 0.68rem;
      color: var(--muted);
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    .btn-wrap:hover .tooltip,
    .btn-wrap:focus-within .tooltip,
    .btn-wrap.tip-open .tooltip { opacity: 1; }

    /* Bottom rows get tooltip pointing down */
    .btn-wrap.tip-down .tooltip {
      bottom: auto;
      top: calc(100% + 10px);
    }
    .btn-wrap.tip-down .tooltip::after {
      top: auto;
      bottom: 100%;
      border-top-color: transparent;
      border-bottom-color: #1a2233;
    }

    /* ── Divider ── */
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      color: var(--muted);
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: rgba(255,255,255,0.06);
    }

    /* ── Hardware hints ── */
    .hw-hints {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .hw-hint {
      flex: 1;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 12px 8px;
      font-size: 0.7rem;
      color: var(--muted);
      line-height: 1.5;
    }
    .hw-hint strong { color: var(--text); display: block; margin-bottom: 2px; }
  </style>
</head>
<body>
  <div class="card">

    <!-- Header -->
    <img src="/public/numa_ai_logo.jpg" alt="Numa AI" class="logo">
    <h1>${config.app.name}</h1>
    <div class="tagline">Red de Recuerdos</div>

    <div class="status">
      <span class="status-dot"></span>
      Sistema Activo
    </div>

    <!-- Action buttons -->
    <div class="btn-grid">

      <!-- Talk -->
      <div class="btn-wrap">
        <button class="btn btn-talk" onclick="sendAction('talk')" aria-label="Hablar">
          <span class="icon">🎤</span>
          <span class="label">Hablar</span>
        </button>
        <div class="tooltip">
          <div class="tooltip-title">Comando de voz</div>
          <code class="tooltip-cmd">"numa [pregunta]"</code>
          <code class="tooltip-cmd">"numa ¿qué hora es?"</code>
          <div class="tooltip-hw">O presiona el botón derecho</div>
        </div>
      </div>

      <!-- Photo -->
      <div class="btn-wrap">
        <button class="btn btn-photo" onclick="sendAction('photo')" aria-label="Tomar foto">
          <span class="icon">📸</span>
          <span class="label">Foto</span>
        </button>
        <div class="tooltip">
          <div class="tooltip-title">Comandos de voz</div>
          <code class="tooltip-cmd">"numa toma foto"</code>
          <code class="tooltip-cmd">"numa analiza esto"</code>
          <code class="tooltip-cmd">"numa describe esto"</code>
          <div class="tooltip-hw">O doble toque en las gafas</div>
        </div>
      </div>

      <!-- Meeting -->
      <div class="btn-wrap tip-down">
        <button class="btn btn-meeting" onclick="sendAction('meeting')" aria-label="Reunión">
          <span class="icon">🎙️</span>
          <span class="label">Reunión</span>
        </button>
        <div class="tooltip">
          <div class="tooltip-title">Comandos de voz</div>
          <code class="tooltip-cmd">"numa inicia reunión"</code>
          <code class="tooltip-cmd">"numa termina reunión"</code>
          <div class="tooltip-hw">Transcribe y resume la reunión</div>
        </div>
      </div>

      <!-- Continuous -->
      <div class="btn-wrap tip-down">
        <button class="btn btn-continuous" id="btn-continuous" onclick="toggleContinuous()" aria-label="Modo Continuo">
          <span class="icon">♾️</span>
          <span class="label" id="lbl-continuous">Continuo</span>
        </button>
        <div class="tooltip">
          <div class="tooltip-title">Modo sin wake word</div>
          <code class="tooltip-cmd">"numa modo continuo"</code>
          <div class="tooltip-hw">Habla libremente sin decir "numa"</div>
        </div>
      </div>

      <!-- Stop -->
      <div class="btn-wrap tip-down">
        <button class="btn btn-stop" onclick="sendAction('stop')" aria-label="Detener">
          <span class="icon">🛑</span>
          <span class="label">Detener</span>
        </button>
        <div class="tooltip">
          <div class="tooltip-title">Comandos de voz</div>
          <code class="tooltip-cmd">"numa detente"</code>
          <code class="tooltip-cmd">"numa para"</code>
          <div class="tooltip-hw">Cancela la respuesta actual</div>
        </div>
      </div>

    </div>

    <!-- Hardware hints -->
    <div class="divider">hardware</div>
    <div class="hw-hints">
      <div class="hw-hint">
        <strong>Botón derecho</strong>
        Activar asistente de voz
      </div>
      <div class="hw-hint">
        <strong>Doble toque</strong>
        Captura y analiza la escena
      </div>
    </div>

  </div>

  <script>
    let continuousActive = false;

    function sendAction(action) {
      window.parent.postMessage({
        type: 'custom_message',
        action: 'webview_action',
        payload: { action }
      }, '*');

      const btn = event.currentTarget;
      btn.style.opacity = '0.6';
      setTimeout(() => { btn.style.opacity = ''; }, 300);
    }

    function toggleContinuous() {
      continuousActive = !continuousActive;
      const btn = document.getElementById('btn-continuous');
      const lbl = document.getElementById('lbl-continuous');
      btn.classList.toggle('active', continuousActive);
      lbl.textContent = continuousActive ? 'Activo' : 'Continuo';
      window.parent.postMessage({
        type: 'custom_message',
        action: 'webview_action',
        payload: { action: 'continuous' }
      }, '*');
    }

    // Touch: toggle tooltip on tap for mobile
    document.querySelectorAll('.btn-wrap').forEach(wrap => {
      wrap.querySelector('.btn').addEventListener('touchstart', () => {
        document.querySelectorAll('.btn-wrap').forEach(w => w !== wrap && w.classList.remove('tip-open'));
        wrap.classList.toggle('tip-open');
      }, { passive: true });
    });
    document.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.btn-wrap')) {
        document.querySelectorAll('.btn-wrap').forEach(w => w.classList.remove('tip-open'));
      }
    }, { passive: true });
  </script>
</body>
</html>`);
    });
  }

  protected async onSession(session: AppSession, sessionId: string, userId: string) {
    console.log(`New session: ${sessionId} for user: ${userId}`);

    session.subscribe('transcription:es-ES');
    session.subscribe('transcription:en-US');
    session.subscribe('button_press');
    session.subscribe('touch_event:double_tap');

    session.layouts.showTextWall(`${config.app.name} ready.`);

    this.sessionHandler.setup(session);
  }
}

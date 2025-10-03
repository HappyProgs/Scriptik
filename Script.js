(function() {
  'use strict';

  // ==============================
  // ⚙️ Константы и состояние
  // ==============================
  const STORAGE_KEY = 'tm_compact_menu_state_v2';
  const DEFAULT_STATE = {
    visible: true,
    activeTab: 'aim',
    zoom: { enabled: false, value: 1.0 },
    esp: { enabled: false },
    espReaper: { enabled: false, dist: 6000 },
    antiAfk: { enabled: false, intervalMs: 3000 },
    espFood: { enabled: false },
    nightVision: { enabled: false },
    autoHit: { enabled: false },
    autoFlick: { enabled: false },
    hitboxes: { enabled: false, color: '#ff0000' },
    spin: { enabled: false, speedMs: 200 },
    bossTimer: { enabled: false },
    binds: {
      menu: 'Insert',
      zoom: '',
      esp: '',
      espReaper: '',
      espFood: '',
      nightVision: '',
      autoHit: '',
      autoFlick: '',
      hitboxes: '',
      spin: '',
      antiAfk: ''
    },
    pos: { x: null, y: null },
    size: { w: 470, h: 560 }
  };

  let state = loadState();
  let keyListeningFor = null;

  const globalWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  try {
    const storedFriends = localStorage.getItem('evoFriends');
    globalWindow.friendsList = storedFriends ? JSON.parse(storedFriends) : [];
    if (!Array.isArray(globalWindow.friendsList)) {
      globalWindow.friendsList = [];
      localStorage.setItem('evoFriends', JSON.stringify([]));
    }
  } catch (e) {
    console.error('Error loading friends list from localStorage:', e);
    globalWindow.friendsList = [];
    localStorage.setItem('evoFriends', JSON.stringify([]));
  }

  // === AIM LIMIT: constants/state ==================================
const AIM_LIMIT_MS = 60 * 60 * 1000;         // 1 час
//const AIM_LIMIT_MS = 10 * 1000;                // 10 сек
const AIM_STORE_KEY = 'tm_aim_limit_xD';     // localStorage key

// Хранилище лимита: накопленное время + защита от скрутки времени
let AIM = loadAimLimit();

function loadAimLimit() {
  try {
    const raw = localStorage.getItem(AIM_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const nowWall = Date.now();
    const nowPerf = performance.now();

    if (!parsed || typeof parsed.elapsedMs !== 'number') {
      const fresh = {
        startedAtWall: nowWall,   // «красиво» показываем от этого отсчёт
        lastWall: nowWall,        // для анти-скрутки
        sessionPerfStart: nowPerf,
        elapsedMs: 0,
        tamperDetected: false
      };
      localStorage.setItem(AIM_STORE_KEY, JSON.stringify(fresh));
      return fresh;
    }

    // Инициализация новой сессии
    parsed.sessionPerfStart = nowPerf;
    parsed.lastWall = nowWall;
    parsed.tamperDetected = !!parsed.tamperDetected;
    return parsed;
  } catch (e) {
    return {
      startedAtWall: Date.now(),
      lastWall: Date.now(),
      sessionPerfStart: performance.now(),
      elapsedMs: 0,
      tamperDetected: false
    };
  }
}

function persistAim() {
  try { localStorage.setItem(AIM_STORE_KEY, JSON.stringify(AIM)); } catch(e){}
}

// Считает итог с опорой на МОНОТОННЫЕ часы (защита от смены даты)
function aimElapsedMs() {
  const sessionDelta = Math.max(0, performance.now() - AIM.sessionPerfStart);
  return Math.min(AIM_LIMIT_MS, AIM.elapsedMs + sessionDelta);
}

// Детект резких «скруток» системного времени назад/вперёд
function checkClockTamper() {
  const nowWall = Date.now();
  const drift = nowWall - AIM.lastWall;
  // Считаем подозрительным скачок назад или вперёд более 90 сек
  if (drift < -90_000 || drift > 90_000) {
    AIM.tamperDetected = true;
    persistAim();
  }
  AIM.lastWall = nowWall;
}

// true, если лимит вышел или замечена скрутка времени
function aimExpired() {
  return AIM.tamperDetected || aimElapsedMs() >= AIM_LIMIT_MS;
}

  // ==============================
  // 🪝 Хуки
  // ==============================
  const Hooks = {
    onMenuToggle: (visible) => {
      if (visible) {
        startLeafFall();
      } else {
        stopLeafFall();
      }
    },
    onZoomToggle: (enabled) => {
      if (enabled) zoomHack(state.zoom.value); else zoomHack(1.0);
    },
    onZoomChange: (scale) => zoomHack(scale),
    onESP: (enabled) => {
      if (enabled) {
        initESPScript();
      } else {
        const menuContainer = document.querySelector('#espMenuContainer');
        if (menuContainer) menuContainer.remove();
        if (globalWindow.espInitialized) {
          if (globalWindow.originalIsVisible) globalWindow.game.isVisible = globalWindow.originalIsVisible;
          if (globalWindow.originalDrawObject) globalWindow.game.drawObject = globalWindow.originalDrawObject;
          if (globalWindow.originalBeforeDrawAllObjects) globalWindow.game.beforeDrawAllObjects = globalWindow.originalBeforeDrawAllObjects;
          globalWindow.espInitialized = false;
        }
      }
    },
    onNightVision: (enabled) => { globalWindow.visionType = enabled ? 1 : 0; },
    onAutoHit: (enabled) => { if (enabled) globalWindow.skillUse(); else globalWindow.skillStop(); },
    onAutoFlick: (enabled) => { globalWindow.autoFlickActive = enabled; },
    onHitboxesToggle: (enabled) => { globalWindow.toggleHack = enabled; },
    onHitboxColorChange: (color) => {
      globalWindow.secondaryHitboxColor = color;
      localStorage.setItem('secondaryHitboxColor', color);
    },
onSpinToggle: (enabled) => {
  if (aimExpired()) {
    notify('Aim недоступен: время истекло', { throttle: 0 });
    state.spin.enabled = false;
    document.querySelector('#tmc-spin-toggle')?.classList.remove('on');
    saveState();
    return;
  }
  if (enabled) globalWindow.startSpin?.(); else globalWindow.stopSpin?.();
},
    onSpinSpeedChange: (ms) => { globalWindow.setSpinSpeed?.(ms); },
onAntiAfkToggle: (enabled) => { enabled ? globalWindow.startAfk?.() : globalWindow.stopAfk?.(); },
onAntiAfkIntervalChange: (ms) => { globalWindow.setAntiAfkInterval?.(ms); },
    onBossTimer: (enabled) => { enabled ? BossTimer.enable() : BossTimer.disable(); },
    onESPReaper: (enabled) => {
  globalWindow._rf_espReaper = !!enabled;
  globalWindow._rf_reaperDist = state.espReaper?.dist ?? 6000;
  ensureRFESPInstalled();
},
    onESPFood:   (enabled) => { globalWindow._rf_espFood   = !!enabled; ensureRFESPInstalled(); }
  };

  function ensureRFESPInstalled() {
  const gw = globalWindow;
  if (gw._rfEspInstalled) return;
  gw._rfEspInstalled = true;

  const conditionalBosses = [
    "swampmonster", "demonicimp", "phoenix", "phoenixbird",
    "shadowreaper", "grimreaper", "ghostlyreaper", "voidreaper", "dragon"
  ];
  const canEat = (a, b) => gw.foodChain?.[a?.name]?.eats?.[b?.name];
  const isBoss = (name, me, obj) => {
    if (!name) return false;
    if (name === "pumpkin") return false;
    if (name.includes("reaper") || (name.startsWith("pumpkin") && name !== "pumpkin")) return true;
    return conditionalBosses.includes(name) && canEat(obj, me);
  };
  const validObj = (o) => o && o.position && o.width > 0 && o.height > 0 && (o.active ?? o.isActive ?? true);
  const center = (o) => ({ x: o.position.x + o.width/2, y: o.position.y + o.height/2 });

  function drawReaperFoodESP() {
    if (!gw._rf_espReaper && !gw._rf_espFood) return;
    const game = gw.game; if (!game?.me?.position) return;
    const ctx = game.dynamicContext, canvas = game.canvas;
    const me = game.me, meC = center(me);

    // не трогаем чужой буфер, просто рисуем поверх
    for (const obj of Object.values(game.gameObjects || {})) {
      if (!validObj(obj) || obj === me) continue;
      const name = (obj.name || '').toLowerCase();
      const isPlayer = obj.type === gw.objectType.PLAYER;

      let attr = null;

      // 1) Reaper/Boss-only (фиолетовый)
if (gw._rf_espReaper && isBoss(name, me, obj)) {
  const maxDist = Number(gw._rf_reaperDist ?? 6000);
  attr = { color: 'purple', alpha: 1.0, dist: maxDist, width: 4.0 };
}

      // 2) Food (жёлтый/зелёный)
      if (!attr && gw._rf_espFood && canEat(me, obj)) {
        attr = { color: isPlayer ? 'green' : 'yellow', alpha: isPlayer ? 1.0 : 0.5, dist: 3000, width: 2.0 };
      }

      if (!attr) continue;

      const objC = center(obj);
      if (Math.hypot(meC.x - objC.x, meC.y - objC.y) > attr.dist) continue;

      const p1 = game.getRenderPosition(meC.x, meC.y);
      const p2 = game.getRenderPosition(objC.x, objC.y);

      ctx.save();
      ctx.globalAlpha = attr.alpha;
      ctx.strokeStyle = attr.color;
      ctx.lineWidth = attr.width;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Подмешиваем в цикл отрисовки (не ломая чужие хуки)
  gw.originalBeforeDrawAllObjects_RF = gw.originalBeforeDrawAllObjects_RF || gw.game.beforeDrawAllObjects;
  gw.game.beforeDrawAllObjects = function () {
    gw.originalBeforeDrawAllObjects_RF?.apply(this, arguments);
    try { drawReaperFoodESP(); } catch(e) {}
  };
}

// ==============================
// 🛠️ Сохранение (без enabled флагов)
// ==============================
function saveState() {
  try {
    const toSave = JSON.parse(JSON.stringify(state));
    // не сохраняем "включённость" переключаемых фич
    toSave.zoom.enabled = false;
    ['esp','espReaper','espFood','nightVision','autoHit','autoFlick','hitboxes','spin','bossTimer','antiAfk']
      .forEach(k => { if (toSave[k]) toSave[k].enabled = false; });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    const s = {
      ...DEFAULT_STATE,
      ...parsed,
      binds: { ...DEFAULT_STATE.binds, ...(parsed.binds || {}) },
      pos:   { ...DEFAULT_STATE.pos,   ...(parsed.pos   || {}) },
      size:  { ...DEFAULT_STATE.size,  ...(parsed.size  || {}) }
    };

    // при старте все фичи выключены
    s.zoom.enabled = false;
    ['esp','espReaper','espFood','nightVision','autoHit','autoFlick','hitboxes','spin','bossTimer','antiAfk']
      .forEach(k => { if (s[k]) s[k].enabled = false; });

    // дефолты для опций, которые могли отсутствовать в старых версиях
    if (!s.espReaper) s.espReaper = { enabled: false, dist: 6000 };
    if (!s.spin)      s.spin      = { enabled: false, speedMs: 200 };
    if (!s.bossTimer) s.bossTimer = { enabled: false };

    // по умолчанию открыта вкладка Aim
    s.activeTab = 'aim';

    return s;
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

  // ==============================
  // 🎨 Стили
  // ==============================
  const css = `
    .tmc-root { position: fixed; top: 80px; right: 40px; z-index: 999999999; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'; }
    .tmc-wrap { width: 460px; background: linear-gradient(180deg, rgba(12,12,12,0.92), rgba(12,12,12,0.88)); backdrop-filter: blur(10px) saturate(1.1); color: #e5e7eb; border: 1px solid rgba(255,255,255,0.10); border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.04); overflow: hidden; transform-origin: top right;
      resize: both; min-width: 320px; min-height: 520px;
    }
    .tmc-hidden { display: none; }
    .tmc-wrap::-webkit-resizer { background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.04)); border-radius: 0 0 16px 0; }
    .tmc-animate-in { animation: tmcZoomIn 220ms cubic-bezier(.2,.8,.2,1) forwards; }
    .tmc-animate-out { animation: tmcZoomOut 180ms ease forwards; }
    @keyframes tmcZoomIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
    @keyframes tmcZoomOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }
    .tmc-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); border-bottom: 1px solid rgba(255,255,255,0.08); cursor: move; user-select: none; }
    .tmc-title { font-weight: 600; font-size: 13px; letter-spacing: .2px; color: #f3f4f6; }
    .tmc-subtle { color: #9ca3af; font-size: 11px; }
    .tmc-close { background: transparent; border: 0; color: #9ca3af; font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 8px; }
    .tmc-close:hover { color: #e5e7eb; background: rgba(255,255,255,0.06); }
    .tmc-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 6px; }
    .tmc-tab { padding: 10px 10px; font-size: 12.5px; text-align: center; background: rgba(255,255,255,0.03); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; cursor: pointer; user-select: none; transition: transform .12s ease, background .2s ease, border-color .2s ease; }
    .tmc-tab.active { background: radial-gradient(120% 100% at 50% 0%, rgba(59,130,246,0.18), rgba(255,255,255,0.08)); color: #fff; border-color: rgba(99,102,241,0.6); box-shadow: 0 6px 18px rgba(59,130,246,0.25); transform: translateY(-1px); }
    .tmc-section { padding: 8px 10px 12px; display: none; }
    .tmc-section.active { display: block; }
    .tmc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; margin-top: 10px; }
    .tmc-col { display: flex; align-items: center; gap: 10px; }
    .tmc-label { font-size: 12px; color: #e5e7eb; }
    .tmc-note { font-size: 11px; color: #9ca3af; }
    .tmc-toggle { width: 44px; height: 24px; background: #374151; border-radius: 999px; position: relative; cursor: pointer; flex-shrink: 0; transition: background .15s ease, box-shadow .2s ease; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
    .tmc-toggle:before { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; background: linear-gradient(180deg,#fff,#e5e7eb); border-radius: 50%; transition: transform .15s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.35); }
    .tmc-toggle.on { background: linear-gradient(180deg,#22c55e,#16a34a); box-shadow: 0 0 0 2px rgba(34,197,94,0.25); }
    .tmc-toggle.on:before { transform: translateX(20px); }
    .tmc-slider { width: 180px; accent-color: #60a5fa; }
    .tmc-value { font-variant-numeric: tabular-nums; font-size: 12px; color: #d1d5db; }
    .tmc-key { font-size: 11.5px; color: #0b1220; background: linear-gradient(180deg,#e5e7eb,#d1d5db); border: none; border-radius: 10px; padding: 5px 10px; cursor: pointer; transition: transform .12s ease, filter .2s ease; }
    .tmc-key:hover{ transform: translateY(-1px); filter: brightness(1.02);}
    .tmc-key.wait { background: #fde68a; }
    .tmc-color { width: 28px; height: 22px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.18); cursor: pointer; background: transparent; }
    .tmc-footer { padding: 8px 10px 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); color: #9ca3af; font-size: 11px; }
    .tmc-kbd { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 6px; color: #e5e7eb; border: 1px solid rgba(255,255,255,0.14); }
  `;
  if (typeof GM_addStyle === 'function') GM_addStyle(css); else {
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }

  // ==============================
  // 🧱 Разметка
  // ==============================
  const root = document.createElement('div');
  root.className = 'tmc-root';
  const wrap = document.createElement('div');
  wrap.className = 'tmc-wrap tmc-hidden';
  wrap.innerHTML = `
    <div class="tmc-header" data-drag>
      <div>
        <div class="tmc-title">Free Script by t.me/EWFAQ</div>
        <div class="tmc-subtle">Insert — открыть / закрыть</div>
      </div>
      <button class="tmc-close" title="Закрыть">×</button>
    </div>
    <div class="tmc-tabs">
      <div class="tmc-tab" data-tab="aim">Aim</div>
      <div class="tmc-tab" data-tab="visual">Вид</div>
      <div class="tmc-tab" data-tab="assist">ESP</div>
    </div>
    <div class="tmc-section" data-section="visual">
      <div class="tmc-row">
        <div class="tmc-col">
          <div>
            <div class="tmc-label">Зум-хак (Don't Work)</div>
            <div class="tmc-note">Масштаб сцены</div>
          </div>
        </div>
        <div class="tmc-col">
          <span class="tmc-value" id="tmc-zoom-val">1.00x</span>
          <input id="tmc-zoom" class="tmc-slider" type="range" min="1" max="10" step="0.1">
          <div class="tmc-toggle" id="tmc-zoom-toggle"></div>
          <button class="tmc-key" id="bind-zoom" title="Привязать клавишу">bind</button>
        </div>
      </div>
      <div class="tmc-row">
        <div class="tmc-col">
          <div>
            <div class="tmc-label">Ночное зрение</div>
            <div class="tmc-note">Повышение видимости</div>
          </div>
        </div>
        <div class="tmc-col">
          <div class="tmc-toggle" id="tmc-night"></div>
          <button class="tmc-key" id="bind-nightVision">bind</button>
        </div>
      </div>
      <div class="tmc-row">
  <div class="tmc-col">
    <div>
      <div class="tmc-label">Boss Timer</div>
      <div class="tmc-note">Зеркалит таймер босса</div>
    </div>
  </div>
  <div class="tmc-col">
    <div class="tmc-toggle" id="tmc-boss-timer"></div>
    <button class="tmc-key" id="bind-bossTimer">bind</button>
  </div>
</div>
<div class="tmc-row" id="tmc-anti-afk-row">
  <div class="tmc-col">
    <div>
      <div class="tmc-label">Anti-AFK</div>
      <div class="tmc-note">Делает движения, чтобы не детектило за афк</div>
    </div>
  </div>
  <div class="tmc-col" style="gap:10px;">
    <span class="tmc-value" id="tmc-antiAfk-interval-val">3.0s</span>
    <input id="tmc-antiAfk-interval" class="tmc-slider" type="range" min="0.5" max="10" step="0.5" value="3.0">
    <div class="tmc-toggle" id="tmc-antiAfk"></div>
    <button class="tmc-key" id="bind-antiAfk" title="Привязать клавишу">bind</button>
  </div>
</div>
</div>
<div class="tmc-section" data-section="assist">
  <!-- Главный ESP переключатель -->
  <div class="tmc-row">
    <div class="tmc-col">
      <div>
        <div class="tmc-label">ESP</div>
        <div class="tmc-note">Откр/закр (мини-меню сделаете сами)</div>
      </div>
    </div>
    <div class="tmc-col">
      <div class="tmc-toggle" id="tmc-esp"></div>
      <button class="tmc-key" id="bind-esp">bind</button>
    </div>
  </div>

  <!-- ESP Reaper -->
  <div class="tmc-row">
    <div class="tmc-col">
      <div>
        <div class="tmc-label">ESP Reaper</div>
        <div class="tmc-note">Линии к целям</div>
      </div>
    </div>
    <div class="tmc-col">
      <div class="tmc-toggle" id="tmc-esp-reaper"></div>
      <button class="tmc-key" id="bind-espReaper">bind</button>
    </div>
  </div>

  <!-- Distance для ESP Reaper -->
  <div class="tmc-row" id="tmc-esp-reaper-dist-row">
    <div class="tmc-col">
      <div>
        <div class="tmc-label">Reaper Distance</div>
        <div class="tmc-note">Макс. дистанция линий</div>
      </div>
    </div>
    <div class="tmc-col" style="gap:10px;">
      <span class="tmc-value" id="tmc-esp-reaper-dist-val">7000</span>
      <input id="tmc-esp-reaper-dist" class="tmc-slider" type="range" min="500" max="20000" step="100" value="7000">
    </div>
  </div>

  <!-- ESP Food -->
  <div class="tmc-row">
    <div class="tmc-col">
      <div>
        <div class="tmc-label">ESP Food</div>
        <div class="tmc-note">Съедобные цели (жёлтый/зелёный)</div>
      </div>
    </div>
    <div class="tmc-col">
      <div class="tmc-toggle" id="tmc-esp-food"></div>
      <button class="tmc-key" id="bind-espFood">bind</button>
    </div>
  </div>
</div>
<div class="tmc-section" data-section="aim">
  <!-- TIMER ROW -->
  <div class="tmc-row" id="tmc-aim-timer-row" style="border:1px solid rgba(34,197,94,0.25)">
    <div class="tmc-col">
      <div>
        <div class="tmc-label">Aim — ограничение по времени</div>
        <div class="tmc-note">Доступно 60 минут с момента запуска</div>
      </div>
    </div>
    <div class="tmc-col">
      <span class="tmc-value" id="tmc-aim-timer">--:--</span>
    </div>
  </div>

  <!-- Любые ваши контролы ниже: здесь просто демо-элементы -->
  <div class="tmc-row">
    <div class="tmc-col">
      <div>
        <div class="tmc-label">Auto Hit</div>
        <div class="tmc-note">Авто аттака (зависит от фпс, и пинга)</div>
      </div>
    </div>
    <div class="tmc-col">
      <div class="tmc-toggle" id="tmc-autohit"></div>
      <button class="tmc-key" id="bind-autoHit">bind</button>
    </div>
  </div>

  <div class="tmc-row">
    <div class="tmc-col">
      <div>
        <div class="tmc-label">Auto Flick [Beta]</div>
        <div class="tmc-note">Резкая наводка</div>
      </div>
    </div>
    <div class="tmc-col">
      <div class="tmc-toggle" id="tmc-autoflick"></div>
      <button class="tmc-key" id="bind-autoFlick">bind</button>
    </div>
  </div>
  <div class="tmc-row">
    <div class="tmc-col">
      <div>
        <div class="tmc-label">Hitboxes</div>
        <div class="tmc-note">Вкл/выкл + цвет</div>
      </div>
    </div>
    <div class="tmc-col">
      <input id="tmc-hitbox-color" class="tmc-color" type="color">
      <div class="tmc-toggle" id="tmc-hitboxes"></div>
      <button class="tmc-key" id="bind-hitboxes">bind</button>
    </div>
  </div>
</div>
    </div>
    <div class="tmc-footer">
      <div>Buy Vip Cheat: t.me/EWFAQ</div>
      <button class="tmc-key" id="bind-menu" title="Привязать клавишу меню" style="margin-left:8px;">bind</button>
    </div>
  `;
  root.appendChild(wrap);
  document.documentElement.appendChild(root);

  // Добавление функции игнора друзей в секцию Aim
  const aimSection = wrap.querySelector('[data-section="aim"]');
  const friendsSeparator = document.createElement('div');
  friendsSeparator.className = 'tmc-label';
  friendsSeparator.textContent = 'Ignore Friends';
  friendsSeparator.style.margin = '10px 0';
  friendsSeparator.style.color = '#e5e7eb';
  aimSection.appendChild(friendsSeparator);

  const friendsRow = document.createElement('div');
  friendsRow.className = 'tmc-row';
  friendsRow.innerHTML = `
    <div class="tmc-col">
      <div>
        <div class="tmc-label">Add Friend</div>
        <div class="tmc-note">Ignore players in attacks and hitboxes</div>
      </div>
    </div>
    <div class="tmc-col" style="flex-grow: 1; gap: 6px;">
      <input id="tmc-friend-input" type="text" placeholder="Enter nickname" style="width: 100%; padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: #e5e7eb;">
      <button id="tmc-friend-add" style="padding: 6px 10px; background: linear-gradient(180deg,#22c55e,#16a34a); color: white; border: none; border-radius: 8px; cursor: pointer;">Add</button>
      <button id="tmc-friend-clear" style="padding: 6px 10px; background: linear-gradient(180deg,#b91c1c,#991b1b); color: white; border: none; border-radius: 8px; cursor: pointer;">Clear List</button>
    </div>
  `;
  aimSection.appendChild(friendsRow);

  const friendsListContainer = document.createElement('div');
  friendsListContainer.className = 'tmc-row';
  friendsListContainer.style.cssText = `
    max-height: 100px; overflow-y: auto; margin-top: 6px; padding: 8px;
    background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.07);
  `;
  aimSection.appendChild(friendsListContainer);

  function refreshFriendsList() {
    friendsListContainer.innerHTML = '';
    if (!globalWindow.friendsList || !Array.isArray(globalWindow.friendsList) || globalWindow.friendsList.length === 0) {
      friendsListContainer.innerHTML = `<div class="tmc-note" style="font-style: italic;">No ignored players</div>`;
      return;
    }
    globalWindow.friendsList.forEach((friend, index) => {
      if (typeof friend !== 'string' || friend.trim() === '') return;
      const friendItem = document.createElement('div');
      friendItem.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px; background: rgba(255,255,255,0.02); margin-bottom: 4px; border-radius: 8px;
      `;
      friendItem.innerHTML = `
        <span style="color: #e5e7eb;">${friend}</span>
        <button style="padding: 4px 8px; background: #b91c1c; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 11px;">X</button>
      `;
      const deleteButton = friendItem.querySelector('button');
      deleteButton.addEventListener('click', () => {
        globalWindow.friendsList.splice(index, 1);
        updateFriendsList();
        refreshFriendsList();
      });
      friendsListContainer.appendChild(friendItem);
    });
  }

  const friendInput = wrap.querySelector('#tmc-friend-input');
  const addButton = wrap.querySelector('#tmc-friend-add');
  const clearButton = wrap.querySelector('#tmc-friend-clear');

  addButton.addEventListener('click', () => {
    const nickname = friendInput.value.trim();
    if (nickname && !globalWindow.friendsList.includes(nickname)) {
      globalWindow.friendsList.push(nickname);
      updateFriendsList();
      refreshFriendsList();
      friendInput.value = '';
    } else {
      friendInput.style.border = '1px solid #b91c1c';
      setTimeout(() => friendInput.style.border = '1px solid rgba(255,255,255,0.08)', 1000);
    }
  });

  friendInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addButton.click();
  });

  clearButton.addEventListener('click', () => {
    globalWindow.friendsList = [];
    updateFriendsList();
    refreshFriendsList();
  });

  refreshFriendsList();

  if (state.pos.x !== null && state.pos.y !== null) {
    root.style.left = state.pos.x + 'px';
    root.style.top = state.pos.y + 'px';
    root.style.right = 'auto';
  }
  if (state.size?.w) wrap.style.width = state.size.w + 'px';
  if (state.size?.h) wrap.style.height = state.size.h + 'px';

  // ==============================
  // 🧭 Табы
  // ==============================
  const tabEls = [...wrap.querySelectorAll('.tmc-tab')];
  const sectionEls = [...wrap.querySelectorAll('.tmc-section')];
  function setActiveTab(id) {
    state.activeTab = id; saveState();
    tabEls.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    sectionEls.forEach(s => s.classList.toggle('active', s.dataset.section === id));
  }
  tabEls.forEach(t => t.addEventListener('click', () => setActiveTab(t.dataset.tab)));

  // ==============================
  // 🧰 Элементы управления
  // ==============================
  const btnClose = wrap.querySelector('.tmc-close');
  const zoomSlider = wrap.querySelector('#tmc-zoom');
  const zoomVal = wrap.querySelector('#tmc-zoom-val');
  const toggles = {
    zoom: wrap.querySelector('#tmc-zoom-toggle'),
    esp: wrap.querySelector('#tmc-esp'),
    espReaper: wrap.querySelector('#tmc-esp-reaper'),
    espFood: wrap.querySelector('#tmc-esp-food'),
    nightVision: wrap.querySelector('#tmc-night'),
    autoHit: wrap.querySelector('#tmc-autohit'),
    autoFlick: wrap.querySelector('#tmc-autoflick'),
    hitboxes: wrap.querySelector('#tmc-hitboxes'),
    bossTimer: wrap.querySelector('#tmc-boss-timer'),
    antiAfk:   wrap.querySelector('#tmc-antiAfk')
  };
  const colorHitbox = wrap.querySelector('#tmc-hitbox-color');
  const reaperDistSlider = wrap.querySelector('#tmc-esp-reaper-dist');
  const reaperDistVal    = wrap.querySelector('#tmc-esp-reaper-dist-val');

    // слушатель изменения слайдера
reaperDistSlider.addEventListener('input', () => {
  const v = parseInt(reaperDistSlider.value, 10);
  state.espReaper.dist = v;         // обновляем state
  reaperDistVal.textContent = String(v);
  globalWindow._rf_reaperDist = v;  // проброс в глобал, чтобы отрисовщик сразу подхватил
  saveState();
});

  // ==============================
  // ⌨️ Бинды
  // ==============================
  const bindButtons = {
    zoom: wrap.querySelector('#bind-zoom'),
    esp: wrap.querySelector('#bind-esp'),
    espReaper: wrap.querySelector('#bind-espReaper'),
    espFood: wrap.querySelector('#bind-espFood'),
    nightVision: wrap.querySelector('#bind-nightVision'),
    autoHit: wrap.querySelector('#bind-autoHit'),
    autoFlick: wrap.querySelector('#bind-autoFlick'),
    hitboxes: wrap.querySelector('#bind-hitboxes'),
    bossTimer: wrap.querySelector('#bind-bossTimer'),
    antiAfk: wrap.querySelector('#bind-antiAfk')
  };
  bindButtons.menu = wrap.querySelector('#bind-menu');

  function labelForKey(code) {
    if (!code) return 'bind';
    return code.replace('Key','').replace('Digit','');
  }
  function refreshBindLabels() {
    for (const k in bindButtons) {
      if (bindButtons[k]) bindButtons[k].textContent = labelForKey(state.binds[k]);
    }
    const openKeyEl = wrap.querySelector('#tmc-open-key');
    if (openKeyEl) openKeyEl.textContent = labelForKey(state.binds.menu || 'Insert');
    const btn = document.querySelector('#bind-spin');
    if (btn) btn.textContent = labelForKey(state.binds.spin);
  }

  Object.keys(bindButtons).forEach(k => {
    bindButtons[k].addEventListener('click', () => {
      keyListeningFor = k;
      bindButtons[k].classList.add('wait');
      bindButtons[k].textContent = '...';
    });
  });

  toggles.antiAfk.addEventListener('click', () => { toggleFeature('antiAfk'); });
bindButtons.antiAfk.addEventListener('click', () => {
  keyListeningFor = 'antiAfk';
  bindButtons.antiAfk.classList.add('wait');
  bindButtons.antiAfk.textContent = '...';
});

window.addEventListener('keydown', (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  const isTyping = ['INPUT','TEXTAREA','SELECT'].includes(tag) || document.activeElement?.isContentEditable;

  const menuKey = state.binds.menu || 'Insert';
  if (e.code === menuKey) {
    if (!isTyping) { e.preventDefault(); toggleMenu(); }
    return;
  }

  // --- Режим привязки клавиши ---
  if (keyListeningFor) {
    // тут не нужно ломать Ctrl+C
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      state.binds[keyListeningFor] = e.code;
      keyListeningFor = null;
      saveState();
      refreshBindLabels();
    }
    return;
  }

  // --- Триггеры биндов ---
  if (!e.ctrlKey && !e.altKey && !e.metaKey) { // <-- добавлено условие
    for (const name of Object.keys(state.binds)) {
      if (state.binds[name] && e.code === state.binds[name]) {
        e.preventDefault();
        toggleFeature(name);
      }
    }
  }
}, true);

  function toggleFeature(name) {
    // === AIM LIMIT: hard block for Aim features
if (AIM_FEATURES.has(name)) {
  if (aimExpired()) {
    notify('Aim недоступен: время истекло', { throttle: 0 });
    const el = toggles[name];
    if (el) el.classList.remove('on');
    if (state[name]) state[name].enabled = false;
    saveState();
    return;
  }
}

    switch (name) {
      case 'zoom':
        state.zoom.enabled = !state.zoom.enabled; updateToggleUI('zoom', state.zoom.enabled);
        Hooks.onZoomToggle(state.zoom.enabled);
        break;
      case 'esp':
        state.esp.enabled = !state.esp.enabled; updateToggleUI('esp', state.esp.enabled);
        Hooks.onESP(state.esp.enabled);
        break;
      case 'nightVision':
        state.nightVision.enabled = !state.nightVision.enabled; updateToggleUI('nightVision', state.nightVision.enabled);
        Hooks.onNightVision(state.nightVision.enabled);
        break;
      case 'autoHit':
        state.autoHit.enabled = !state.autoHit.enabled; updateToggleUI('autoHit', state.autoHit.enabled);
        Hooks.onAutoHit(state.autoHit.enabled);
        break;
      case 'autoFlick':
        state.autoFlick.enabled = !state.autoFlick.enabled; updateToggleUI('autoFlick', state.autoFlick.enabled);
        Hooks.onAutoFlick(state.autoFlick.enabled);
        break;
      case 'hitboxes':
        state.hitboxes.enabled = !state.hitboxes.enabled; updateToggleUI('hitboxes', state.hitboxes.enabled);
        Hooks.onHitboxesToggle(state.hitboxes.enabled);
        break;
      case 'spin':
        state.spin.enabled = !state.spin.enabled;
        const spinToggle = document.querySelector('#tmc-spin-toggle');
        if (spinToggle) spinToggle.classList.toggle('on', !!state.spin.enabled);
        saveState();
        Hooks.onSpinToggle(state.spin.enabled);
        break;
      case 'espReaper':
  state.espReaper.enabled = !state.espReaper.enabled;
  updateToggleUI('espReaper', state.espReaper.enabled);
  Hooks.onESPReaper(state.espReaper.enabled);
  break;
      case 'espFood':
  state.espFood.enabled = !state.espFood.enabled;
  updateToggleUI('espFood', state.espFood.enabled);
  Hooks.onESPFood(state.espFood.enabled);
  break;
      case 'bossTimer':
  state.bossTimer.enabled = !state.bossTimer.enabled;
  updateToggleUI('bossTimer', state.bossTimer.enabled);
  Hooks.onBossTimer(state.bossTimer.enabled);
  break;
      case 'antiAfk':
  state.antiAfk.enabled = !state.antiAfk.enabled;
  updateToggleUI('antiAfk', state.antiAfk.enabled);
  Hooks.onAntiAfkToggle(state.antiAfk.enabled);
  break;
    }
    saveState();
  }

  toggles.bossTimer.addEventListener('click', () => { toggleFeature('bossTimer'); });

  function updateToggleUI(name, enabled) {
    const el = toggles[name];
    if (!el) return;
    el.classList.toggle('on', !!enabled);
  }

  // ==============================
  // 🎚️ Хендлеры контролов
  // ==============================
  zoomSlider.addEventListener('input', () => {
    state.zoom.value = parseFloat(zoomSlider.value);
    zoomVal.textContent = state.zoom.value.toFixed(2) + 'x';
    saveState();
    Hooks.onZoomChange(state.zoom.value);
  });
  const antiSlider = wrap.querySelector('#tmc-antiAfk-interval');
const antiVal = wrap.querySelector('#tmc-antiAfk-interval-val');
antiSlider.addEventListener('input', () => {
  const seconds = parseFloat(antiSlider.value);
  const ms = Math.max(500, Math.round(seconds * 1000));
  state.antiAfk.intervalMs = ms;
  antiVal.textContent = seconds.toFixed(1) + 's';
  saveState();
  Hooks.onAntiAfkIntervalChange?.(ms);
});
  toggles.zoom.addEventListener('click', () => { toggleFeature('zoom'); });
  toggles.esp.addEventListener('click', () => { toggleFeature('esp'); });
  toggles.nightVision.addEventListener('click', () => { toggleFeature('nightVision'); });
  toggles.autoHit.addEventListener('click', () => { toggleFeature('autoHit'); });
  toggles.autoFlick.addEventListener('click', () => { toggleFeature('autoFlick'); });
  toggles.hitboxes.addEventListener('click', () => { toggleFeature('hitboxes'); });
  toggles.espReaper.addEventListener('click', () => { toggleFeature('espReaper'); });
  toggles.espFood.addEventListener('click', () => { toggleFeature('espFood'); });

  colorHitbox.addEventListener('input', () => {
    state.hitboxes.color = colorHitbox.value; saveState();
    Hooks.onHitboxColorChange(state.hitboxes.color);
  });

  btnClose.addEventListener('click', () => hideMenu());

  // ==============================
  // 🪟 Показ/скрытие меню
  // ==============================
  let animating = false;
  function showMenu() {
    if (!wrap.classList.contains('tmc-hidden') || animating) return;
    wrap.classList.remove('tmc-hidden', 'tmc-animate-out');
    wrap.classList.add('tmc-animate-in');
    animating = true;
    setTimeout(() => { animating = false; }, 230);
    state.visible = true; saveState();
    Hooks.onMenuToggle(true);
  }
  function hideMenu() {
    if (wrap.classList.contains('tmc-hidden') || animating) return;
    wrap.classList.remove('tmc-animate-in');
    wrap.classList.add('tmc-animate-out');
    animating = true;
    setTimeout(() => {
      wrap.classList.add('tmc-hidden');
      animating = false;
    }, 190);
    state.visible = false; saveState();
    Hooks.onMenuToggle(false);
  }
  function toggleMenu() { state.visible ? hideMenu() : showMenu(); }

  // ==============================
  // 🖱️ Перетаскивание по заголовку
  // ==============================
  (function enableDrag() {
    const header = wrap.querySelector('[data-drag]');
    let sx=0, sy=0, ox=0, oy=0, dragging=false;
    header.addEventListener('pointerdown', (e) => {
      dragging = true; header.setPointerCapture(e.pointerId);
      const rect = root.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = rect.left; oy = rect.top;
    });
    header.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx; const dy = e.clientY - sy;
      const nx = Math.max(8, Math.min(window.innerWidth - 8 - wrap.offsetWidth, ox + dx));
      const ny = Math.max(8, Math.min(window.innerHeight - 8 - wrap.offsetHeight, oy + dy));
      root.style.left = nx + 'px'; root.style.top = ny + 'px'; root.style.right = 'auto';
    });
    header.addEventListener('pointerup', (e) => {
      dragging = false; header.releasePointerCapture(e.pointerId);
      const rect = root.getBoundingClientRect();
      state.pos.x = rect.left; state.pos.y = rect.top; saveState();
    });
  })();

  // ==============================
  // 📐 Отслеживание ресайза и сохранение размера
  // ==============================
  const ro = new ResizeObserver(() => {
    const w = Math.round(wrap.getBoundingClientRect().width);
    const h = Math.round(wrap.getBoundingClientRect().height);
    state.size.w = w;
    state.size.h = h;
    saveState();
  });
  ro.observe(wrap);

  // ==============================
  // 🚀 Инициализация UI
  // ==============================
  function initUIFromState() {
    setActiveTab('aim');
    updateToggleUI('zoom', false);
    zoomSlider.value = String(state.zoom.value);
    zoomVal.textContent = state.zoom.value.toFixed(2) + 'x';
    updateToggleUI('esp', false);
    updateToggleUI('nightVision', false);
    updateToggleUI('autoHit', false);
    updateToggleUI('autoFlick', false);
    updateToggleUI('hitboxes', false);
    updateToggleUI('espReaper', false);
    updateToggleUI('espFood', false);
    updateToggleUI('bossTimer', false);
    // ESP Reaper distance
if (state.espReaper && typeof state.espReaper.dist === 'number') {
  reaperDistSlider.value = String(state.espReaper.dist);
  reaperDistVal.textContent = String(state.espReaper.dist);
  globalWindow._rf_reaperDist = state.espReaper.dist; // чтобы работало сразу после запуска
}
    if (state.bossTimer?.enabled) {
  updateToggleUI('bossTimer', true);
  Hooks.onBossTimer(true);
}
    updateToggleUI('antiAfk', false);
const antiVal = wrap.querySelector('#tmc-antiAfk-interval-val');
const antiSlider = wrap.querySelector('#tmc-antiAfk-interval');
if (antiVal && antiSlider) {
  const ms = state.antiAfk?.intervalMs ?? 3000;
  antiSlider.value = (ms/1000).toFixed(1);
  antiVal.textContent = (ms/1000).toFixed(1) + 's';
}
    const spinToggle = document.querySelector('#tmc-spin-toggle');
    if (spinToggle) spinToggle.classList.toggle('on', !!state.spin.enabled);
    const spinSlider = document.querySelector('#tmc-spin');
    const spinVal = document.querySelector('#tmc-spin-val');
    if (spinSlider && spinVal) {
      spinSlider.value = String(state.spin.speedMs||200);
      spinVal.textContent = (state.spin.speedMs||200) + 'ms';
    }
    colorHitbox.value = state.hitboxes.color;
    refreshBindLabels();
    if (state.visible) showMenu();
  }

  const openKeyEl = wrap.querySelector('#tmc-open-key');
  if (openKeyEl) openKeyEl.textContent = labelForKey(state.binds.menu || 'Insert');
  initUIFromState();

if (!aimExpired()) {
  state.hitboxes.enabled = true;
  updateToggleUI('hitboxes', true);
  Hooks.onHitboxesToggle(true);
  Hooks.onHitboxColorChange(state.hitboxes.color);
  saveState();
} else {
  // если уже заблокировано — принудительно OFF
  state.hitboxes.enabled = false;
  updateToggleUI('hitboxes', false);
  Hooks.onHitboxesToggle(false);
  saveState();
}

// === AIM LIMIT: UI/lock ==========================================
const aimTimerEl  = document.getElementById('tmc-aim-timer');
const aimTimerRow = document.getElementById('tmc-aim-timer-row');
const AIM_FEATURES = new Set(['autoHit','autoFlick','hitboxes','spin']);

function formatHHMMSS(ms) {
  let s = Math.max(0, Math.floor(ms/1000));
  const hh = Math.floor(s/3600); s -= hh*3600;
  const mm = Math.floor(s/60);   s -= mm*60;
  const pad = n => (n<10?'0'+n:n);
  return (hh>0? (pad(hh)+':') : '') + pad(mm)+':'+pad(s);
}

function paintAimRowExpiredUI() {
  if (!aimTimerRow) return;
  aimTimerRow.style.border = '1px solid rgba(239,68,68,0.45)';
  aimTimerRow.style.background = 'linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.04))';
}

function paintAimRowActiveUI() {
  if (!aimTimerRow) return;
  aimTimerRow.style.border = '1px solid rgba(34,197,94,0.25)';
  aimTimerRow.style.background = 'linear-gradient(180deg, rgba(34,197,94,0.08), rgba(34,197,94,0.04))';
}

// --- ЕДИНСТВЕННЫЙ ТОСТ + ТРОТТЛИНГ (вместо старой function notify) ---
(function(){
  let toastEl = null;
  let hideTimer = null;
  let lastMsg = '';
  let lastTs = 0;

  window.notify = function(msg, {duration=2500, throttle=1500} = {}) {
    const now = Date.now();
    // не спамим одинаковым текстом слишком часто
    if (msg === lastMsg && (now - lastTs) < throttle) return;
    lastMsg = msg;
    lastTs = now;

    if (!toastEl) {
      toastEl = document.createElement('div');
      Object.assign(toastEl.style, {
        position:'fixed', right:'16px', bottom:'16px', zIndex: 999999999,
        background:'rgba(0,0,0,0.85)', color:'#fff',
        padding:'10px 14px', borderRadius:'10px',
        border:'1px solid rgba(255,255,255,0.15)',
        font:'13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial',
        maxWidth:'60vw', pointerEvents:'none',
        opacity:'0', transform:'translateY(6px)',
        transition:'opacity .15s ease, transform .15s ease'
      });
      toastEl.className = 'tmc-toast';
      document.body.appendChild(toastEl);

      // на всякий случай выпилим возможные "вечные" старые тосты
      setTimeout(() => {
        document.querySelectorAll('.tmc-toast:not(:first-child)').forEach(n => n.remove());
      }, 0);
    }

    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translateY(0)';

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(6px)';
      setTimeout(() => {
        if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
        toastEl = null;
      }, 180);
    }, Math.max(500, duration));
  };
})();

// гарантированно уберём подвисшие тосты при первом рендере
document.querySelectorAll('.tmc-toast').forEach(n => n.remove());

function enforceAimLockUI() {
  // Гасим все Aim-фичи, включая хитбоксы и спин
  for (const name of AIM_FEATURES) {
    const el = toggles[name];
    if (el) el.classList.remove('on');
    if (state[name]) state[name].enabled = false;

    // корректно вызвать хук выключения (spin требует onSpinToggle)
    try {
      const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
      const hookName = (name === 'spin') ? 'onSpinToggle' : ('on' + cap(name));
      Hooks[hookName]?.(false);
    } catch (e) {}
  }

  paintAimRowExpiredUI();
  if (aimTimerEl) aimTimerEl.textContent = 'время исчерпано';
}

function updateAimTimerUI() {
  checkClockTamper();

  if (aimExpired()) {
    enforceAimLockUI();
    return;
  }
  paintAimRowActiveUI();
  const left = AIM_LIMIT_MS - aimElapsedMs();
  if (aimTimerEl) aimTimerEl.textContent = 'осталось ' + formatHHMMSS(left);
}

// Каждую секунду обновляем
setInterval(() => {
  updateAimTimerUI();
}, 1000);

// При сворачивании/возврате окна — закрываем возможности скрутки
document.addEventListener('visibilitychange', () => {
  // фиксируем накопленное и перевзводим сессию
  const add = Math.max(0, performance.now() - AIM.sessionPerfStart);
  AIM.elapsedMs = Math.min(AIM_LIMIT_MS, AIM.elapsedMs + add);
  AIM.sessionPerfStart = performance.now();
  persistAim();
  checkClockTamper();
  updateAimTimerUI();
});

// Первичная отрисовка
updateAimTimerUI();

  // ==============================
  // 🛠️ Зависимости
  // ==============================
  const leaves = [''];

  function startLeafFall() {
    if (globalWindow.leafCreationInterval || localStorage.getItem('leavesDisabled') === 'true') return;
    globalWindow.leafContainer = document.createElement('div');
    globalWindow.leafContainer.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999;`;
    document.body.appendChild(globalWindow.leafContainer);

    function createLeaf() {
      const leaf = document.createElement('span');
      leaf.textContent = leaves[Math.floor(Math.random() * leaves.length)];
      leaf.style.cssText = `position: absolute; font-size: ${Math.random() * 1.5 + 1.5}em; color: green; top: -1em; left: ${Math.random() * 100}%; animation: fall ${Math.random() * 5 + 5}s linear; opacity: ${Math.random() * 0.6 + 0.4}; transform: rotate(${Math.random() * 360}deg); will-change: transform;`;
      globalWindow.leafContainer.appendChild(leaf);
      leaf.addEventListener('animationend', () => leaf.remove());
    }

    const styleLeaves = document.createElement('style');
    styleLeaves.innerHTML = `@keyframes fall { to { transform: translateY(105vh) rotate(360deg); } }`;
    document.head.appendChild(styleLeaves);

    for (let i = 0; i < 12; i++) createLeaf();
    globalWindow.leafCreationInterval = setInterval(() => { for (let i = 0; i < 3; i++) createLeaf(); }, 900);
  }

  function stopLeafFall() {
    if (globalWindow.leafCreationInterval) clearInterval(globalWindow.leafCreationInterval);
    if (globalWindow.leafContainer) { globalWindow.leafContainer.remove(); globalWindow.leafContainer = null; }
    globalWindow.leafCreationInterval = null;
  }

  function zoomHack(scale = 1.0) {
    if (typeof globalWindow.game !== 'undefined' && globalWindow.game.originalWidth && globalWindow.game.originalHeight) {
      globalWindow.game.originalWidth = 1920 * scale;
      globalWindow.game.originalHeight = 1080 * scale;
    }
  }

  function wrapIsVisibleOnce() {
    const g = globalWindow.game;
    if (!g || g.__visWrapped) return;
    g.__visWrapped = true;

    const BASE_W = g.originalWidth;
    const BASE_H = g.originalHeight;

    globalWindow.originalIsVisible = g.isVisible;
    g.isVisible = function(camera, obj) {
      return globalWindow.originalIsVisible.call(this, camera, obj, BASE_W, BASE_H);
    };
  }

  function initESPScript() {
    if (globalWindow.espInitialized) return;

    function waitForGameLoad() {
      if (typeof globalWindow.game !== 'undefined' && globalWindow.game.canvas) {
        initESPFunctions();
      } else {
        setTimeout(waitForGameLoad, 500);
      }
    }

    function initESPFunctions() {
      globalWindow.espInitialized = true;
      let showEnemyLines = true;
      let enemyLineColor = '#FFFF00';
      let showEnemyNames = true;
      let showEnemyHealth = true;
      let showDistance = true;
      let showDangerIndicator = true;

      const menuContainer = document.createElement('div');
      menuContainer.id = 'espMenuContainer';
      menuContainer.style.cssText = `position: absolute; top: 50px; right: 10px; z-index: 1000; background-color: rgba(0, 0, 0, 0.7); padding: 10px; border-radius: 5px; color: white; font-family: Arial, sans-serif; font-size: 12px; border: 1px solid #444;`;
      const title = document.createElement('div');
      title.textContent = 'ESP Settings';
      title.style.cssText = `font-weight: bold; margin-bottom: 8px; color: #FFA500; text-align: center;`;
      menuContainer.appendChild(title);

      const createToggleSetting = (label, defaultValue, callback) => {
        const container = document.createElement('div');
        container.style.marginBottom = '5px';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'space-between';
        const labelElement = document.createElement('span');
        labelElement.textContent = label;
        labelElement.style.marginRight = '10px';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = defaultValue;
        toggle.style.cursor = 'pointer';
        toggle.addEventListener('change', () => callback(toggle.checked));
        container.appendChild(labelElement);
        container.appendChild(toggle);
        return container;
      };

      const createColorPicker = (label, defaultValue, callback) => {
        const container = document.createElement('div');
        container.style.marginBottom = '5px';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'space-between';
        const labelElement = document.createElement('span');
        labelElement.textContent = label;
        labelElement.style.marginRight = '10px';
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = defaultValue;
        picker.style.cursor = 'pointer';
        picker.style.width = '30px';
        picker.style.height = '20px';
        picker.addEventListener('input', () => callback(picker.value));
        container.appendChild(labelElement);
        container.appendChild(picker);
        return container;
      };

      menuContainer.appendChild(createToggleSetting('Show Enemy Lines', showEnemyLines, (val) => { showEnemyLines = val; }));
      menuContainer.appendChild(createToggleSetting('Show Names', showEnemyNames, (val) => { showEnemyNames = val; }));
      menuContainer.appendChild(createToggleSetting('Show Health', showEnemyHealth, (val) => { showEnemyHealth = val; }));
      menuContainer.appendChild(createToggleSetting('Show Distance', showDistance, (val) => { showDistance = val; }));
      menuContainer.appendChild(createToggleSetting('Danger Indicator', showDangerIndicator, (val) => { showDangerIndicator = val; }));
      menuContainer.appendChild(createColorPicker('Line Color', enemyLineColor, (val) => { enemyLineColor = val; }));
      document.body.appendChild(menuContainer);

      globalWindow.originalIsVisible = globalWindow.game.isVisible;
      globalWindow.game.isVisible = function(camera, obj, originalWidth, originalHeight) {
        if (obj.type === globalWindow.objectType.PLAYER && obj.inSafeZone) {
          return true;
        }
        return globalWindow.originalIsVisible.call(this, camera, obj, originalWidth, originalHeight);
      };

      globalWindow.originalDrawObject = globalWindow.game.drawObject;
      globalWindow.game.drawObject = function (obj, staticCanvas) {
        if ((obj.name.includes('cloud') || obj.name === 'swamp' || obj.name.includes('bush')) && globalWindow.game.isVisible(globalWindow.game.camera, obj)) {
          obj.opacity = 0.5;
          staticCanvas = false;
        }
        globalWindow.originalDrawObject.call(this, obj, staticCanvas);
      };

      function drawESP() {
        if (!showEnemyLines) return;
        const ctx = globalWindow.game.dynamicContext;
        const myPos = globalWindow.game.me.position;
        Object.values(globalWindow.game.gameObjects).forEach(obj => {
          if (obj.type === globalWindow.objectType.PLAYER && obj !== globalWindow.game.me &&
              globalWindow.game.isVisible(globalWindow.game.camera, obj, globalWindow.game.worldWidth, globalWindow.game.worldHeight)) {
            const enemyPos = obj.position;
            const distance = Math.round(Math.hypot(enemyPos.x - myPos.x, enemyPos.y - myPos.y));
            const renderMyPos = globalWindow.game.getRenderPosition(myPos.x + globalWindow.game.me.width / 2, myPos.y + globalWindow.game.me.height / 2);
            const renderEnemyPos = globalWindow.game.getRenderPosition(enemyPos.x + obj.width / 2, enemyPos.y + obj.height / 2);
            ctx.beginPath();
            ctx.moveTo(renderMyPos.x, renderMyPos.y);
            ctx.lineTo(renderEnemyPos.x, renderEnemyPos.y);
            if (showDangerIndicator && canEat(obj, globalWindow.game.me)) {
              ctx.strokeStyle = '#FF0000';
              ctx.lineWidth = 3;
            } else {
              ctx.strokeStyle = enemyLineColor;
              ctx.lineWidth = 2;
            }
            ctx.stroke();
            const boxSize = 40;
            ctx.strokeStyle = enemyLineColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(renderEnemyPos.x - boxSize / 2, renderEnemyPos.y - boxSize / 2, boxSize, boxSize);
            let infoText = '';
            if (showEnemyNames) infoText += obj.nick || 'Unknown';
            if (showEnemyHealth) infoText += ` HP:${Math.round(obj.hp)}`;
            if (showDistance) infoText += ` ${distance}m`;
            if (infoText) {
              ctx.font = 'bold 12px Arial';
              ctx.fillStyle = '#FFFFFF';
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 2;
              const textWidth = ctx.measureText(infoText).width;
              const textX = renderEnemyPos.x - textWidth / 2;
              const textY = renderEnemyPos.y - boxSize - 5;
              ctx.strokeText(infoText, textX, textY);
              ctx.fillText(infoText, textX, textY);
            }
            if (showDangerIndicator) {
              const dangerText = canEat(obj, globalWindow.game.me) ? 'DANGER!' : 'Safe';
              ctx.font = 'bold 14px Arial';
              ctx.fillStyle = canEat(obj, globalWindow.game.me) ? '#FF0000' : '#00FF00';
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 2;
              const dangerWidth = ctx.measureText(dangerText).width;
              const dangerX = renderEnemyPos.x - dangerWidth / 2;
              const dangerY = renderEnemyPos.y - boxSize - 25;
              ctx.strokeText(dangerText, dangerX, dangerY);
              ctx.fillText(dangerText, dangerX, dangerY);
            }
          }
        });
      }

      function canEat(eater, food) {
        if (!globalWindow.foodChain[eater.name] || !globalWindow.foodChain[eater.name].eats) return false;
        return globalWindow.foodChain[eater.name].eats[food.name];
      }

      globalWindow.originalBeforeDrawAllObjects = globalWindow.game.beforeDrawAllObjects;
      globalWindow.game.beforeDrawAllObjects = function () {
        globalWindow.originalBeforeDrawAllObjects.apply(this, arguments);
        drawESP();
      };
    }

    waitForGameLoad();
  }

  // ======================================
// === BOSS TIMER: module
// ======================================
const BossTimer = (() => {
  // ---------- UI ----------
  let bossContainer = null;
  let bossImage = null;
  let bossStatusText = null;
  let bossTimerText = null;

  // ---------- state ----------
  let observer = null;
  let reattachObserver = null;
  let fallbackId = null;
  let enabled = false;

  const pad = n => (n < 10 ? '0' + n : '' + n);
  const findOfficialTimerSpan = () => document.querySelector('.conditions .timer');

  // Резервный расчёт (на случай отсутствия оригинального таймера)
  function nextHourTs(ms) {
    const d = new Date(ms);
    d.setMinutes(60, 0, 0);
    return d.getTime();
  }

  function startFallbackTicker() {
    stopFallback();
    function render() {
      if (!enabled) return;
      const bossIndicator = document.querySelector('.bC');
      if (bossIndicator) {
        bossStatusText.innerText = 'THE BOSS IS ALIVE';
        bossTimerText.innerText = '';
      } else {
        const now = Date.now();
        const target = nextHourTs(now);
        const totalSec = Math.max(0, Math.ceil((target - now) / 1000));
        const minutes = Math.floor(totalSec / 60);
        const seconds = totalSec % 60;
        bossStatusText.innerText = '';
        bossTimerText.innerText = 'Boss Timer: ' + pad(minutes) + ':' + pad(seconds);
      }
      const delay = 1000 - (Date.now() % 1000);
      fallbackId = setTimeout(render, delay);
    }
    render();
  }

  function stopFallback() {
    if (fallbackId !== null) {
      clearTimeout(fallbackId);
      fallbackId = null;
    }
  }

  function startMirroring(offTimerSpan) {
    stopMirroring();
    const copyNow = () => {
      if (!enabled) return;
      const txt = offTimerSpan.textContent.trim();
      if (txt) {
        bossStatusText.innerText = '';
        bossTimerText.innerText = 'Boss Timer: ' + txt;
      }
    };
    copyNow();
    observer = new MutationObserver(copyNow);
    observer.observe(offTimerSpan, { characterData: true, childList: true, subtree: true });
  }

  function stopMirroring() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  function mountUI() {
    if (bossContainer) return;
    bossContainer = document.createElement('div');
    Object.assign(bossContainer.style, {
      position: 'absolute',
      top: '50px',
      right: '10px',
      zIndex: '9999',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    });

    bossImage = document.createElement('img');
    bossImage.src = 'https://cdn1.na.evoworld.io/sprites/bosses/boss1/flying/1.png';
    bossImage.style.width = '50px';

    bossStatusText = document.createElement('div');
    bossStatusText.style.fontSize = '16px';
    bossStatusText.style.color = '#000';

    bossTimerText = document.createElement('div');
    bossTimerText.style.fontSize = '16px';
    bossTimerText.style.color = '#fff';

    bossContainer.append(bossImage, bossStatusText, bossTimerText);
    document.body.appendChild(bossContainer);
  }

  function unmountUI() {
    if (bossContainer?.parentNode) bossContainer.parentNode.removeChild(bossContainer);
    bossContainer = bossImage = bossStatusText = bossTimerText = null;
  }

  function attachReattachWatcher() {
    detachReattachWatcher();
    const container = document.querySelector('.conditions');
    if (!container) return;
    reattachObserver = new MutationObserver(() => {
      const current = findOfficialTimerSpan();
      if (!current) {
        // Нет оригинала — включаем резервный тикер
        stopMirroring();
        startFallbackTicker();
      } else {
        stopFallback();
        stopMirroring();
        startMirroring(current);
      }
    });
    reattachObserver.observe(container, { childList: true, subtree: true });
  }

// ======================================
// === ANTI-AFK: module (без лишнего GUI)
// ======================================
(function AntiAFKModule(){
  const gw = globalWindow;

  let isAfkActive   = false;
  let afkIntervalID = null;
  let intervalMs    = state?.antiAfk?.intervalMs ?? 3000;

  function safeClick(){
    const canvas = document.getElementById('canvasGame') || gw.game?.canvas;
    if (!canvas) return;
    try { canvas.dispatchEvent(new Event('click')); } catch(e){}
  }

  function startAfk() {
    if (isAfkActive) return;
    isAfkActive = true;

    if (typeof gw.skillUse === 'function') gw.skillUse();
    safeClick(); // сразу «пнуть»

    afkIntervalID = setInterval(() => {
      safeClick();
      if (gw?.game?.me?.moveSpeed?.x < 6) safeClick();
    }, intervalMs);
  }

  function stopAfk() {
    if (!isAfkActive) return;

    if (typeof gw.skillStop === 'function') gw.skillStop();
    if (afkIntervalID) { clearInterval(afkIntervalID); afkIntervalID = null; }
    isAfkActive = false;
  }

  function setAntiAfkInterval(ms){
    intervalMs = Math.max(500, parseInt(ms,10) || 3000);
    if (isAfkActive) { stopAfk(); startAfk(); }
  }

  // Хуки из твоего каркаса — уже всё завязано на toggleFeature и слайдер интервала
  Hooks.onAntiAfkToggle = (enabled) => { enabled ? startAfk() : stopAfk(); };
  Hooks.onAntiAfkIntervalChange = (ms) => { setAntiAfkInterval(ms); };

  // Экспорт (на всякий)
  gw.startAfk = startAfk;
  gw.stopAfk  = stopAfk;
  gw.setAntiAfkInterval = setAntiAfkInterval;
})();

  function detachReattachWatcher() {
    if (reattachObserver) { reattachObserver.disconnect(); reattachObserver = null; }
  }

  function initLogic() {
    const off = findOfficialTimerSpan();
    if (off) {
      stopFallback();
      stopMirroring();
      startMirroring(off);
      attachReattachWatcher();
    } else {
      startFallbackTicker();
      attachReattachWatcher();
    }
  }

  return {
    enable() {
      if (enabled) return;
      enabled = true;
      mountUI();
      initLogic();
    },
    disable() {
      if (!enabled) return;
      enabled = false;
      stopFallback();
      stopMirroring();
      detachReattachWatcher();
      unmountUI();
    }
  };
})();

  // Зависимости для хитбоксов и атак
  globalWindow.imReaper = false;
  globalWindow.attackHitboxesFIX = {
    ghostlyReaperScythe: { left: 32, top: 16.5, width: 44, height: 98.5 },
    pumpkinGhostScythe: { left: 43, top: 68, width: 65, height: 150 },
    grimReaperScythe: { left: 44, top: 61, width: 58, height: 147 }
  };
  globalWindow.myAttackHitbox = globalWindow.attackHitboxesFIX.pumpkinGhostScythe;
  let leftReward = 0;
  let rightReward = 0;

  var canvas3 = document.createElement("canvas");
  document.body.appendChild(canvas3);
  canvas3.width = globalWindow.innerWidth;
  canvas3.height = globalWindow.innerHeight;
  var ctx3 = canvas3.getContext("2d");
  canvas3.style.position = "absolute";
  canvas3.style.top = "0";
  canvas3.style.left = "0";
  canvas3.style.zIndex = "99";
  canvas3.style.pointerEvents = "none";
  canvas3.style.background = "transparent";

  globalWindow.friendsList = JSON.parse(localStorage.getItem('evoFriends')) || [];
  function updateFriendsList() {
    try {
      localStorage.setItem('evoFriends', JSON.stringify(globalWindow.friendsList || []));
    } catch (e) {
      console.error('Error saving friends list to localStorage:', e);
    }
  }
  function isFriend(player) { return globalWindow.friendsList.includes(player.nick); }

  function drawScytheHitbox(entity, attackHitbox, isMe) {
    if (typeof globalWindow.game === "undefined" || typeof entity === "undefined" || !globalWindow.game.me || !entity.position || !globalWindow.game.me.position || isFriend(entity)) return;
    var pos = globalWindow.game.getRenderPosition(entity.position.x, entity.position.y);
    var hitboxWidth = attackHitbox.width * globalWindow.game.zoom * globalWindow.game.scaleX;
    var hitboxHeight = attackHitbox.height * globalWindow.game.zoom * globalWindow.game.scaleY;
    var entityWidth = entity.width * globalWindow.game.zoom * globalWindow.game.scaleX;
    var entityHeight = entity.height * globalWindow.game.zoom * globalWindow.game.scaleY;
    var centerPos = { y: pos.y - entityHeight / 2, x: pos.x + entityWidth / 2 };
    var leftRight = centerPos.x + attackHitbox.left * globalWindow.game.zoom * globalWindow.game.scaleX;
    var leftLeft  = centerPos.x - (attackHitbox.left * globalWindow.game.zoom * globalWindow.game.scaleX + hitboxWidth);
    var left = entity.direction > 0 ? leftRight : leftLeft;
    var top = centerPos.y - attackHitbox.top * globalWindow.game.zoom * globalWindow.game.scaleY;
    globalWindow.game.dynamicContext.lineWidth = 2;
    globalWindow.game.dynamicContext.strokeStyle = globalWindow.secondaryHitboxColor || "red";
    if (isMe) {
      globalWindow.game.dynamicContext.strokeRect(leftLeft, top, hitboxWidth, hitboxHeight);
      globalWindow.game.dynamicContext.strokeRect(leftRight, top, hitboxWidth, hitboxHeight);
    } else {
      globalWindow.game.dynamicContext.strokeRect(left, top, hitboxWidth, hitboxHeight);
    }
  }

  function checkScytheAttacks(playerCollider, attackHitbox) {
    if (typeof globalWindow.game === "undefined" || !globalWindow.game.me || !globalWindow.game.me.position) return;
    var pos = globalWindow.game.getRenderPosition(globalWindow.game.me.position.x, globalWindow.game.me.position.y);
    var hitboxWidth = attackHitbox.width * globalWindow.game.zoom * globalWindow.game.scaleX;
    var hitboxHeight = attackHitbox.height * globalWindow.game.zoom * globalWindow.game.scaleY;
    var myWidth = globalWindow.game.me.width * globalWindow.game.zoom * globalWindow.game.scaleX;
    var myHeight = globalWindow.game.me.height * globalWindow.game.zoom * globalWindow.game.scaleY;
    var centerPos = { y: pos.y - myHeight / 2, x: pos.x + myWidth / 2 };
    var leftRight = centerPos.x + attackHitbox.left * globalWindow.game.zoom * globalWindow.game.scaleX;
    var leftLeft  = centerPos.x - (attackHitbox.left * globalWindow.game.zoom * globalWindow.game.scaleX + hitboxWidth);
    var top = centerPos.y - attackHitbox.top * globalWindow.game.zoom * globalWindow.game.scaleY;
    var leftAttackHT = { top: top, left: leftLeft, right: leftLeft + hitboxWidth, bottom: top + hitboxHeight };
    var rightAttackHT= { top: top, left: leftRight, right: leftRight + hitboxWidth, bottom: top + hitboxHeight };
    var canHitLeft = doesRectsOverlap(leftAttackHT, playerCollider);
    var canHitRight= doesRectsOverlap(rightAttackHT, playerCollider);
    globalWindow.game.dynamicContext.lineWidth = 2;
    globalWindow.game.dynamicContext.strokeStyle = globalWindow.secondaryHitboxColor || "red";
    if (canHitLeft)  { globalWindow.game.dynamicContext.fillStyle = "rgba(255, 0, 0, 0.5)"; globalWindow.game.dynamicContext.fillRect(leftLeft, top, hitboxWidth, hitboxHeight); }
    if (canHitRight) { globalWindow.game.dynamicContext.fillStyle = "rgba(255, 0, 0, 0.5)"; globalWindow.game.dynamicContext.fillRect(leftRight, top, hitboxWidth, hitboxHeight); }
    return { canHitLeft: canHitLeft, canHitRight: canHitRight };
  }

  function processEntity(entity) {
    if (typeof globalWindow.game === "undefined" || typeof entity === "undefined" || !entity.position || isFriend(entity)) return false;
    var isMe = entity == globalWindow.game.me;
    var pos = globalWindow.game.getRenderPosition(entity.position.x, entity.position.y);
    var scaler = { x: globalWindow.game.zoom * globalWindow.game.scaleX, y: globalWindow.game.zoom * globalWindow.game.scaleY };
    var hitboxLeft =
      pos.x - (entity.width * scaler.x) / 2 +
      entity.colliderRectangleOffset.left * entity.width * scaler.x +
      (entity.width / 2) * scaler.x;
    var hitboxTop =
      pos.y - entity.height * scaler.y - (entity.height * scaler.y) / 2 +
      entity.colliderRectangleOffset.top * entity.height * scaler.y +
      (entity.height / 2) * scaler.y;
    var hitboxWidth =
      entity.width * scaler.x * (1 - entity.colliderRectangleOffset.right - entity.colliderRectangleOffset.left);
    var hitboxHeight =
      entity.height * scaler.y * (1 - entity.colliderRectangleOffset.top - entity.colliderRectangleOffset.bottom);
    var playerCollider = { top: hitboxTop, left: hitboxLeft, right: hitboxLeft + hitboxWidth, bottom: hitboxTop + hitboxHeight };

    var attackHitbox;
    switch (entity.name) {
      case "ghostlyReaper": attackHitbox = globalWindow.attackHitboxesFIX.ghostlyReaperScythe; break;
      case "pumpkinGhost":  attackHitbox = globalWindow.attackHitboxesFIX.pumpkinGhostScythe; break;
      case "grimReaper":    attackHitbox = globalWindow.attackHitboxesFIX.grimReaperScythe;   break;
    }
    if (attackHitbox && isMe) globalWindow.imReaper = true;
    if (attackHitbox) {
      if (isMe) globalWindow.myAttackHitbox = attackHitbox;
      drawScytheHitbox(entity, attackHitbox, isMe);
      if (!isMe) {
        var _a = checkScytheAttacks(playerCollider, globalWindow.myAttackHitbox),
            canHitLeft = _a.canHitLeft, canHitRight = _a.canHitRight;
        var reward = 0;
        if (entity.type == globalWindow.objectType.FOOD && globalWindow.game.me.hp < 100) {
          reward = 1;
        } else if (entity.name == "ghostlyReaper" || entity.name == "pumpkinGhost" || entity.name == "grimReaper") {
          reward = 50; if (entity.hp < 25) { reward = 100; }
        } else if (entity.type == globalWindow.objectType.PLAYER) {
          reward = 2; if (entity.hp < 25) { reward = 4; }
        }
        if (canHitLeft)  { leftReward  += reward; }
        if (canHitRight) { rightReward += reward; }
      }
    }
    globalWindow.game.dynamicContext.lineWidth = 2;
    globalWindow.game.dynamicContext.strokeStyle = globalWindow.primaryHitboxColor || "white";
    globalWindow.game.dynamicContext.strokeRect(hitboxLeft, hitboxTop, hitboxWidth, hitboxHeight);
  }

  function doesRectsOverlap(rect1, rect2) {
    if (rect1.left == rect1.right || rect1.top == rect1.bottom || rect2.left == rect2.right || rect2.top == rect2.bottom) return false;
    if (rect1.left >= rect2.right || rect2.left >= rect1.right) return false;
    if (rect1.top  >= rect2.bottom|| rect2.top  >= rect1.bottom) return false;
    return true;
  }

  // Стаб-заглушки
  globalWindow.skillUse = globalWindow.skillUse || function() { console.log('skillUse not defined'); };
  globalWindow.skillStop = globalWindow.skillStop || function() { console.log('skillStop not defined'); };
  globalWindow.objectType = globalWindow.objectType || { PLAYER: 1, FOOD: 2, BOSS: 3 };
  globalWindow.socketMsgType = globalWindow.socketMsgType || { FLY: 'fly', BOOST: 'boost' };
  globalWindow.visionType = globalWindow.visionType || 0;
  globalWindow.imDead = globalWindow.imDead || false;
  globalWindow.joinedGame = globalWindow.joinedGame || false;
  globalWindow.wasSocketInit = globalWindow.wasSocketInit || false;
  globalWindow.gameServer = globalWindow.gameServer || { emit: function() {} };
  globalWindow.game = globalWindow.game || { me: {}, zoom: 1, scaleX: 1, scaleY: 1, getRenderPosition: function(x,y) { return {x:x, y:y}; }, drawObject: function() {}, isVisible: function() { return true; } };
  globalWindow.foodChain = globalWindow.foodChain || {};

  // ==============================
  // ⚔️ attackScythe — улучшенная
  // ==============================
// В главный цикл добавьте эту улучшенную логику определения целей
globalWindow.attackScythe = (function(){
  const gw = globalWindow;
  if (!gw) return () => {};

  let running = false;
  const BURST = 2048;          // увеличен батч для максимальной агрессии
  const TIME_SLICE_MS = 8;     // увеличен временной слот
  const MIN_CD = 39;

  // Ultra-fast yield через setTimeout с нулевой задержкой
  const fastYield = () => new Promise(res => setTimeout(res, 0));

  // Кэшируем ВСЕ возможные вызовы
  let cachedSkillUse, cachedSkillStop, cachedGame, cachedMe, cachedGameServer, cachedSocketMsgType;

  const updateCache = () => {
    cachedSkillUse = gw.skillUse;
    cachedSkillStop = gw.skillStop;
    cachedGame = gw.game;
    cachedMe = cachedGame?.me;
    cachedGameServer = gw.gameServer;
    cachedSocketMsgType = gw.socketMsgType;
  };

  const canAct = () => {
    updateCache();
    return gw.imReaper && cachedMe && !cachedMe.isDead && cachedMe.skillCooldown <= MIN_CD;
  };

  const stopAttack = () => {
    running = false;
    cachedSkillStop?.();
  };

  // Вешаем обработчики один раз
  try {
    gw.game.on('die', stopAttack);
    gw.game.on('respawn', stopAttack);
  } catch(e){}

  // Быстрая смена направления с минимальной проверкой
  const quickDir = (() => {
    let lastDir = 1;
    return (d) => {
      if (lastDir === d) return;
      lastDir = d;
      try {
        if (cachedMe) cachedMe.flySide = d;
        if (cachedGameServer && cachedSocketMsgType) {
          cachedGameServer.emit(cachedSocketMsgType.FLY, d);
        }
      } catch(e){}
    };
  })();

  return async function attackScythe(){
    if (running || !canAct()) return;
    running = true;

    try {
      while (running) {
        // Супер-быстрая проверка целей
        const L = (typeof leftReward !== 'undefined') ? leftReward : 0;
        const R = (typeof rightReward !== 'undefined') ? rightReward : 0;

        if (L <= 0 && R <= 0) {
          cachedSkillStop?.();
          break;
        }

        // Мгновенное определение направления
        quickDir(L > R ? -1 : 1);

        const startTime = performance.now();
        let attackCount = 0;

        // АГРЕССИВНЫЙ БАТЧ - максимум атак за один проход
        while (attackCount < BURST && running) {
          // Обновляем кэш каждые 32 атаки
          if ((attackCount & 31) === 0) {
            updateCache();
            if (!cachedMe || cachedMe.skillCooldown > MIN_CD) break;
          }

          // МАКСИМАЛЬНАЯ СКОРОСТЬ АТАКИ - 8 вызовов за раз
          if (cachedSkillUse) {
            cachedSkillUse(); cachedSkillUse(); cachedSkillUse(); cachedSkillUse();
            cachedSkillUse(); cachedSkillUse(); cachedSkillUse(); cachedSkillUse();
            attackCount += 8;
          }

          // Быстрая проверка на выход
          if ((performance.now() - startTime) > TIME_SLICE_MS) break;

          // Мгновенная проверка целей
          if ((L <= 0 && R <= 0) || !cachedMe || cachedMe.isDead) {
            cachedSkillStop?.();
            running = false;
            break;
          }
        }

        // Микро-пауза чтобы не заблокировать поток
        await fastYield();
      }
    } catch (err) {
      console.error('ULTRA ATTACK ERROR', err);
    } finally {
      running = false;
    }
  };
})();

  // ==============================
  // 🔄 Spin Attack (крутилка): UI + логика + автозапуск
  // ==============================
  (function addSpinUIAndLogic(){
    // UI строка (вставим сразу после Auto Flick)
    const aimSection = document.querySelector('[data-section="aim"]');
    if (!aimSection) return;
    const spinRow = document.createElement('div');
    spinRow.className = 'tmc-row';
    spinRow.innerHTML = `
      <div class="tmc-col">
        <div>
          <div class="tmc-label">Spin Bot</div>
          <div class="tmc-note">Крутилка</div>
        </div>
      </div>
      <div class="tmc-col" style="gap:10px;">
        <span class="tmc-value" id="tmc-spin-val">${state.spin.speedMs}ms</span>
        <input id="tmc-spin" class="tmc-slider" type="range" min="50" max="1000" step="10" value="${state.spin.speedMs}">
        <div class="tmc-toggle" id="tmc-spin-toggle"></div>
        <button class="tmc-key" id="bind-spin" title="Привязать клавишу">bind</button>
      </div>
    `;
    const afterAutoFlick = aimSection.querySelector('#tmc-autoflick')?.closest('.tmc-row');
    if (afterAutoFlick?.nextSibling) aimSection.insertBefore(spinRow, afterAutoFlick.nextSibling);
    else aimSection.appendChild(spinRow);

    const spinSlider = spinRow.querySelector('#tmc-spin');
    const spinVal = spinRow.querySelector('#tmc-spin-val');
    const spinToggle = spinRow.querySelector('#tmc-spin-toggle');
    const bindBtn = spinRow.querySelector('#bind-spin');

    spinToggle.classList.toggle('on', !!state.spin.enabled);
    spinSlider.addEventListener('input', () => {
      state.spin.speedMs = parseInt(spinSlider.value, 10);
      spinVal.textContent = state.spin.speedMs + 'ms';
      saveState();
      Hooks.onSpinSpeedChange(state.spin.speedMs);
    });
    spinToggle.addEventListener('click', () => {
      state.spin.enabled = !state.spin.enabled;
      spinToggle.classList.toggle('on', !!state.spin.enabled);
      saveState();
      Hooks.onSpinToggle(state.spin.enabled);
    });

    if (state.spin.enabled && aimExpired()) {
  state.spin.enabled = false;
  spinToggle.classList.remove('on');
  saveState();
  notify('Aim недоступен: время истекло');
  return;
}

    // Подключаем к системе биндов
    bindButtons.spin = bindBtn;
    bindBtn.addEventListener('click', () => {
      keyListeningFor = 'spin';
      bindBtn.classList.add('wait');
      bindBtn.textContent = '...';
    });

    // Реализация логики крутилки
    const gw = globalWindow;
    let spinRunning = false;
    let spinTimer = null;
    let dir = -1;
    let lastAttackHadTargets = false;
    let currentSpinInterval = Math.max(50, parseInt(state.spin.speedMs||200,10));

    function tickSpin() {
      // цель появилась → стопим, дальше ударит attackScythe
      if ((leftReward|0) > 0 || (rightReward|0) > 0) { stopSpin(); return; }
      dir = (dir === -1 ? 1 : -1);
      const me = gw.game && gw.game.me;
      if (!me) return;
      if (me.flySide !== dir) {
        me.flySide = dir;
        if (gw.gameServer && gw.socketMsgType) {
          try { gw.gameServer.emit(gw.socketMsgType.FLY, dir); } catch(e){}
        }
      }
    }

    function startSpin() {
      if (aimExpired() || spinRunning) return;
      const me = gw.game && gw.game.me;
      if (!me) return;
      spinRunning = true;
      dir = me.flySide ?? -1;
      clearInterval(spinTimer);
      spinTimer = setInterval(tickSpin, currentSpinInterval);
    }

    function stopSpin() {
      if (!spinRunning) return;
      clearInterval(spinTimer);
      spinTimer = null;
      spinRunning = false;
    }

    function setSpinSpeed(ms) {
      currentSpinInterval = Math.max(50, parseInt(ms||200,10));
      if (spinRunning) { stopSpin(); startSpin(); }
    }

    gw.startSpin = startSpin;
    gw.stopSpin = stopSpin;
    gw.setSpinSpeed = setSpinSpeed;

    // Контроллер автозапуска / автостопа
    setInterval(() => {
      const g = gw.game;
      if (!g || !g.me || !gw.imReaper) return;
      if (!state.spin || !state.spin.enabled) { stopSpin(); return; }

      const me = g.me;
      const hasTargets = ((leftReward|0) > 0) || ((rightReward|0) > 0);

      if (hasTargets) {
        if (spinRunning) stopSpin();
        lastAttackHadTargets = true;
        return;
      }
      if (me.skillCooldown > 39) { stopSpin(); return; } // при высоком кулдауне — не спамим полёт

      if (!hasTargets && lastAttackHadTargets) {
        lastAttackHadTargets = false;
        if (!spinRunning) startSpin();
        return;
      }
      if (!spinRunning) startSpin();
    }, 50);
  })();

  // ==============================
  // ⚙️ Auto Flick (как в исходнике)
  // ==============================
  function autoFlick() {
    if (!globalWindow.autoFlickActive || !globalWindow.imReaper || typeof globalWindow.game === 'undefined' || !globalWindow.game.me || globalWindow.imDead) return;
    let minDist = Infinity;
    Object.values(globalWindow.game.gameObjects).forEach(entity => {
      if (entity.type === globalWindow.objectType.PLAYER && entity !== globalWindow.game.me && !isFriend(entity)) {
        let dx = entity.position.x - globalWindow.game.me.position.x;
        let dy = entity.position.y - globalWindow.game.me.position.y;
        let dist = Math.hypot(dx, dy);
        if (dist < minDist) minDist = dist;
      }
    });
    const distanceThreshold = 50;
    if (minDist < distanceThreshold) {
      if (globalWindow.game.me.flySide !== -1) {
        globalWindow.game.me.flySide = -1;
        if (typeof globalWindow.gameServer !== 'undefined') globalWindow.gameServer.emit(globalWindow.socketMsgType.FLY, -1);
      }
      if (typeof globalWindow.skillUse === 'function') globalWindow.skillUse();
    }
  }

  // ==============================
  // 🌀 Главный цикл
  // ==============================
  setInterval(function () {
    if (typeof globalWindow.game === "undefined" || typeof globalWindow.gameServer === "undefined") {
      return;
    }
    if (!globalWindow.wasSocketInit || !globalWindow.joinedGame || !globalWindow.game.me || !globalWindow.game.zoom || !globalWindow.game.me.width) {
      return;
    }
    if (!globalWindow.alreadySet && !globalWindow.imDead) {
      var originaldrawFunc = globalWindow.draw;
      globalWindow.draw = function () {
        globalWindow.attackScythe(); // атака
        leftReward = 0;
        rightReward = 0;
        if (typeof originaldrawFunc === 'function') originaldrawFunc.apply(this);
      };
      var originaldrawObject = globalWindow.game.drawObject;
      globalWindow.game.drawObject = function (entity, boolSomething) {
        if (globalWindow.toggleHack && entity.position) {
          if ((entity.type == globalWindow.objectType.PLAYER ||
               (entity.type == globalWindow.objectType.FOOD && entity.hasSoul) ||
               entity.type == globalWindow.objectType.BOSS) &&
              !entity.inHide && !isFriend(entity)) {
            processEntity(entity);
          }
        }
        if (typeof originaldrawObject === 'function') originaldrawObject.apply(this, [entity, boolSomething]);
      };
      globalWindow.alreadySet = true;
    }
    if (ctx3) ctx3.clearRect(0, 0, canvas3.width, canvas3.height);
    if (!globalWindow.toggleHack) {
      return;
    }
    canvas3.width = globalWindow.innerWidth;
    canvas3.height = globalWindow.innerHeight;
    var name = globalWindow.game.me.name;
    name = "pumpkinGhost"; // фикс исходника
    if (name == "ghostlyReaper" || name == "pumpkinGhost" || name == "grimReaper") {
      var myAttackHitbox;
      switch (name) {
        case "ghostlyReaper": myAttackHitbox = globalWindow.attackHitboxesFIX.ghostlyReaperScythe; break;
        case "pumpkinGhost":  myAttackHitbox = globalWindow.attackHitboxesFIX.pumpkinGhostScythe; break;
        case "grimReaper":    myAttackHitbox = globalWindow.attackHitboxesFIX.grimReaperScythe;   break;
      }
    }
    autoFlick();
  }, 16);
})();

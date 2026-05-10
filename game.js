// ─── Canvas setup ───────────────────────────────────────────────────────────
const bgCanvas  = document.getElementById('bg-canvas');
const bgCtx     = bgCanvas.getContext('2d');
const canvas    = document.getElementById('game-canvas');
const ctx       = canvas.getContext('2d');
const scoreEl   = document.getElementById('score-val');
const bestEl    = document.getElementById('best-val');
const overlay   = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub   = document.getElementById('overlay-sub');
const startBtn  = document.getElementById('start-btn');
const powerFill  = document.getElementById('power-fill');
const powerLabel = document.getElementById('power-label');

let W, H;
function resize() {
  W = bgCanvas.width  = canvas.width  = window.innerWidth;
  H = bgCanvas.height = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ─── State ───────────────────────────────────────────────────────────────────
let state  = 'start'; // 'start' | 'play' | 'dead'
let score  = 0;
let best   = 0;
let frame  = 0;
let shake  = 0;
let power     = 0;
let novaFlash = 0;
let novaUses  = 0;
const POWER_MAX = 100;

// ─── Player ──────────────────────────────────────────────────────────────────
const player = { x: 0, y: 0, r: 11, vx: 0, vy: 0, tilt: 0 };

// ─── Keys ────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  if (e.key === ' ') {
    e.preventDefault(); // stop space from clicking focused buttons
    if (state === 'play' && power >= POWER_MAX) activateNova();
    return;
  }
  keys[e.key] = true;
});
window.addEventListener('keyup',   e => { keys[e.key] = false; });

// ─── Parallax star layers ─────────────────────────────────────────────────────
// Each layer scrolls at a different speed, simulating depth.
const STAR_LAYERS = [
  { stars: [], speed: 0.3, size: 0.6, alpha: 0.3 },
  { stars: [], speed: 0.8, size: 1.0, alpha: 0.5 },
  { stars: [], speed: 1.8, size: 1.6, alpha: 0.8 },
  { stars: [], speed: 3.2, size: 2.4, alpha: 1.0 },
];

function initStars() {
  STAR_LAYERS.forEach(layer => {
    layer.stars = [];
    const count = layer === STAR_LAYERS[0] ? 200 : layer === STAR_LAYERS[1] ? 120 : layer === STAR_LAYERS[2] ? 60 : 25;
    for (let i = 0; i < count; i++) {
      layer.stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  });
}
initStars();

// ─── Asteroids ───────────────────────────────────────────────────────────────
let asteroids = [];

function spawnAsteroid() {
  // Spawn from a random edge
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  if      (edge === 0) { x = Math.random() * W; y = -30; }
  else if (edge === 1) { x = W + 30;            y = Math.random() * H; }
  else if (edge === 2) { x = Math.random() * W; y = H + 30; }
  else                 { x = -30;               y = Math.random() * H; }

  const r     = 10 + Math.random() * 20;
  const sides = Math.floor(Math.random() * 4) + 5;
  const wobble = Array.from({ length: sides }, () => 0.65 + Math.random() * 0.7);

  // Base speed scales with score
  const baseSpeed = 1.2 + score * 0.014;

  // Each asteroid has a "homing factor" — how aggressively it steers toward player
  // Early game: low homing. Later: relentless.
  const homing = Math.min(0.04 + score * 0.0006, 0.18);

  // Initial velocity points vaguely toward center (not player yet, so spawns feel fair)
  const angle = Math.atan2(H / 2 - y, W / 2 - x) + (Math.random() - 0.5) * 1.2;
  asteroids.push({
    x, y,
    vx: Math.cos(angle) * baseSpeed,
    vy: Math.sin(angle) * baseSpeed,
    r, sides, wobble,
    homing,
    baseSpeed,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.05,
    glowPulse: Math.random() * Math.PI * 2,
  });
}

// ─── Particles ───────────────────────────────────────────────────────────────
let particles = [];

function spawnExplosion(x, y) {
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5;
    const hue   = Math.random() < 0.5 ? 30 : 200; // orange or blue
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.025 + Math.random() * 0.025,
      r: 2 + Math.random() * 4,
      hue,
    });
  }
}

function spawnTrail(x, y) {
  particles.push({
    x: x + (Math.random() - 0.5) * 6,
    y: y + 12 + Math.random() * 6,
    vx: (Math.random() - 0.5) * 0.5,
    vy: 0.5 + Math.random() * 1,
    life: 0.6,
    decay: 0.04 + Math.random() * 0.03,
    r: 1 + Math.random() * 2,
    hue: 190 + Math.random() * 30,
    isTrail: true,
  });
}

// ─── Overlay helpers ─────────────────────────────────────────────────────────
let scoreBadge   = null; // { value, isNewBest }

function showOverlay(title, sub, btn, score = null, isNewBest = false) {
  overlayTitle.textContent = title;
  overlaySub.innerHTML = sub;
  startBtn.textContent = btn;
  scoreBadge = score !== null ? { value: score, isNewBest } : null;

  // Remove old score el if any
  const old = document.getElementById('score-display');
  if (old) old.remove();
  const oldBadge = document.getElementById('new-best-badge');
  if (oldBadge) oldBadge.remove();

  if (scoreBadge) {
    const sd = document.createElement('div');
    sd.id = 'score-display';
    sd.className = 'show';
    sd.textContent = scoreBadge.value;
    overlayTitle.after(sd);

    if (isNewBest) {
      const nb = document.createElement('div');
      nb.id = 'new-best-badge';
      nb.className = 'show';
      nb.textContent = '✦ NEW BEST ✦';
      sd.after(nb);
    }
  }

  overlay.classList.add('visible');
}

function hideOverlay() {
  overlay.classList.remove('visible');
}

// ─── Game control ─────────────────────────────────────────────────────────────
function activateNova() {
  asteroids.forEach(a => spawnExplosion(a.x, a.y));
  asteroids  = [];
  power      = 0;
  novaUses++;
  novaFlash  = 1;
  shake      = 5;
  powerFill.classList.remove('ready');
  powerLabel.classList.remove('ready');
  powerLabel.textContent = 'NOVA';
}

function startGame() {
  state       = 'play';
  score       = 0;
  frame       = 0;
  shake       = 0;
  power       = 0;
  novaFlash   = 0;
  novaUses    = 0;
  asteroids   = [];
  particles   = [];
  player.x    = W / 2;
  player.y    = H - 120;
  player.vx   = 0;
  player.vy   = 0;
  player.tilt = 0;
  powerFill.style.width = '0%';
  powerFill.classList.remove('ready');
  powerLabel.classList.remove('ready');
  powerLabel.textContent = 'NOVA';
  hideOverlay();
}

startBtn.addEventListener('click', () => { startGame(); startBtn.blur(); });

// ─── Input handled via keydown/keyup above ───────────────────────────────────

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawShip(x, y, tilt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt * 0.4);

  ctx.shadowBlur   = 18;
  ctx.shadowColor  = 'rgba(100,200,255,0.9)';
  ctx.strokeStyle  = 'rgba(100,210,255,0.85)';
  ctx.lineWidth    = 1.8;

  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(11, 11);
  ctx.lineTo(0,   6);
  ctx.lineTo(-11, 11);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = 'rgba(100,200,255,0.08)';
  ctx.fill();

  ctx.shadowBlur  = 8;
  ctx.fillStyle   = '#aef';
  ctx.beginPath();
  ctx.arc(0, -3, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawAsteroid(a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.rot);

  a.glowPulse += 0.04;
  const glow = 4 + Math.sin(a.glowPulse) * 3;

  ctx.shadowBlur  = glow;
  ctx.shadowColor = 'rgba(255,160,80,0.5)';
  ctx.strokeStyle = `rgba(200,170,130,0.9)`;
  ctx.lineWidth   = 1.5;

  ctx.beginPath();
  for (let i = 0; i < a.sides; i++) {
    const angle = (i / a.sides) * Math.PI * 2;
    const dist  = a.r * a.wobble[i];
    const px    = Math.cos(angle) * dist;
    const py    = Math.sin(angle) * dist;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = 'rgba(120,95,70,0.25)';
  ctx.fill();

  ctx.restore();
}

// ─── Background: parallax starfield ──────────────────────────────────────────
function drawBackground() {
  bgCtx.fillStyle = '#02010f';
  bgCtx.fillRect(0, 0, W, H);

  STAR_LAYERS.forEach(layer => {
    layer.stars.forEach(star => {
      // Scroll downward (player moving "forward")
      star.y += layer.speed * (state === 'play' ? 1 : 0.25);
      if (star.y > H + 4) { star.y = -4; star.x = Math.random() * W; }
      star.twinkle += 0.04;
      const alpha = layer.alpha * (0.7 + Math.sin(star.twinkle) * 0.3);
      bgCtx.fillStyle = `rgba(210,230,255,${alpha})`;
      bgCtx.beginPath();
      bgCtx.arc(star.x, star.y, layer.size, 0, Math.PI * 2);
      bgCtx.fill();
    });
  });
}

// ─── Collision ────────────────────────────────────────────────────────────────
function collides(a) {
  const dx = a.x - player.x;
  const dy = a.y - player.y;
  return dx * dx + dy * dy < (a.r + player.r - 5) ** 2;
}

// ─── Main loop ────────────────────────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);

  drawBackground();

  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake * 7, (Math.random() - 0.5) * shake * 7);
    shake = Math.max(0, shake - 0.6);
  }

  ctx.clearRect(-20, -20, W + 40, H + 40);

  // ── Nova flash ──
  if (novaFlash > 0) {
    ctx.save();
    ctx.globalAlpha = novaFlash * 0.6;
    ctx.fillStyle = 'rgba(180, 230, 255, 1)';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.restore();
    novaFlash = Math.max(0, novaFlash - 0.07);
  }

  // ── Particles ──
  particles.forEach(p => {
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += p.isTrail ? -0.05 : 0.08; // trail floats up slightly
    p.life -= p.decay;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = `hsl(${p.hue}, 100%, ${p.isTrail ? 70 : 65}%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0, p.r * p.life), 0, Math.PI * 2);
    ctx.fill();
  });
  particles = particles.filter(p => p.life > 0);
  ctx.globalAlpha = 1;

  if (state === 'play') {
    frame++;
    score += 0.05;
    scoreEl.textContent = Math.floor(score);

    // Spawn rate tightens with score
    const spawnEvery = Math.max(18, 90 - score * 0.65);
    if (frame % Math.floor(spawnEvery) === 0) spawnAsteroid();

    // ── Keyboard movement ──
    const ACCEL   = 0.5;
    const MAX_SPD = 6;
    const FRICTION = 0.88;

    const goLeft  = keys['ArrowLeft']  || keys['a'] || keys['A'];
    const goRight = keys['ArrowRight'] || keys['d'] || keys['D'];
    const goUp    = keys['ArrowUp']    || keys['w'] || keys['W'];
    const goDown  = keys['ArrowDown']  || keys['s'] || keys['S'];

    if (goLeft)  player.vx -= ACCEL;
    if (goRight) player.vx += ACCEL;
    if (goUp)    player.vy -= ACCEL;
    if (goDown)  player.vy += ACCEL;

    player.vx = Math.max(-MAX_SPD, Math.min(MAX_SPD, player.vx)) * FRICTION;
    player.vy = Math.max(-MAX_SPD, Math.min(MAX_SPD, player.vy)) * FRICTION;

    // Tilt ship toward movement direction
    const targetTilt = player.vx / MAX_SPD;
    player.tilt += (targetTilt - player.tilt) * 0.15;

    player.x = Math.max(14, Math.min(W - 14, player.x + player.vx));
    player.y = Math.max(14, Math.min(H - 14, player.y + player.vy));

    // Engine trail
    if (frame % 2 === 0) spawnTrail(player.x, player.y);

    // Update asteroids — homing behavior
    asteroids.forEach(a => {
      // Steer vx/vy toward player
      const dx    = player.x - a.x;
      const dy    = player.y - a.y;
      const dist  = Math.sqrt(dx * dx + dy * dy) || 1;
      const tx    = (dx / dist) * a.baseSpeed;
      const ty    = (dy / dist) * a.baseSpeed;

      // Blend current velocity toward target direction
      a.vx += (tx - a.vx) * a.homing;
      a.vy += (ty - a.vy) * a.homing;

      // Clamp to base speed
      const spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      if (spd > a.baseSpeed * 1.1) {
        a.vx = (a.vx / spd) * a.baseSpeed * 1.1;
        a.vy = (a.vy / spd) * a.baseSpeed * 1.1;
      }

      a.x   += a.vx;
      a.y   += a.vy;
      a.rot += a.rotSpeed;
    });

    // Asteroid-asteroid collision — destroy both on impact
    const toDestroy = new Set();
    for (let i = 0; i < asteroids.length; i++) {
      for (let j = i + 1; j < asteroids.length; j++) {
        const a = asteroids[i], b = asteroids[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy < (a.r + b.r) ** 2) {
          toDestroy.add(i);
          toDestroy.add(j);
        }
      }
    }
    if (toDestroy.size > 0) {
      toDestroy.forEach(i => spawnExplosion(asteroids[i].x, asteroids[i].y));
      asteroids = asteroids.filter((_, i) => !toDestroy.has(i));
    }

    // Cull off-screen asteroids (only if very far off and moving away)
    asteroids = asteroids.filter(a => {
      const far = 120;
      return !(a.x < -far && a.vx < 0) && !(a.x > W + far && a.vx > 0) &&
             !(a.y < -far && a.vy < 0) && !(a.y > H + far && a.vy > 0);
    });

    // Draw asteroids
    asteroids.forEach(drawAsteroid);

    // Power bar — recharge slows 40% per use
    if (power < POWER_MAX) power += 0.12 / (1 + novaUses * 0.4);
    const pct = Math.min(power / POWER_MAX, 1);
    powerFill.style.width = (pct * 100) + '%';
    if (power >= POWER_MAX) {
      powerFill.classList.add('ready');
      powerLabel.classList.add('ready');
      powerLabel.textContent = 'NOVA — SPACE';
    }

    drawShip(player.x, player.y, player.tilt);

    // Collision check
    const hit = asteroids.some(collides);
    if (hit) {
      spawnExplosion(player.x, player.y);
      shake = 8;
      const isNewBest = Math.floor(score) > best;
      if (isNewBest) best = Math.floor(score);
      bestEl.textContent = Math.floor(best);
      state = 'dead';
      setTimeout(() => {
        showOverlay(
          'DESTROYED',
          `You survived <strong style="color:#fff">${Math.floor(score)}</strong> seconds`,
          'TRY AGAIN',
          Math.floor(score),
          isNewBest
        );
      }, 900);
    }
  }

  ctx.restore();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
showOverlay(
  'STARFIELD DODGE',
  'Use ← → or A D to move your ship.<br>W S or ↑ ↓ to move up and down.<br>The asteroids will hunt you down.',
  'LAUNCH'
);

loop();

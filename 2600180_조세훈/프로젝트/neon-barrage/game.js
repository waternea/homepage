(() => {
'use strict';

// ============================================================
//  NEON BARRAGE - 세로 스크롤 탄막 슈팅
//  고정 타임스텝(60Hz) 로직 + 렌더 분리
// ============================================================

const W = 480, H = 640, PW = 720;      // 플레이필드 / 전체 캔버스 크기
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = PW; cv.height = H;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FONT = '"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif';

const DIFFS = [
  { name: 'EASY',   speed: 0.8,  dens: 0.6, interval: 1.25 },
  { name: 'NORMAL', speed: 1.0,  dens: 1.0, interval: 1.0 },
  { name: 'HARD',   speed: 1.12, dens: 1.4, interval: 0.85 },
];
let diffIdx = 1;
let diff = DIFFS[diffIdx];

// ------------------------------------------------------------
//  입력
// ------------------------------------------------------------
const keys = {};
const pressed = {};
const BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
addEventListener('keydown', e => {
  if (BLOCK.includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  Sound.init();
  if (e.code === 'KeyM') Sound.toggleMute();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const held = (...c) => c.some(k => keys[k]);
const hit = (...c) => c.some(k => pressed[k]);

// ------------------------------------------------------------
//  게임 상태
// ------------------------------------------------------------
let scene = 'title';            // title | play | pause | over | clear
let player, stage, boss = null;
let bullets = [], bpool = [], shots = [], enemies = [], items = [], parts = [];
let shake = 0, bombFx = null, msg = null, bonusInfo = null;
let hiscore = 0;
let bgT = 0;

const stars = Array.from({ length: 70 }, () => ({
  x: Math.random() * PW, y: Math.random() * H, s: rand(0.3, 1.6), a: rand(0.2, 0.8),
}));

function hiKey() { return 'neon_barrage_hi_' + diff.name; }
function loadHi() { try { hiscore = parseInt(localStorage.getItem(hiKey()) || '0', 10) || 0; } catch (e) { hiscore = 0; } }
function saveHi() {
  if (player.score > hiscore) {
    hiscore = player.score;
    try { localStorage.setItem(hiKey(), String(hiscore)); } catch (e) { /* 무시 */ }
  }
}

function newGame() {
  diff = DIFFS[diffIdx];
  loadHi();
  player = {
    x: W / 2, y: H - 80, focus: false,
    lives: 3, bombs: 3, invuln: 120, dead: 0, bombT: 0, shootT: 0,
    score: 0, graze: 0,
  };
  for (const b of bullets) bpool.push(b);
  bullets = []; shots = []; enemies = []; items = []; parts = [];
  boss = null; bombFx = null; msg = null; bonusInfo = null; shake = 0;
  stage = { t: 0, idx: 0, events: buildStage(), wait: false, bannerT: 150, clearT: 0 };
  scene = 'play';
}

const mult = () => 1 + Math.min(player.graze, 500) / 250;   // 그레이즈 배율 (최대 x3)

// ------------------------------------------------------------
//  스테이지 스크립트
// ------------------------------------------------------------
function buildStage() {
  const ev = [];
  const add = (t, e) => ev.push({ t, e });
  // 웨이브 A: 위에서 직진
  for (let i = 0; i < 5; i++) add(120 + i * 40, { path: 'down', x: 80 + i * 80, hp: 3, pattern: 'aim1', color: '#4cc9f0' });
  // 웨이브 B: 사인파
  for (let i = 0; i < 6; i++) add(480 + i * 35, { path: 'sine', x: i % 2 ? 340 : 140, hp: 4, pattern: 'ring8', color: '#ffb703' });
  // 웨이브 C: 좌우 교차
  for (let i = 0; i < 5; i++) {
    add(840 + i * 30, { path: 'fromLeft', y: 90 + i * 12, hp: 4, pattern: 'aim1', color: '#ff8fab' });
    add(840 + i * 30, { path: 'fromRight', y: 130 + i * 12, hp: 4, pattern: 'aim1', color: '#ff8fab' });
  }
  // 웨이브 D: 정지형 중형
  add(1200, { path: 'stop', x: 140, y: 130, stay: 360, hp: 14, size: 17, pattern: 'fan5', color: '#c77dff' });
  add(1200, { path: 'stop', x: 340, y: 130, stay: 360, hp: 14, size: 17, pattern: 'twin', color: '#c77dff' });
  // 중간보스
  add(1750, { boss: 'mid' });
  // 후반 웨이브
  add(1900, { path: 'stop', x: 240, y: 100, stay: 420, hp: 24, size: 18, pattern: 'spray', color: '#80ffdb' });
  for (let i = 0; i < 6; i++) add(2100 + i * 40, { path: 'sine', x: i % 2 ? 380 : 100, hp: 5, pattern: 'aim3', color: '#ffb703' });
  for (let i = 0; i < 4; i++) {
    add(2500 + i * 50, { path: 'fromLeft', y: 80 + i * 20, hp: 6, pattern: 'ring8', color: '#4cc9f0' });
    add(2500 + i * 50, { path: 'fromRight', y: 100 + i * 20, hp: 6, pattern: 'ring8', color: '#4cc9f0' });
  }
  add(2900, { path: 'stop', x: 120, y: 120, stay: 300, hp: 16, size: 17, pattern: 'twin', color: '#ff8fab' });
  add(2900, { path: 'stop', x: 360, y: 120, stay: 300, hp: 16, size: 17, pattern: 'fan5', color: '#ff8fab' });
  add(3300, { boss: 'boss' });
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

// ------------------------------------------------------------
//  탄 / 이미터
// ------------------------------------------------------------
const SP = {};
function sprite(color, r) {
  const k = color + r;
  if (SP[k]) return SP[k];
  const s = Math.ceil((r + 7) * 2);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.shadowColor = color; g.shadowBlur = 7;
  g.fillStyle = color;
  g.beginPath(); g.arc(s / 2, s / 2, r, 0, TAU); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(s / 2, s / 2, r * 0.55, 0, TAU); g.fill();
  SP[k] = c;
  return c;
}

function spawnBullet(x, y, ang, speed, d) {
  if (bullets.length > 5000) return;
  const b = bpool.pop() || {};
  b.x = x; b.y = y; b.ang = ang; b.speed = speed;
  b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed;
  b.accel = (d.accel || 0) * diff.speed;
  b.min = d.min !== undefined ? d.min : 0;
  b.max = d.max !== undefined ? d.max : 99;
  b.curve = d.curve || 0;
  b.r = d.r || 4;
  b.color = d.color || '#ffffff';
  b.grazed = false;
  bullets.push(b);
}

function removeBullet(i) {
  const b = bullets[i];
  bullets[i] = bullets[bullets.length - 1];
  bullets.pop();
  bpool.push(b);
}

function clearBullets(toItems) {
  for (const b of bullets) {
    if (toItems && items.length < 250 && Math.random() < 0.35) addItem(b.x, b.y, true);
    bpool.push(b);
  }
  bullets.length = 0;
}

function makeEmitters(name) {
  const list = typeof name === 'string' ? PATTERNS[name] : name;
  return list.map(d => ({ d, timer: 0, shots: 0 }));
}

function runEmitters(ems, ox, oy) {
  for (const s of ems) {
    const d = s.d;
    s.timer++;
    const t = s.timer - (d.delay || 0);
    if (t < 0) continue;
    const every = Math.max(1, Math.round(d.every * diff.interval));
    if (t % every === 0) fire(s, d, ox, oy);
  }
}

function fire(s, d, ox, oy) {
  const p = player;
  if (d.kind === 'rain') {
    const gx = W / 2 + Math.sin(s.shots * (d.gapRate || 0.3)) * (W / 2 - 90);
    const sp = d.spacing / diff.dens;
    for (let x = 15; x < W; x += sp) {
      if (Math.abs(x - gx) < d.gap) continue;
      spawnBullet(x, -8, DOWN, d.speed * diff.speed, d);
    }
    s.shots++;
    return;
  }
  const count = Math.max(1, Math.round(d.count * (d.count > 1 ? diff.dens : 1)));
  let base = d.aim ? Math.atan2(p.y - oy, p.x - ox) : (d.angle !== undefined ? d.angle : DOWN);
  base += (d.spin || 0) * s.shots;
  if (d.swing) base += Math.sin(s.shots * (d.swingRate || 0.2)) * d.swing;
  if (d.jitter) base += (Math.random() - 0.5) * d.jitter;
  const rows = d.rows || 1;
  for (let r = 0; r < rows; r++) {
    const sp = (d.speed + r * (d.rowStep || 0)) * diff.speed;
    for (let i = 0; i < count; i++) {
      let a;
      if (d.ring) a = base + i * TAU / count;
      else if (count === 1) a = base;
      else a = base + (i - (count - 1) / 2) * ((d.spread || 0.5) / (count - 1));
      spawnBullet(ox, oy, a, sp, d);
    }
  }
  s.shots++;
}

// ------------------------------------------------------------
//  이펙트 / 아이템
// ------------------------------------------------------------
function burst(x, y, n, color, spd = 3, life = 30) {
  for (let i = 0; i < n && parts.length < 700; i++) {
    const a = Math.random() * TAU, v = rand(0.3, 1) * spd;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: rand(1.5, 3.5) });
  }
}

function addItem(x, y, small) {
  items.push({ x, y, vx: rand(-0.6, 0.6), vy: -2.2, small: !!small });
}

function popup(text, t = 100) { msg = { text, t, max: t }; }

// ------------------------------------------------------------
//  적 / 보스
// ------------------------------------------------------------
function spawnEnemy(d) {
  const x0 = d.x !== undefined ? d.x : W / 2;
  enemies.push({
    x: x0, y: -30, x0, y0: d.y !== undefined ? d.y : 120, t: 0,
    hp: d.hp, maxHp: d.hp, path: d.path, stay: d.stay || 300,
    r: d.size || 13, color: d.color || '#4cc9f0',
    emit: makeEmitters(d.pattern), flash: 0, dead: false, rot: Math.random() * 6,
  });
}

function updateEnemyPath(e) {
  const t = e.t;
  switch (e.path) {
    case 'down': e.x = e.x0; e.y = -20 + t * 1.5; break;
    case 'sine': e.x = e.x0 + Math.sin(t * 0.05) * 70; e.y = -20 + t * 1.3; break;
    case 'fromLeft': e.x = -20 + t * 2.2; e.y = e.y0 + Math.sin(t * 0.04) * 30; break;
    case 'fromRight': e.x = W + 20 - t * 2.2; e.y = e.y0 + Math.sin(t * 0.04) * 30; break;
    case 'stop': {
      const T = 60;
      if (t < T) { const k = t / T; e.y = -20 + (e.y0 + 20) * (1 - (1 - k) * (1 - k)); }
      else if (t < T + e.stay) e.y = e.y0;
      else e.y = e.y0 - (t - T - e.stay) * 2.5;
      e.x = e.x0;
      break;
    }
  }
  if (e.y > H + 30 || e.x < -40 || e.x > W + 40 || (e.y < -50 && t > 10)) e.dead = true;
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  player.score += Math.round(100 * mult()) + e.maxHp * 10;
  burst(e.x, e.y, 14, e.color, 3.5, 30);
  addItem(e.x, e.y, false);
  if (e.maxHp >= 14) { addItem(e.x - 10, e.y, false); addItem(e.x + 10, e.y, false); }
  Sound.kill();
}

function spawnBoss(key) {
  const def = BOSSES[key];
  boss = {
    def, key, x: W / 2, y: -60, tx: W / 2, ty: 120, phase: -1, hp: 1, maxHp: 1, t: 0, inv: 999,
    emit: [], timeLeft: 0, r: def.size, flash: 0, noMiss: true, mi: 0, entering: true, rot: 0,
  };
}

function startPhase(i) {
  const b = boss, ph = b.def.phases[i];
  b.phase = i;
  b.hp = b.maxHp = ph.hp;
  b.t = 0; b.mi = 0;
  b.inv = ph.spell ? 80 : 50;
  b.timeLeft = ph.time;
  b.emit = makeEmitters(ph.emit);
  b.noMiss = true;
  clearBullets(true);
  if (ph.spell) { Sound.phase(); popup(ph.name, 110); }
}

function endPhase() {
  const b = boss, ph = b.def.phases[b.phase];
  if (ph.spell && b.hp <= 0 && b.noMiss) { player.score += 5000; popup('SPELL BONUS  +5000', 90); }
  player.score += 2000;
  burst(b.x, b.y, 30, b.def.color, 4, 40);
  if (b.phase + 1 < b.def.phases.length) startPhase(b.phase + 1);
  else bossDefeated();
}

function bossDefeated() {
  const b = boss;
  burst(b.x, b.y, 90, b.def.color, 6, 60);
  clearBullets(true);
  player.score += 10000;
  shake = 20;
  Sound.bossDown();
  for (const e of enemies) killEnemy(e);
  if (b.def.final) stage.clearT = 150;
  else popup('MID-BOSS DOWN', 90);
  stage.wait = false;
  boss = null;
}

function hurtBoss(d) {
  if (!boss || boss.entering || boss.inv > 0) return;
  boss.hp -= d;
  boss.flash = 2;
  player.score += 2;
}

// ------------------------------------------------------------
//  플레이어
// ------------------------------------------------------------
function startBomb() {
  const p = player;
  p.bombs--;
  p.bombT = 150;
  p.invuln = Math.max(p.invuln, 170);
  clearBullets(true);
  bombFx = { t: 0, x: p.x, y: p.y };
  shake = 10;
  if (boss) boss.noMiss = false;
  Sound.bomb();
}

function playerHit() {
  const p = player;
  p.dead = 8;                 // 8프레임 동안 데스봄(피격 직후 폭탄) 가능
  if (boss) boss.noMiss = false;
  Sound.hit();
  burst(p.x, p.y, 25, '#7df9ff', 4, 35);
}

function loseLife() {
  const p = player;
  p.lives--;
  shake = 12;
  if (p.lives < 0) {
    saveHi();
    scene = 'over';
    Sound.over();
    return;
  }
  p.x = W / 2; p.y = H - 80;
  p.invuln = 200;
  p.bombs = 3;
  clearBullets(true);
}

function updatePlayer() {
  const p = player;
  if (p.dead > 0) {
    p.dead--;
    if (hit('KeyX') && p.bombs > 0) { p.dead = 0; startBomb(); }
    else if (p.dead === 0) loseLife();
    return;
  }
  p.focus = held('ShiftLeft', 'ShiftRight');
  const sp = p.focus ? 1.9 : 4.4;
  let dx = (held('ArrowRight', 'KeyD') ? 1 : 0) - (held('ArrowLeft', 'KeyA') ? 1 : 0);
  let dy = (held('ArrowDown', 'KeyS') ? 1 : 0) - (held('ArrowUp', 'KeyW') ? 1 : 0);
  if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
  p.x = clamp(p.x + dx * sp, 12, W - 12);
  p.y = clamp(p.y + dy * sp, 14, H - 14);

  if (p.shootT > 0) p.shootT--;
  if (held('KeyZ', 'Space') && p.shootT <= 0) {
    p.shootT = 4;
    if (p.focus) {
      shots.push({ x: p.x - 6, y: p.y - 12, vx: 0, vy: -16, dmg: 1.6 });
      shots.push({ x: p.x + 6, y: p.y - 12, vx: 0, vy: -16, dmg: 1.6 });
    } else {
      shots.push({ x: p.x - 10, y: p.y - 10, vx: -0.9, vy: -14, dmg: 1 });
      shots.push({ x: p.x,      y: p.y - 14, vx: 0,    vy: -14, dmg: 1.2 });
      shots.push({ x: p.x + 10, y: p.y - 10, vx: 0.9,  vy: -14, dmg: 1 });
    }
  }
  if (hit('KeyX') && p.bombs > 0 && p.bombT <= 0) startBomb();

  if (p.invuln > 0) p.invuln--;
  if (p.bombT > 0) {
    p.bombT--;
    if (bullets.length) clearBullets(true);
    for (const e of enemies) if (e.y > 0) { e.hp -= 1.5; e.flash = 2; if (e.hp <= 0) killEnemy(e); }
    if (boss) hurtBoss(0.9);
  }
}

function updateShots() {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.x += s.vx; s.y += s.vy;
    let gone = s.y < -20;
    if (!gone) {
      for (const e of enemies) {
        if (e.dead || e.y < 0) continue;
        const dx = e.x - s.x, dy = e.y - s.y;
        if (dx * dx + dy * dy < (e.r + 4) * (e.r + 4)) {
          e.hp -= s.dmg; e.flash = 3;
          player.score += 3;
          if (e.hp <= 0) killEnemy(e);
          gone = true; break;
        }
      }
    }
    if (!gone && boss && !boss.entering) {
      const dx = boss.x - s.x, dy = boss.y - s.y;
      if (dx * dx + dy * dy < (boss.r + 6) * (boss.r + 6)) { hurtBoss(s.dmg); gone = true; }
    }
    if (gone) { shots[i] = shots[shots.length - 1]; shots.pop(); }
  }
}

// ------------------------------------------------------------
//  스테이지 진행 / 적 / 보스 업데이트
// ------------------------------------------------------------
function updateStage() {
  if (stage.bannerT > 0) stage.bannerT--;
  if (!stage.wait) {
    stage.t++;
    while (stage.idx < stage.events.length && stage.events[stage.idx].t <= stage.t) {
      const ev = stage.events[stage.idx++];
      if (ev.e && ev.e.boss) { spawnBoss(ev.e.boss); stage.wait = true; }
      else spawnEnemy(ev.e);
    }
  }
  for (const e of enemies) {
    e.t++;
    if (e.flash > 0) e.flash--;
    updateEnemyPath(e);
    if (!e.dead && e.y > 20 && e.y < H - 60 && e.x > 0 && e.x < W) runEmitters(e.emit, e.x, e.y);
  }
  enemies = enemies.filter(e => !e.dead);

  if (boss) updateBoss();

  if (stage.clearT > 0) {
    stage.clearT--;
    if (stage.clearT === 0) {
      const p = player;
      bonusInfo = { lives: p.lives * 10000, bombs: p.bombs * 2000 };
      p.score += bonusInfo.lives + bonusInfo.bombs;
      saveHi();
      scene = 'clear';
      Sound.clear();
    }
  }
}

function updateBoss() {
  const b = boss;
  b.rot += 0.02;
  if (b.flash > 0) b.flash--;
  if (b.entering) {
    b.y += (b.ty - b.y) * 0.04;
    if (Math.abs(b.ty - b.y) < 3) { b.entering = false; startPhase(0); }
    return;
  }
  const ph = b.def.phases[b.phase];
  if (b.t % ph.moveEvery === 0) {
    const p = ph.pos[b.mi % ph.pos.length];
    b.tx = p[0]; b.ty = p[1]; b.mi++;
  }
  b.x += (b.tx - b.x) * 0.03;
  b.y += (b.ty - b.y) * 0.03;
  b.t++;
  if (b.inv > 0) b.inv--;
  else runEmitters(b.emit, b.x, b.y);
  b.timeLeft--;
  if (b.hp <= 0 || b.timeLeft <= 0) endPhase();
}

// ------------------------------------------------------------
//  탄 업데이트 + 피격/그레이즈
// ------------------------------------------------------------
function updateBullets() {
  const p = player;
  let canHit = p.dead === 0 && p.invuln <= 0 && p.bombT <= 0;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.accel) b.speed = clamp(b.speed + b.accel, b.min, b.max);
    if (b.curve) b.ang += b.curve;
    if (b.accel || b.curve) { b.vx = Math.cos(b.ang) * b.speed; b.vy = Math.sin(b.ang) * b.speed; }
    b.x += b.vx; b.y += b.vy;
    if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { removeBullet(i); continue; }
    if (canHit) {
      const dx = b.x - p.x, dy = b.y - p.y, d2 = dx * dx + dy * dy;
      const hr = b.r + 2.6;
      if (d2 < hr * hr) { playerHit(); canHit = false; }
      else if (!b.grazed) {
        const gr = b.r + 15;
        if (d2 < gr * gr) {
          b.grazed = true;
          p.graze++;
          p.score += 20;
          Sound.graze();
        }
      }
    }
  }
}

function updateItems() {
  const p = player;
  const attract = p.dead === 0 && (p.y < 190 || p.bombT > 0);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    let remove = false;
    if (attract) {
      const dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy) || 1;
      it.x += dx / d * 9; it.y += dy / d * 9;
    } else {
      it.vy = Math.min(it.vy + 0.06, 2.2);
      it.x += it.vx; it.y += it.vy;
      it.vx *= 0.98;
    }
    if (it.y > H + 10) remove = true;
    else if (p.dead === 0) {
      const dx = p.x - it.x, dy = p.y - it.y;
      if (dx * dx + dy * dy < 18 * 18) {
        p.score += Math.round((it.small ? 50 : 300) * mult());
        Sound.item();
        remove = true;
      }
    }
    if (remove) { items[i] = items[items.length - 1]; items.pop(); }
  }
}

function updateParts() {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.x += q.vx; q.y += q.vy; q.vx *= 0.96; q.vy *= 0.96;
    if (--q.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); }
  }
}

// ------------------------------------------------------------
//  메인 업데이트
// ------------------------------------------------------------
function updateBg() {
  bgT++;
  for (const s of stars) { s.y += s.s; if (s.y > H) { s.y = 0; s.x = Math.random() * PW; } }
}

function update() {
  updateBg();
  if (scene === 'title') {
    if (hit('ArrowUp', 'KeyW')) { diffIdx = (diffIdx + DIFFS.length - 1) % DIFFS.length; Sound.select(); }
    if (hit('ArrowDown', 'KeyS')) { diffIdx = (diffIdx + 1) % DIFFS.length; Sound.select(); }
    diff = DIFFS[diffIdx]; loadHi();
    if (hit('KeyZ', 'Enter', 'Space')) { Sound.start(); newGame(); }
    return;
  }
  if (scene === 'pause') { if (hit('Escape', 'KeyP')) scene = 'play'; return; }
  if (scene === 'over') {
    if (hit('KeyZ', 'Enter')) newGame();
    else if (hit('Escape')) { scene = 'title'; loadHi(); }
    return;
  }
  if (scene === 'clear') {
    if (hit('KeyZ', 'Enter')) { scene = 'title'; loadHi(); }
    return;
  }
  // play
  if (hit('Escape', 'KeyP')) { scene = 'pause'; return; }
  updatePlayer();
  if (scene !== 'play') return;
  updateStage();
  updateShots();
  updateBullets();
  updateItems();
  updateParts();
  if (bombFx) { bombFx.t++; if (bombFx.t > 60) bombFx = null; }
  if (msg && --msg.t <= 0) msg = null;
  shake *= 0.9;
  if (shake < 0.3) shake = 0;
}

// ------------------------------------------------------------
//  렌더링
// ------------------------------------------------------------
function txt(s, x, y, size, color, align = 'left', glow = false) {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.shadowBlur = 0;
}

function drawBg(w) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#04050f'); g.addColorStop(1, '#0b1030');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, H);
  ctx.lineWidth = 1;
  const off = (bgT * 0.8) % 40;
  for (let y = -40 + off; y < H; y += 40) {
    ctx.strokeStyle = `rgba(76,201,240,${0.04 + (y / H) * 0.1})`;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(76,201,240,0.05)';
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (const s of stars) {
    if (s.x > w) continue;
    ctx.fillStyle = `rgba(200,230,255,${s.a})`;
    ctx.fillRect(s.x, s.y, s.s, s.s * 2);
  }
}

function poly(x, y, r, n, rot) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + i * TAU / n;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawEnemy(e) {
  ctx.save();
  ctx.shadowColor = e.color; ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.strokeStyle = e.flash > 0 ? '#ffffff' : e.color;
  ctx.fillStyle = e.flash > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)';
  const rot = bgT * 0.03 + e.rot;
  poly(e.x, e.y, e.r, 4, rot); ctx.fill(); ctx.stroke();
  poly(e.x, e.y, e.r * 0.55, 4, -rot); ctx.stroke();
  ctx.restore();
}

function drawBoss() {
  const b = boss, c = b.def.color;
  ctx.save();
  ctx.shadowColor = c; ctx.shadowBlur = 16;
  ctx.lineWidth = 2;
  ctx.strokeStyle = c;
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 22, 0, TAU); ctx.stroke();
  poly(b.x, b.y, b.r + 22, 6, b.rot); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = b.flash > 0 ? '#ffffff' : c;
  ctx.fillStyle = b.inv > 0 && b.t > 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
  poly(b.x, b.y, b.r, 6, -b.rot * 2); ctx.fill(); ctx.stroke();
  poly(b.x, b.y, b.r * 0.6, 3, b.rot * 3); ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  if (p.dead > 0) return;
  if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) ctx.globalAlpha = 0.4;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.shadowColor = '#7df9ff'; ctx.shadowBlur = 12;
  ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(125,249,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(0, -15); ctx.lineTo(10, 10); ctx.lineTo(0, 5); ctx.lineTo(-10, 10); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
  // 판정점
  ctx.save();
  if (p.focus) {
    ctx.strokeStyle = 'rgba(125,249,255,0.5)'; ctx.lineWidth = 1;
    poly(p.x, p.y, 16, 6, bgT * 0.05); ctx.stroke();
  }
  ctx.fillStyle = '#ff4d6d';
  ctx.beginPath(); ctx.arc(p.x, p.y, p.focus ? 4 : 3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(p.x, p.y, p.focus ? 2.4 : 1.6, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawField() {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawBg(W);

  for (const it of items) {
    ctx.fillStyle = it.small ? '#80ffdb' : '#ffe66d';
    const s = it.small ? 3 : 5;
    ctx.fillRect(it.x - s, it.y - s, s * 2, s * 2);
  }
  for (const e of enemies) drawEnemy(e);
  if (boss) drawBoss();

  ctx.fillStyle = '#9ff4ff';
  for (const s of shots) ctx.fillRect(s.x - 1.5, s.y - 8, 3, 14);

  if (scene !== 'title') drawPlayer();

  for (const b of bullets) {
    const spr = sprite(b.color, b.r);
    ctx.drawImage(spr, b.x - spr.width / 2, b.y - spr.height / 2);
  }
  for (const q of parts) {
    ctx.globalAlpha = q.life / q.max;
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x, q.y, q.size, q.size);
  }
  ctx.globalAlpha = 1;

  if (bombFx) {
    const k = bombFx.t / 60;
    ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
    ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(bombFx.x, bombFx.y, k * 700, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(125,249,255,${0.25 * (1 - k)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // 보스 UI
  if (boss && !boss.entering) {
    const b = boss, ph = b.def.phases[b.phase];
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(40, 14, 400, 6);
    ctx.fillStyle = b.def.color;
    ctx.fillRect(40, 14, 400 * clamp(b.hp / b.maxHp, 0, 1), 6);
    txt(b.def.name, 40, 38, 14, '#ffffff', 'left');
    txt(String(Math.max(0, Math.ceil(b.timeLeft / 60))), 440, 38, 18, b.timeLeft < 600 ? '#ff4d6d' : '#ffffff', 'right');
    for (let i = b.phase + 1; i < b.def.phases.length; i++) {
      ctx.fillStyle = b.def.color;
      ctx.fillRect(40 + (i - b.phase - 1) * 14, 44, 10, 4);
    }
    if (ph.name) txt(ph.name, 440, 62, 14, '#ffe66d', 'right', true);
  }

  if (stage && stage.bannerT > 0 && scene === 'play') {
    const a = Math.min(1, stage.bannerT / 40);
    ctx.globalAlpha = a;
    txt('STAGE 1', W / 2, 250, 40, '#7df9ff', 'center', true);
    txt('Neon Gate', W / 2, 282, 18, '#ffffff', 'center');
    ctx.globalAlpha = 1;
  }
  if (msg) {
    ctx.globalAlpha = Math.min(1, msg.t / 30);
    txt(msg.text, W / 2, 300, 24, '#ffe66d', 'center', true);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawHud() {
  const p = player, x0 = W;
  ctx.fillStyle = '#080a1a';
  ctx.fillRect(x0, 0, PW - W, H);
  ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 2;
  ctx.shadowColor = '#4cc9f0'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, H); ctx.stroke();
  ctx.shadowBlur = 0;
  const cx = x0 + 20;
  txt('NEON BARRAGE', cx, 40, 20, '#7df9ff', 'left', true);
  txt('HI-SCORE', cx, 90, 12, '#8899bb');
  txt(String(Math.max(hiscore, p.score)).padStart(9, '0'), cx, 112, 22, '#ffffff');
  txt('SCORE', cx, 150, 12, '#8899bb');
  txt(String(p.score).padStart(9, '0'), cx, 172, 22, '#ffe66d');
  txt('LIFE', cx, 215, 12, '#8899bb');
  for (let i = 0; i < Math.max(0, p.lives); i++) {
    ctx.fillStyle = '#ff4d6d';
    poly(cx + 8 + i * 24, 232, 8, 4, 0); ctx.fill();
  }
  txt('BOMB', cx, 270, 12, '#8899bb');
  for (let i = 0; i < p.bombs; i++) {
    ctx.fillStyle = '#80ffdb';
    ctx.beginPath(); ctx.arc(cx + 8 + i * 24, 287, 7, 0, TAU); ctx.fill();
  }
  txt('GRAZE', cx, 325, 12, '#8899bb');
  txt(String(p.graze), cx, 347, 22, '#ffffff');
  txt('배율 x' + mult().toFixed(2), cx, 372, 14, '#80ffdb');
  txt('난이도', cx, 410, 12, '#8899bb');
  txt(diff.name, cx, 432, 18, '#c77dff');
  txt('이동  방향키 / WASD', cx, 500, 12, '#8899bb');
  txt('샷  Z     폭탄  X', cx, 520, 12, '#8899bb');
  txt('저속(판정점 표시)  Shift', cx, 540, 12, '#8899bb');
  txt('일시정지  Esc / P', cx, 560, 12, '#8899bb');
  txt('음소거  M ' + (Sound.isMuted() ? '(OFF)' : '(ON)'), cx, 580, 12, '#8899bb');
}

function overlay(alpha) {
  ctx.fillStyle = `rgba(2,3,10,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

function drawTitle() {
  drawBg(PW);
  txt('NEON BARRAGE', PW / 2, 190, 64, '#7df9ff', 'center', true);
  txt('작은 판정점 하나로 탄막 속 길을 찾아라', PW / 2, 230, 18, '#c9d6ff', 'center');
  txt('난이도 선택  (↑ ↓)', PW / 2, 300, 14, '#8899bb', 'center');
  DIFFS.forEach((d, i) => {
    const sel = i === diffIdx;
    txt((sel ? '▶ ' : '   ') + d.name, PW / 2, 345 + i * 40, sel ? 30 : 24, sel ? '#ffe66d' : '#667799', 'center', sel);
  });
  txt('HI-SCORE  ' + String(hiscore).padStart(9, '0'), PW / 2, 495, 16, '#ffffff', 'center');
  if (Math.floor(bgT / 30) % 2 === 0) txt('Z / Enter 로 시작', PW / 2, 545, 22, '#80ffdb', 'center', true);
  txt('방향키/WASD 이동  ·  Z 샷  ·  X 폭탄  ·  Shift 저속', PW / 2, 595, 13, '#8899bb', 'center');
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, PW, H);
  if (scene === 'title') { drawTitle(); return; }
  drawField();
  drawHud();
  if (scene === 'pause') {
    overlay(0.6);
    txt('PAUSE', W / 2, 300, 44, '#ffffff', 'center', true);
    txt('Esc / P 로 계속', W / 2, 340, 16, '#c9d6ff', 'center');
  } else if (scene === 'over') {
    overlay(0.65);
    txt('GAME OVER', W / 2, 270, 48, '#ff4d6d', 'center', true);
    txt('SCORE  ' + player.score, W / 2, 320, 22, '#ffe66d', 'center');
    txt('Z: 재도전    Esc: 타이틀', W / 2, 370, 16, '#c9d6ff', 'center');
  } else if (scene === 'clear') {
    overlay(0.65);
    txt('STAGE CLEAR', W / 2, 240, 46, '#80ffdb', 'center', true);
    if (bonusInfo) {
      txt('남은 라이프 보너스  +' + bonusInfo.lives, W / 2, 290, 16, '#c9d6ff', 'center');
      txt('남은 폭탄 보너스  +' + bonusInfo.bombs, W / 2, 314, 16, '#c9d6ff', 'center');
    }
    txt('SCORE  ' + player.score, W / 2, 360, 26, '#ffe66d', 'center');
    txt('GRAZE  ' + player.graze, W / 2, 392, 18, '#ffffff', 'center');
    if (player.score >= hiscore) txt('NEW HI-SCORE!', W / 2, 428, 18, '#ff8fab', 'center', true);
    txt('Z: 타이틀로', W / 2, 470, 16, '#c9d6ff', 'center');
  }
}

// ------------------------------------------------------------
//  메인 루프 (고정 60Hz)
// ------------------------------------------------------------
const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= STEP) {
    update();
    for (const k in pressed) delete pressed[k];
    acc -= STEP;
  }
  render();
  requestAnimationFrame(frame);
}
loadHi();
requestAnimationFrame(frame);
})();

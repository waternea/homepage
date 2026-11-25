// Web Audio API로 효과음을 합성합니다. (음원 파일 불필요)
const Sound = (() => {
  let ac = null, master = null, muted = false, lastGraze = 0;

  function init() {
    if (ac || typeof window === 'undefined') return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.25;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
  }

  function tone(freq, dur, type = 'square', vol = 0.2, slide = 0, delay = 0) {
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol) {
    if (!ac || muted) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    const g = ac.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g); g.connect(master);
    src.start();
  }

  return {
    init,
    toggleMute() { muted = !muted; return muted; },
    isMuted() { return muted; },
    select() { tone(660, 0.06, 'square', 0.1); },
    start() { tone(440, 0.1, 'square', 0.15); tone(880, 0.15, 'square', 0.15, 0, 0.08); },
    graze() {
      if (!ac) return;
      const now = ac.currentTime;
      if (now - lastGraze < 0.05) return;
      lastGraze = now;
      tone(1500, 0.04, 'sine', 0.07);
    },
    kill() { tone(320, 0.12, 'square', 0.12, -220); },
    item() { tone(1100, 0.05, 'sine', 0.05); },
    hit() { noise(0.4, 0.3); tone(220, 0.45, 'sawtooth', 0.2, -160); },
    bomb() { noise(0.8, 0.35); tone(120, 0.8, 'sawtooth', 0.2, 500); },
    phase() { tone(500, 0.1, 'triangle', 0.18); tone(750, 0.1, 'triangle', 0.18, 0, 0.1); tone(1000, 0.2, 'triangle', 0.18, 0, 0.2); },
    bossDown() { noise(1.0, 0.4); tone(300, 0.9, 'sawtooth', 0.2, -250); },
    clear() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.2, 0, i * 0.15)); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.2, 0, i * 0.2)); },
  };
})();

// 탄막 패턴 데이터. 코드를 건드리지 않고 이 파일만 고쳐서 패턴을 추가/조정할 수 있어요.
//
// 이미터(emitter) 필드
//   every   발사 간격(프레임, 60프레임 = 1초)      delay  첫 발사까지 대기 프레임
//   count   한 번에 발사하는 탄 수                  ring   true면 360도 방사
//   spread  부채꼴 전체 각도(rad, ring이 아닐 때)   angle  기준 각도(rad, 아래쪽 = DOWN)
//   aim     true면 플레이어 조준                    spin   발사할 때마다 기준각 회전량(나선)
//   swing / swingRate  기준각을 사인파로 흔듦       jitter 랜덤 각도 오차
//   rows / rowStep     같은 방향으로 겹쳐 발사(속도 차이)
//   speed / accel / min / max  속도와 가감속        curve  프레임당 회전(곡선탄)
//   r       탄 반지름                               color  탄 색
//   kind:'rain'  구멍이 뚫린 탄 줄 (spacing, gap, gapRate 사용)

const TAU = Math.PI * 2;
const DOWN = Math.PI / 2;

const PATTERNS = {
  // ---- 잡몹용 ----
  aim1:  [{ every: 80, delay: 20, count: 1, speed: 3.2, aim: true, color: '#ff4d6d', r: 5 }],
  aim3:  [{ every: 90, delay: 20, count: 3, spread: 0.5, speed: 3.0, aim: true, color: '#ffb703', r: 5 }],
  ring8: [{ every: 100, delay: 30, count: 8, ring: true, speed: 2.0, spin: 0.1, color: '#4cc9f0', r: 5 }],
  fan5:  [{ every: 70, delay: 30, count: 5, spread: 1.2, angle: DOWN, speed: 2.6, color: '#c77dff', r: 4 }],
  spray: [{ every: 6, delay: 20, count: 1, angle: DOWN, swing: 0.9, swingRate: 0.25, speed: 2.8, color: '#80ffdb', r: 4 }],
  twin:  [{ every: 50, delay: 20, count: 2, spread: 0.3, aim: true, rows: 2, rowStep: 0.8, speed: 2.4, color: '#ff8fab', r: 5 }],
};

// ---- 보스 ----
// phases: hp(체력), time(제한시간 프레임), spell(스펠카드 여부), name(표시 이름),
//         pos(이동 지점 목록), moveEvery(이동 간격), emit(이미터 목록)
const BOSSES = {
  mid: {
    name: 'Prism Sentinel', size: 22, color: '#4cc9f0', final: false,
    phases: [
      {
        hp: 220, time: 1800, spell: false, name: '',
        pos: [[240, 120], [160, 110], [320, 110]], moveEvery: 240,
        emit: [
          { every: 55, count: 14, ring: true, spin: 0.21, speed: 2.0, color: '#4cc9f0', r: 5 },
          { every: 70, delay: 30, count: 3, spread: 0.5, aim: true, speed: 3.2, color: '#ffb703', r: 5 },
        ],
      },
      {
        hp: 240, time: 2100, spell: true, name: 'Prism "Spiral Lattice"',
        pos: [[240, 130]], moveEvery: 600,
        emit: [
          { every: 5, count: 3, ring: true, spin: 0.17, speed: 2.2, color: '#c77dff', r: 4 },
          { every: 120, delay: 40, count: 1, aim: true, speed: 4.0, color: '#ffffff', r: 6 },
        ],
      },
    ],
  },
  boss: {
    name: 'Aurora Core', size: 28, color: '#ff4d6d', final: true,
    phases: [
      {
        hp: 350, time: 2400, spell: false, name: '',
        pos: [[240, 120], [130, 100], [350, 100]], moveEvery: 220,
        emit: [
          { every: 45, count: 18, ring: true, spin: 0.13, speed: 2.1, color: '#80ffdb', r: 5 },
          { every: 60, delay: 20, count: 5, spread: 0.9, aim: true, speed: 3.0, color: '#ff4d6d', r: 5 },
        ],
      },
      {
        hp: 450, time: 2700, spell: true, name: 'Aurora "Helix Bloom"',
        pos: [[240, 130]], moveEvery: 600,
        emit: [
          { every: 3, count: 2, ring: true, spin: 0.31, speed: 2.6, color: '#4cc9f0', r: 4 },
          { every: 3, count: 2, ring: true, spin: -0.23, speed: 1.8, color: '#c77dff', r: 4 },
          { every: 100, delay: 30, count: 1, aim: true, rows: 3, rowStep: 0.6, speed: 3.4, color: '#ffb703', r: 6 },
        ],
      },
      {
        hp: 550, time: 2700, spell: true, name: 'Aurora "Curtain Fall"',
        pos: [[240, 110], [160, 120], [320, 120]], moveEvery: 300,
        emit: [
          { kind: 'rain', every: 40, spacing: 30, gap: 44, gapRate: 0.3, speed: 2.2, color: '#4cc9f0', r: 5 },
          { every: 70, delay: 10, count: 12, ring: true, spin: 0.2, speed: 1.7, color: '#ff4d6d', r: 5 },
        ],
      },
      {
        hp: 650, time: 3000, spell: true, name: 'Aurora "Final Spectrum"',
        pos: [[240, 120], [180, 140], [300, 140]], moveEvery: 280,
        emit: [
          { every: 6, count: 5, ring: true, spin: 0.11, speed: 2.3, color: '#ff4d6d', r: 4 },
          { every: 6, delay: 3, count: 5, ring: true, spin: -0.09, speed: 1.7, color: '#4cc9f0', r: 4 },
          { every: 90, delay: 20, count: 7, spread: 1.6, aim: true, speed: 3.0, color: '#ffb703', r: 5 },
          { every: 120, delay: 60, count: 16, ring: true, speed: 1.4, curve: 0.012, color: '#c77dff', r: 5 },
        ],
      },
    ],
  },
};

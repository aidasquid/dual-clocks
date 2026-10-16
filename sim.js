// 作成者: aidasquid (via Claude Code) / 作成日: 2026-10-16
// 説明: 「Dual Clocks」(二つの時間)の物理と面のデータ。画面(index.html)から分けてあり、node でも読める(試験用)。
//
// 世界には時間の軸が2本(t0・t1)あり、進む速さは t0 = cos θ・t1 = sin θ(0 ≤ θ ≤ 90°)。
// プレイヤーは θ を回す。プレイヤー自身は、どちらにも属さない独立した時間で動く。
// 物体は時間の軸ごとに速度 v0・v1 を持ち、見かけの速度は v0·t0 + v1·t1。
// 壁の押し返しは、壁に向かって動いていた軸にだけ返す(circleRect)。プレイヤーに蹴られた時は、
// 変化 d を t の重みで分ける(v0 += t0·d、v1 += t1·d。t0² + t1² = 1 なので見かけの速度がちょうど d 変わる)。
(function (root) {
  'use strict';

  const TS = 32, COLS = 30, ROWS = 18;          // 1マスの大きさ(px)と面の大きさ
  const G_PLAYER = 1800, JUMP = 620;             // プレイヤーの重力とジャンプの初速(px/s²・px/s)
  const RUN = 260, ACCEL = 2400, FRICTION = 2600; // プレイヤーの走る速さ・加速・止まる減速
  const G_BALL = 600;                            // ボールの重力(t1 の世界だけにある)
  const PUSH_ACC = 3000;                         // プレイヤーがボールを押す時の加速(px/s²)。押せるのは走る速さまで
  const EASE = 12;                               // θ が目標の角度へ寄っていく速さ

  function makeGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  }
  function fill(g, c0, r0, c1, r1, ch) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = ch;
    }
  }
  const vec = (x, y) => ({ x, y });

  // ---- 面 ----
  // '#' 壁、'^' トゲ(プレイヤーが触れるとやり直し、ほかの物には壁)、'b' ボールだけを止める格子、'B' ボタン、'T' 目標領域(面7)、'G' ゴール(通り抜けられる)、'.' 空き
  function stage1() {
    const g = makeGrid();
    fill(g, 0, 14, 5, 17, '#');
    fill(g, 14, 14, 18, 17, '#');
    fill(g, 24, 6, 29, 17, '#');
    fill(g, 26, 5, 28, 5, 'G');
    return {
      name: '1. リフトの乗り継ぎ',
      hint: 'リフト1は t₀ の世界で横に、リフト2は t₁ の世界で縦に動く。θ を回して乗り継ぎ、G へ。',
      goal: 'player', grid: g, autoStart: true, secretHop: true,
      spawn: vec(1 * TS + 4, 14 * TS - 28),
      lifts: [
        { axis: 0, w: 3 * TS, h: 16, base: vec(8.5 * TS, 14 * TS), amp: vec(2.5 * TS, 0), omega: 1.6, phase: 0 },
        { axis: 1, w: 3 * TS, h: 16, base: vec(21 * TS, 10 * TS), amp: vec(0, 4 * TS), omega: 1.6, phase: -Math.PI / 2 }, // 上から始める
      ],
      balls: [], movers: [],
    };
  }
  function stage2() {
    const g = makeGrid();
    fill(g, 0, 0, 29, 0, '#');    // 天井
    fill(g, 0, 8, 6, 17, '#');    // ボールの乗った柱
    fill(g, 12, 1, 13, 7, '#');   // 上から垂れた壁
    fill(g, 22, 11, 29, 17, '#'); // ゴールの台
    fill(g, 29, 1, 29, 10, '#');  // 奥の壁
    fill(g, 25, 9, 26, 10, 'G');
    return {
      name: '2. ボール運び',
      hint: 'ボールを G へ。ボールの横の速さは蹴った時の θ の世界に入り、重力は t₁ の世界にだけある。',
      goal: 'ball', grid: g,
      spawn: vec(1 * TS + 4, 8 * TS - 28),
      lifts: [],
      balls: [{ x: 5.5 * TS, y: 8 * TS - 12, r: 12, v0: vec(0, 0), v1: vec(0, 0), a0: vec(0, 0), a1: vec(0, G_BALL), e: 0.5 }],
      movers: [],
    };
  }
  function stage3() {
    const g = makeGrid();
    fill(g, 0, 0, 29, 17, '#');
    fill(g, 1, 11, 13, 15, '.');  // 下のトンネル
    fill(g, 1, 10, 13, 10, '^');  // その天井のトゲ
    fill(g, 14, 2, 19, 15, '.');  // 縦穴(6マス)
    fill(g, 20, 6, 20, 10, '^');  // 縦穴の右の壁はトゲ(壁に押し付けて滑らせられない)
    fill(g, 20, 11, 28, 15, '.'); // まっすぐ進むと入ってしまう、トゲだらけのゾーン
    fill(g, 20, 16, 28, 16, '^');
    fill(g, 21, 10, 28, 10, '^');
    fill(g, 29, 11, 29, 15, '^');
    fill(g, 20, 2, 28, 5, '.');   // 上のトンネル
    fill(g, 14, 1, 28, 1, '^');   // その天井のトゲ
    fill(g, 21, 6, 26, 6, '^');   // 上のトンネルの床は、ゴールの足元までトゲ(途中の半端な足場は置かない)
    fill(g, 27, 3, 28, 5, 'G');
    // t₀(右)は t₁(上)より少し遅い。θ と進む向きは一致しなくなるが、縦穴で向きを変える余裕ができる
    const mover = { x: 1 * TS + 8, y: 16 * TS - 16, w: 3 * TS, h: 16, v0: vec(110, 0), v1: vec(0, -150) };
    return {
      name: '3. θ のハンドル',
      hint: 'この台は t₀ の世界で右へ、t₁ の世界で上へ進む。θ で舵を取る。トゲに触れるとやり直し。',
      goal: 'player', grid: g, autoStart: true,
      spawn: vec(mover.x + 36, mover.y - 28),
      lifts: [], balls: [], movers: [mover],
    };
  }
  function stage4() {
    const g = makeGrid();
    fill(g, 0, 0, 29, 0, '#');    // 天井
    fill(g, 0, 13, 15, 17, '#');  // 出発から檻を抜けるまでの床
    fill(g, 5, 1, 5, 12, 'b');    // 檻(天井まで。ボールだけを止める格子、プレイヤーは通れる)
    fill(g, 15, 1, 15, 12, 'b');
    fill(g, 25, 13, 29, 17, '#'); // ゴールの台
    fill(g, 16, 17, 24, 17, '^'); // 穴(9マス、跳んでは届かない)の底はトゲ
    fill(g, 27, 12, 28, 12, 'G');
    const spike = (x, y, vx, vy) => ({ x: x * TS, y: y * TS, r: 12, v0: vec(vx, vy), v1: vec(0, 0), a0: vec(0, 0), a1: vec(0, 0), e: 1, spike: true });
    return {
      name: '4. 時間停止', autoStart: true, secretNoTurn: 'そういうゲームじゃないから！',
      hint: 'トゲトゲボールは t₀ の世界で、重力を受けずに跳ね回る。θ を t₁ に回せば止まり、止まっている間もあなたは動ける。ただし穴を渡るリフトも t₀。',
      goal: 'player', grid: g,
      spawn: vec(1 * TS + 4, 13 * TS - 28),
      lifts: [
        // 2マス幅: 3マスだと、止めたリフトの右端から跳んで向こう岸に届いた
        { axis: 0, w: 2 * TS, h: 16, base: vec(19.5 * TS, 13 * TS), amp: vec(3.5 * TS, 0), omega: 1.0, phase: -Math.PI / 2 },
      ],
      balls: [
        // 速さは、止めずにはすり抜けられない値を探索で選んだ(遅いと隙間が空き、1.8倍でも軌道の偶然で隙間が空いた)
        spike(7, 2.5, 364, 266), spike(9.5, 5, -336, 322), spike(12, 3, 392, -238), spike(13.5, 7, -308, -350),
        spike(7.5, 8.5, 322, -294), spike(10.5, 12.4, -336, 322), spike(12.5, 10, 350, 280), spike(8.5, 11, -280, -364),
        // 8個では止めずに走り抜けられることが多かったので、4個足して12個
        spike(6.5, 4, -300, 320), spike(11, 9, 330, -280), spike(14, 2.5, -350, -300), spike(9, 7.5, 310, 350),
      ],
      movers: [],
    };
  }
  // 面5: 鳥の重力は t₀ で下向き、t₁ で上向き。見かけの加速度は g·(t₀² − t₁²) = g·cos 2θ
  function stage5() {
    const g = makeGrid();
    fill(g, 0, 0, 29, 0, '^');    // 天井と床はトゲ
    fill(g, 0, 17, 29, 17, '^');
    fill(g, 6, 1, 7, 8, '#');     // 1本目: 低い隙間
    fill(g, 6, 14, 7, 16, '#');
    fill(g, 11, 1, 12, 2, '#');   // 2本目: 高い隙間
    fill(g, 11, 7, 12, 16, '#');
    fill(g, 16, 1, 21, 7, '#');   // トゲのトンネル(2マス)。羽ばたくと上下に揺れてトゲに当たりやすいので、無重力で滑るのが表の解き方
    fill(g, 16, 7, 21, 7, '^');
    fill(g, 16, 10, 21, 16, '#');
    fill(g, 16, 10, 21, 10, '^');
    fill(g, 25, 1, 26, 11, '#');  // 3本目: トンネルを出たら下へ
    fill(g, 25, 16, 26, 16, '#');
    fill(g, 29, 1, 29, 16, 'G');
    return {
      name: '5. 二つの重力',
      hint: '鳥の重力は t₀ の世界では下向き、t₁ の世界では上向き。W / スペースで羽ばたく(最初の羽ばたきで始まる)。トゲはやり直し。',
      goal: 'bird', grid: g, noPlayer: true, secretNoTurn: 'ナイスガッツ！',
      spawn: vec(-100, -100),
      bird: { x: 2 * TS, y: 8.5 * TS, r: 10, vx: 43, v0: vec(0, 0), v1: vec(0, 0), a0: vec(0, 700), a1: vec(0, -700), flap: 215, cap: 420 }, // flap: 羽ばたき1回で 32.6px 上がる。トンネルの余裕 44px に、θ=0 のままでもギリギリ収まる(羽ばたく時の窓は約 8.5px・約 36ms。裏ゴール)
      lifts: [], balls: [], movers: [],
    };
  }
  // 面6: リサージュ曲線。横の振動は t₀、縦の振動は t₁ の世界にあるので、θ で振動数の比(tan θ)が変わる
  function stage6() {
    const g = makeGrid();
    fill(g, 0, 15, 29, 17, '#');  // 床
    fill(g, 15, 14, 15, 14, 'B'); // ボタン
    return {
      name: '6. リサージュ',
      hint: 'ボタンの上で S を押すと、横に t₀・縦に t₁ の世界で揺れるボールが出て、軌道を描く(もう一度押すとやり直し)。金色の軌道にぴったり重ねよう。Shift を押しながら回すと 0.5° ずつ。',
      goal: 'lissajous', grid: g, autoStart: true,
      spawn: vec(6 * TS, 15 * TS - 28),
      // 目標: 横4:縦11(tan θ = 2.75、θ ≈ 70.02°。ホイールと Shift で 70.0° ちょうど)。x = cx + A sin(ω T₀′)、y = cy − B sin(ω T₁′)(′ は押してからの時計)
      // 細かい織物のような模様で、描き終えるまで約24秒かかる。69.5°・70.5° では外れる
      liss: { cx: 16 * TS, cy: 8 * TS, A: 8 * TS, B: 4.5 * TS, omega: 3, ratio: [4, 11], tol: 16, snapDeg: 70 }, // tol: 軌道と目標の離れてよい距離(px)。snapDeg: この表示の角度で、図形がぴったり閉じるようにする(下)
      lifts: [], balls: [], movers: [],
    };
  }
  // 面7: ブラックホール。リフトは θ = 45° の時だけ ∞ を辿り続け、箱を運ぶ。数は 9999 まであるが、本当のクリアは
  // 「ブラックホールの中心に入ってから数が 60 増える」こと。中心に近づくと外の時間がだんだん速く進む(最大12倍、もう出られない)。
  function stage7() {
    const g = makeGrid();
    fill(g, 1, 0, 1, 1, '#'); fill(g, 4, 0, 4, 1, '#'); // 箱の出口(左上)
    fill(g, 0, 12, 1, 17, '#');   // 床。2〜4列は箱が落ちていく穴
    fill(g, 5, 12, 29, 17, '#');
    fill(g, 8, 13, 24, 16, '.');  // 床下の横穴(ブラックホールの部屋)
    fill(g, 25, 12, 26, 16, '.'); // 横穴へ降りる縦穴
    fill(g, 20, 11, 20, 11, 'B'); // ボタン
    fill(g, 14, 11, 15, 11, 'T'); // 目標領域(床の上。当たり板で押し出された箱がここへ落ちた時だけ数が増える)
    return {
      name: '7. ？？？', hint: '？？？',
      goal: 'count', grid: g, autoStart: true,
      spawn: vec(6 * TS, 12 * TS - 28),
      lifts: [{ axis: 0, liss: true, w: 2 * TS, h: 12, base: vec(0, 0), amp: vec(0, 0), omega: 0, phase: 0 }],
      balls: [], movers: [],
      // リフトの道: x = cx + A sin φ₀、y = cy + B sin 2φ₁(φ = ω·押してからの時計 − π/2)。45° で φ₀ = φ₁ になり ∞ を描く
      lissLift: { cx: 10 * TS, cy: 6 * TS, A: 7 * TS, B: 3 * TS, omega: 1.48 },
      stoppers: [{ x: 432, y: 40, w: 28, h: 52 }],      // 右上の当たり板。リフトは下をくぐり(リフトの上端は96より下)、上に乗った箱だけが当たって、真下の目標領域へ落ちる
      // 箱は同時に15個まで。ずれた角度では床に溜まってすぐ上限になり、運べなくなる(40個だと 30°・20° でも中で待つと60個に届いた)
      boxSpawn: { x: 3 * TS, y: 1.5 * TS, interval: 0.3, max: 15 },
      // ブラックホール(横穴の床の高さ)。引力は演出なので距離の1.2乗に反比例(9マスより遠くでは0)。外の時間の速さは
      // 黒い引力のエフェクトが出始める9マスから、近づくほど露骨に上がり(ブラックホールの上の足場で約3.5倍、中心の手前で8倍)、
      // 中心に入ってから4秒かけて12倍まで上がる。
      // 中心で stall 秒、実際に運べた数が増えなければ、fade 秒かけて暗転してやり直す(死亡の表示は出さない)
      bh: { x: 12.5 * TS, y: 16.3 * TS, rs: 20, pullR: 9 * TS, pullK: 208000, timeR: 9 * TS, kEdge: 8, kPow: 1.55, kMax: 12, ramp: 4, stall: 6, fade: 2 },
      // 中心に入ってから60個運んだらクリア。ただし運ぶ間隔が外の時間で8秒を超えたら数え直す(長く残った箱は消える
      // ようにしたので、上限で詰まらなくなり、ずれた角度でもゆっくり運べてしまうため)
      clearGain: 60, clearReal: 60,
    };
  }
  const STAGES = [stage1, stage2, stage3, stage4, stage5, stage6, stage7];

  // ---- 世界 ----
  function createWorld(index) {
    const s = STAGES[index]();
    const w = {
      index, name: s.name, hint: s.hint, goal: s.goal, grid: s.grid,
      theta: 0, thetaTarget: 0, t0: 1, t1: 0, T0: 0, T1: 0,
      started: !!s.autoStart, cleared: false, dead: null,
      // 裏ゴール: secret は見た裏ゴールの番号(面の番号、画面が覚えておく)。thetaOps は θ を操作した回数(画面が数える)
      clearText: null, secret: 0, thetaOps: 0, secretHop: !!s.secretHop, hop: 0, secretNoTurn: s.secretNoTurn || null,
      allSecrets: false, stayBuf: '',
      spawn: s.spawn,
      player: { x: s.spawn.x, y: s.spawn.y, w: 24, h: 28, vx: 0, vy: 0, ground: null, facing: 1 },
      lifts: s.lifts.map(l => ({ ...l, x: 0, y: 0, vx: 0, vy: 0 })),
      balls: s.balls.map(b => ({ ...b, v0: { ...b.v0 }, v1: { ...b.v1 }, start: vec(b.x, b.y) })),
      movers: s.movers.map(m => ({ ...m, v0: { ...m.v0 }, v1: { ...m.v1 }, vx: 0, vy: 0 })),
      noPlayer: !!s.noPlayer,
      bird: s.bird ? { ...s.bird, v0: { ...s.bird.v0 }, v1: { ...s.bird.v1 } } : null,
      liss: s.liss ? makeLiss(s.liss) : null,
      lissLift: s.lissLift ? { ...s.lissLift, active: false, c0: 0, c1: 0 } : null,
      stoppers: s.stoppers || [], boxSpawn: s.boxSpawn ? { ...s.boxSpawn, timer: 0 } : null, boxes: [],
      bh: s.bh ? { ...s.bh } : null, k: 1, outside: 0, count: 0, clearGain: s.clearGain || 0, clearReal: s.clearReal || 0, trapT: 0, countAtEntry: 0, realSinceEntry: 0, lastGainT: 0, lastGainOutside: 0, bestStreak: 0, fade: 0, retry: false,
    };
    if (w.lissLift) placeLissLift(w, 1);
    placeLifts(w, 1);
    for (const l of w.lifts) { l.vx = l.vy = l.dx = l.dy = 0; }
    return w;
  }

  function tileAt(w, c, r) {
    if (c < 0 || c >= COLS || r < 0) return '#'; // 左右と上は壁
    if (r >= ROWS) return '.';                    // 下は抜けている(落ちたらやり直し)
    return w.grid[r][c];
  }
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  // 矩形と重なるマスのうち、chars に含まれる物を矩形の一覧で返す
  function tilesIn(w, rect, chars) {
    const out = [];
    const c0 = Math.floor(rect.x / TS), c1 = Math.floor((rect.x + rect.w - 1e-6) / TS);
    const r0 = Math.floor(rect.y / TS), r1 = Math.floor((rect.y + rect.h - 1e-6) / TS);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (chars.includes(tileAt(w, c, r))) out.push({ x: c * TS, y: r * TS, w: TS, h: TS, ref: null });
    }
    return out;
  }

  function observed(obj, t0, t1) {
    return vec(t0 * obj.v0.x + t1 * obj.v1.x, t0 * obj.v0.y + t1 * obj.v1.y);
  }

  // リフトは、自分の時間の軸の時計(T0 か T1)で往復する
  function placeLifts(w, h) {
    for (const l of w.lifts) {
      if (l.liss) continue; // 面7のリフトは placeLissLift で動かす
      const T = l.axis === 0 ? w.T0 : w.T1;
      const s = Math.sin(l.omega * T + l.phase);
      const nx = l.base.x + l.amp.x * s, ny = l.base.y + l.amp.y * s;
      l.vx = (nx - l.x) / h; l.vy = (ny - l.y) / h;
      l.dx = nx - l.x; l.dy = ny - l.y;
      l.x = nx; l.y = ny;
    }
  }

  // 台(mover)は速度を変えない。壁に当たるとその向きにだけ止まる(押し付けて滑る)
  function moveMovers(w, h) {
    const p = w.player;
    for (const m of w.movers) {
      const v = observed(m, w.t0, w.t1);
      const riding = p.ground === m;
      const blockers = (dx, dy) => {
        const body = { x: m.x + dx, y: m.y + dy, w: m.w, h: m.h };
        if (tilesIn(w, body, '#^').length) return true;
        if (riding) { // 乗っている人の分も壁(トゲは除く。トゲは乗っている人に刺さる)
          const rider = { x: p.x + dx, y: p.y + dy, w: p.w, h: p.h };
          if (tilesIn(w, rider, '#').length) return true;
        }
        return false;
      };
      let dx = v.x * h, dy = v.y * h;
      if (blockers(dx, 0)) dx = 0;
      if (blockers(dx, dy)) dy = 0;
      m.x += dx; m.y += dy; m.dx = dx; m.dy = dy; m.vx = dx / h; m.vy = dy / h;
    }
  }

  function playerSolids(w, rect) {
    const list = tilesIn(w, rect, '#');
    for (const l of w.lifts) if (overlaps(rect, l)) list.push({ x: l.x, y: l.y, w: l.w, h: l.h, ref: l });
    for (const m of w.movers) if (overlaps(rect, m)) list.push({ x: m.x, y: m.y, w: m.w, h: m.h, ref: m });
    for (const st of w.stoppers || []) if (overlaps(rect, st)) list.push({ ...st, ref: null });
    // ボール(トゲトゲボールは除く)は、プレイヤーにとって固い物(めり込めない・上に乗れる)。押すと力がかかる(stepBalls)
    for (const b of w.balls) if (!b.spike) {
      const r = { x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r };
      if (overlaps(rect, r)) list.push({ ...r, ref: null, ball: b });
    }
    return list;
  }

  function stepPlayer(w, h, input, extVx = 0) { // extVx: 床の摩擦の効かない横の流れ(面7の引力)
    const p = w.player;
    // 乗っている台・リフトに運ばれる
    if (p.ground && p.ground.dx !== undefined) { p.x += p.ground.dx; p.y += p.ground.dy; }
    // 運ばれて壁に埋まったら押し出す。押し出せなければ(挟まれたら)やり直し
    for (const s of playerSolids(w, p)) {
      if (s.ref || s.ball) continue; // ボールは、ボールの側でプレイヤーの外へ押し出す
      const pushL = p.x + p.w - s.x, pushR = s.x + s.w - p.x, pushU = p.y + p.h - s.y, pushD = s.y + s.h - p.y;
      const m = Math.min(pushL, pushR, pushU, pushD);
      if (m === pushU) p.y -= pushU; else if (m === pushD) p.y += pushD; else if (m === pushL) p.x -= pushL; else p.x += pushR;
    }
    if (playerSolids(w, p).some(s => !s.ref && !s.ball)) { w.dead = '挟まれた'; return; }

    // 走る(独立した時間なので θ に関係なく同じ)
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) { p.vx += dir * ACCEL * h; p.facing = dir; }
    else { const f = FRICTION * h; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; }
    p.vx = Math.max(-RUN, Math.min(RUN, p.vx));
    if (input.jump && p.ground) { p.vy = -JUMP; p.ground = null; }
    p.vy = Math.min(p.vy + G_PLAYER * h, 1400);

    // リフトと台は、上からだけ乗れる足場(横や下からは素通り)。足元が少し食い込んだだけなら、上へ引き戻して乗せる
    // (2026-10-16、コマが詰まった時にリフトが一度に大きく動き、足元に深く食い込んで横へ押し出され、床を抜けていた)
    const SNAP = 14;
    // 上へ離れていく(リフトに対して上向きに動いている)時だけ素通り。上がってくるリフトが、跳び上がりの終わりかけの
    // 足元に下から追いついた時は乗せる(プレイヤーの速さだけで見ていた時は、すり抜けていた。1面の縦リフト)
    // 直前までその足場に乗っていた時は、そのまま乗せ続ける(下がる足場では、乗っている人が足場に対して上へ離れていくように
    // 見えるので、上の判定だけだと一瞬外れて落ち、着地し直すのを繰り返して弾んでいた。1面の縦リフト)
    const onTop = s => s.ref && (p.y + p.h) - s.y <= s.h + SNAP && (wasOn === s.ref || p.vy - (s.ref.vy || 0) >= -1);
    // 横に動いてぶつかったら戻す(足場は数えない)
    // 当たった地形が2つ以上の時、1つ目を直した後の速さで2つ目の向きを決めると、逆向きに押し出してしまう
    // (頭が天井の2マスに当たると、2マス目を「着地」と取り違えて天井の上へ抜けていた)。動いた向きは先に覚えておく
    const mx = p.vx + extVx;
    p.x += mx * h;
    p.hitX = false; p.pushBall = null; p.pushDir = 0;
    for (const s of playerSolids(w, p)) {
      if (s.ref || !overlaps(p, s)) continue;
      if (p.y + p.h - s.y <= 4) continue; // 足元が少し埋まっただけは、縦の処理に任せる
      p.hitX = true;
      if (mx > 0) p.x = s.x - p.w; else if (mx < 0) p.x = s.x + s.w;
      else { p.x = (p.x + p.w / 2 < s.x + s.w / 2) ? s.x - p.w : s.x + s.w; }
      if (s.ball && mx) { // ボールを押している: 速さをボールにそろえ、一緒に進みながら押し続ける(0にすると置いていかれる)
        p.pushBall = s.ball; p.pushDir = Math.sign(mx);
        const bv = observed(s.ball, w.t0, w.t1).x;
        p.vx = Math.sign(bv) === p.pushDir ? bv : 0;
      } else p.vx = 0;
    }
    // 縦に動いてぶつかったら戻す(下に当たれば着地)
    const prevY = p.y;
    const wasOn = p.ground; // 跳んだ時は上で null になっている
    p.y += p.vy * h;
    p.ground = null;
    for (const s of playerSolids(w, p)) {
      if (s.ref) { // 足場(リフト・台): 上から(足元が食い込んだ程度)なら上へ乗せる。それより深い・上へ離れていく時は素通り
        if (onTop(s)) { p.y = s.y - p.h; p.vy = 0; p.ground = s.ref; }
        continue;
      }
      if (!overlaps(p, s)) continue; // 前の地形を直した時に離れた
      // 押し戻す向きは、動いた向きではなく1つ前の位置で決める。足元が上端の少し下(4px)までなら上に乗せ(段差に乗り上げる)、
      // 頭が下端より下にあったら天井、どちらでもなければ横から入ったので横へ押し出す
      // (跳びながら段差の角に入ると、角のマスを天井と取り違えて1マス下へワープしていた。1面の縦リフトで壁にこすりつけて跳ぶ)
      if (prevY + p.h <= s.y + 4) { p.y = s.y - p.h; p.vy = 0; p.ground = STATIC; }
      else if (prevY >= s.y + s.h - 4) { p.y = s.y + s.h; p.vy = 0; }
      else { p.x = (p.x + p.w / 2 < s.x + s.w / 2) ? s.x - p.w : s.x + s.w; p.vx = 0; }
    }

    // トゲ・落下
    const touch = { x: p.x - 1, y: p.y - 1, w: p.w + 2, h: p.h + 2 };
    if (tilesIn(w, touch, '^').length) w.dead = 'トゲに刺さった';
    if (p.y > ROWS * TS + 64) w.dead = '落ちた';
  }
  const STATIC = { dx: 0, dy: 0 };

  // 円と矩形の衝突。押し返しは、壁に向かって動いていた時間の軸にだけ返す(2026-10-16)。
  // 各軸の寄与(t_i × 壁の向きの速度)で分けるので、壁に向かっていない軸には触れない。
  // 最初は変化を t の重みで全部の軸に分けていたが、斜めの θ で床に置いておくと、v₀ に上向き・
  // v₁ に下向きの見えない速度が打ち消し合ったまま貯まり、θ を戻すと浮き上がった。
  // rectContrib(nx, ny) は、矩形が軸ごとに玉へ向かって押してくる速さ [軸0, 軸1](見かけの速度の単位)。
  function circleRect(w, b, r, e, rectContrib) {
    const cx = Math.max(r.x, Math.min(b.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(b.y, r.y + r.h));
    let nx = b.x - cx, ny = b.y - cy;
    let d = Math.hypot(nx, ny);
    if (d >= b.r) return false;
    if (d < 1e-9) { // 中心が埋まった: 来た向き(1つ前の位置)へ戻す。分からなければ上へ(上へ抜けるワープの元だった)
      const bx = (b.px ?? b.x) - b.x, by = (b.py ?? b.y) - b.y, bl = Math.hypot(bx, by);
      if (bl > 1e-9) { nx = bx / bl; ny = by / bl; } else { nx = 0; ny = -1; }
      d = 0;
    } else { nx /= d; ny /= d; }
    const pen = b.r - d;
    b.x += nx * pen; b.y += ny * pen;
    const t = [w.t0, w.t1];
    const bi = [t[0] * (b.v0.x * nx + b.v0.y * ny), t[1] * (b.v1.x * nx + b.v1.y * ny)];
    const ri = rectContrib ? rectContrib(nx, ny) : [0, 0];
    const un = bi[0] + bi[1] - ri[0] - ri[1];
    if (un >= 0) return true;
    const ee = (!b.spike && Math.abs(un) < 30) ? 0 : e; // ゆっくり当たった時は跳ねずに止める(床の上で震えないように)。トゲトゲボールは常に跳ねる
    const dObs = -(1 + ee) * un;            // 見かけの速度で、法線の向きに足す量
    const wt = [Math.max(0, -bi[0]) + Math.max(0, ri[0]), Math.max(0, -bi[1]) + Math.max(0, ri[1])];
    const sum = wt[0] + wt[1];
    if (sum <= 1e-12) return true;
    const vs = [b.v0, b.v1];
    for (let i = 0; i < 2; i++) {
      if (wt[i] <= 0 || t[i] <= 1e-12) continue;
      const dv = dObs * wt[i] / (sum * t[i]); // この軸の寄与の分だけ、見かけの速度が変わる
      vs[i].x += dv * nx; vs[i].y += dv * ny;
    }
    return true;
  }

  function stepBalls(w, h) {
    const p = w.player;
    for (const b of w.balls) {
      // 力は自分の時間の軸の中でだけ働く
      b.v0.x += b.a0.x * w.t0 * h; b.v0.y += b.a0.y * w.t0 * h;
      b.v1.x += b.a1.x * w.t1 * h; b.v1.y += b.a1.y * w.t1 * h;
      const v = observed(b, w.t0, w.t1);
      b.x += v.x * h; b.y += v.y * h;
      const box = { x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r };
      for (const t of tilesIn(w, box, '#^b')) circleRect(w, b, t, b.e, null); // 'b' はボールだけを止める格子
      // リフトは自分の時間の軸でだけ押す
      for (const l of w.lifts) circleRect(w, b, l, b.e, (nx, ny) => {
        const c = l.vx * nx + l.vy * ny; return l.axis === 0 ? [c, 0] : [0, c];
      });
      // 台は軸ごとの速度で押す(壁に止められている分は数えない、見かけの速度で割り振る)
      for (const m of w.movers) circleRect(w, b, m, b.e, (nx, ny) => {
        const a0 = w.t0 * (m.v0.x * nx + m.v0.y * ny), a1 = w.t1 * (m.v1.x * nx + m.v1.y * ny);
        const real = m.vx * nx + m.vy * ny, sum = a0 + a1;
        return Math.abs(sum) < 1e-9 ? [0, 0] : [real * a0 / sum, real * a1 / sum];
      });
      if (b.spike) { // トゲトゲボールは蹴れない。触れたらやり直し
        const cx = Math.max(p.x, Math.min(b.x, p.x + p.w)), cy = Math.max(p.y, Math.min(b.y, p.y + p.h));
        if (Math.hypot(b.x - cx, b.y - cy) < b.r - 2) w.dead = 'トゲトゲボールに当たった';
        continue;
      }
      // プレイヤーに押されると、力がかかって加速する(走る速さまで)。プレイヤーは独立した時間なので、変化を t の重みで分ける
      // (前は重い壁として跳ね返り付きの衝撃を与えていて、壁との間に挟むと毎コマ蹴り返して速さが膨らみ、ボールが吹き飛んだ)
      if (p.pushBall === b && p.pushDir) {
        const u = observed(b, w.t0, w.t1).x * p.pushDir;
        if (u < RUN) { const dv = Math.min(PUSH_ACC * h, RUN - u) * p.pushDir; b.v0.x += w.t0 * dv; b.v1.x += w.t1 * dv; }
      }
      // ボールがプレイヤーに当たってきた時は、跳ね返らずに止まる
      circleRect(w, b, p, 0, (nx, ny) => {
        const c = p.vx * nx + p.vy * ny; return [c * w.t0 * w.t0, c * w.t1 * w.t1];
      });
      if (b.y > ROWS * TS + 64) w.dead = 'ボールが落ちた';
    }
  }

  function checkGoal(w) {
    if (w.goal === 'player') {
      const p = w.player;
      // 面1の裏ゴール: リフト2に乗った後、地面を一度も踏まずにリフト1に降りる(上の方で止めたリフト2から、左へ大きく跳ぶ)
      if (w.secretHop) {
        if (p.ground === w.lifts[1]) w.hop = 1;
        else if (p.ground === STATIC) w.hop = 0;
        else if (p.ground === w.lifts[0] && w.hop) { secretClear(w, 1, 'ナイスジャンプ！'); return; }
      }
      if (tilesIn(w, p, 'G').length) {
        w.cleared = true;
        if (w.secretNoTurn && w.thetaOps === 0) secretClear(w, w.index + 1, w.secretNoTurn); // 面4の裏ゴール: 一度も θ を回さずにクリア
        return;
      }
      // 面3の裏ゴール: 台がゴールに着いた時、プレイヤーが左端の壁に触れている(台から落ちただけでは足りず、わざわざ左端へ向かう奇行)
      if (w.movers.some(m => tilesIn(w, m, 'G').length) && p.x <= TS + 0.5) secretClear(w, 3, 'ドンマイ！');
    } else {
      // 面2の裏ゴール: ボールより先にプレイヤーがゴールに着いた(ボールに乗って運ばれてくる等)。クリアにはするが、表示を変える
      if (tilesIn(w, w.player, 'G').length) { secretClear(w, 2, 'そうじゃない！'); return; }
      for (const b of w.balls) {
        if (b.spike) continue;
        const c = Math.floor(b.x / TS), r = Math.floor(b.y / TS);
        if (tileAt(w, c, r) === 'G') w.cleared = true;
      }
    }
  }

  function secretClear(w, id, text) { w.cleared = true; w.secret = id; w.clearText = text; }

  // ---- 面5: 鳥 ----
  function stepBird(w, h, input) {
    const b = w.bird;
    if (input.flap) {
      // 羽ばたき: 見かけの縦の速度を −flap にする。各軸へは t の重みで分ける(打ち消し合う見えない速度もここで消える)
      b.v0.y = -b.flap * w.t0; b.v1.y = -b.flap * w.t1;
    }
    b.v0.y = Math.max(-b.cap, Math.min(b.cap, b.v0.y + b.a0.y * w.t0 * h)); // 重力は自分の時間の軸の中でだけ働く
    b.v1.y = Math.max(-b.cap, Math.min(b.cap, b.v1.y + b.a1.y * w.t1 * h));
    b.x += b.vx * h;                                  // 前へ進むのは、あなたの鳥なので独立した時間
    b.y += (w.t0 * b.v0.y + w.t1 * b.v1.y) * h;
    const box = () => ({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r });
    for (const t of tilesIn(w, box(), '^')) { // トゲはやり直し
      const cx = Math.max(t.x, Math.min(b.x, t.x + t.w)), cy = Math.max(t.y, Math.min(b.y, t.y + t.h));
      if (Math.hypot(b.x - cx, b.y - cy) < b.r) { w.dead = 'トゲに刺さった'; return; }
    }
    // 壁は死なない。横から当たると横の速さを失い(もう進めない)、上下から当たると、壁に向かっていた軸の縦の速さだけ止まる
    for (const t of tilesIn(w, box(), '#')) {
      const cx = Math.max(t.x, Math.min(b.x, t.x + t.w)), cy = Math.max(t.y, Math.min(b.y, t.y + t.h));
      let nx = b.x - cx, ny = b.y - cy; const d = Math.hypot(nx, ny);
      if (d >= b.r) continue;
      if (d < 1e-9) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
      b.x += nx * (b.r - d); b.y += ny * (b.r - d);
      if (Math.abs(nx) > Math.abs(ny)) { if (b.vx * nx < 0) b.vx = 0; }
      else {
        if (w.t0 > 0 && b.v0.y * ny < 0) b.v0.y = 0;
        if (w.t1 > 0 && b.v1.y * ny < 0) b.v1.y = 0;
      }
    }
    if (b.vx === 0) w.stuck = true; // 自動ではやり直さず、何も知らせない(なぜ進めなくなったかは、プレイヤーが自分で気づく)
    if (tilesIn(w, box(), 'G').length) {
      w.cleared = true;
      if (w.secretNoTurn && w.thetaOps === 0) secretClear(w, 5, w.secretNoTurn); // 面5の裏ゴール: 一度も θ を回さずに、羽ばたきだけでトゲのトンネルを抜けた
    }
  }

  // ---- 面6: リサージュ ----
  function makeLiss(L) {
    const [p, q] = L.ratio, target = [], N = 400 * Math.max(p, q); // 振動数が多いほど、目標の点を細かく
    for (let i = 0; i < N; i++) { // 目標の曲線: x = A sin(p u)、y = −B sin(q u)、u は 0〜2π
      const u = i / N * Math.PI * 2;
      target.push(vec(L.cx + L.A * Math.sin(p * u), L.cy - L.B * Math.sin(q * u)));
    }
    // ゲームのための小さなインチキ: 本当の正解は atan(q/p)(4:11 なら 70.017°)だが、表示の 70.0° でぴったり閉じるように、
    // この面のボールの時計にだけ、その差(+0.017°)を足した角度を使う。計器の表示とほかの物は本当の θ のまま
    const cheat = L.snapDeg === undefined ? 0 : Math.atan(q / p) - L.snapDeg * Math.PI / 180;
    return { ...L, target, cheat, covered: new Uint8Array(target.length), coveredCount: 0, opsAtPress: 0, active: false, c0: 0, c1: 0, x: L.cx, y: L.cy, trace: [], bad: false };
  }
  function pressLiss(L) {
    L.active = true; L.c0 = 0; L.c1 = 0; L.x = L.cx; L.y = L.cy; L.trace = [vec(L.cx, L.cy)]; L.bad = false;
    L.covered.fill(0); L.coveredCount = 0;
  }
  function stepLiss(w, h) {
    const L = w.liss;
    if (!L.active) return;
    const th = w.theta + L.cheat; // 小さなインチキを足した角度(makeLiss)
    L.c0 += Math.cos(th) * h; L.c1 += Math.sin(th) * h; // 押してからの、それぞれの時間の軸の時計
    L.x = L.cx + L.A * Math.sin(L.omega * L.c0);
    L.y = L.cy - L.B * Math.sin(L.omega * L.c1);
    // クリアは、全部の点の近くを通り、さらにボールが始点に戻った(図形を1周描き終えた)時。横の振動がちょうど p 回分進んだ所
    if (!L.bad && L.coveredCount === L.target.length && L.omega * L.c0 >= 2 * Math.PI * L.ratio[0]) {
      w.cleared = true;
      // 面6の裏ゴール: 最後にボタンを押してから、θ を10回以上操作して描き切った(70.0° に合わせて待てばいいのに)
      if (w.thetaOps - L.opsAtPress >= 10) secretClear(w, 6, '70.0°で放置すればいいのに！');
      // 始点のすぐ近く(4px 以内)なら、始点に置いて軌道を閉じる。途中で θ を回してずれを抱えたままクリアした時は、
      // 置き直すと大きなワープに見えるので、その場で止める
      if (Math.hypot(L.x - L.cx, L.y - L.cy) < 4) { L.x = L.cx; L.y = L.cy; }
      L.trace.push(vec(L.x, L.y)); return;
    }
    const last = L.trace[L.trace.length - 1];
    if (Math.hypot(L.x - last.x, L.y - last.y) < 3) return; // 軌道は3pxごとに記録する
    L.trace.push(vec(L.x, L.y));
    // ぴったりか: 軌道の点が目標から tol 以上離れたら外れ。目標の点のうち近くを通った物を「覆った」とする
    let best = Infinity;
    for (let i = 0; i < L.target.length; i++) {
      const d = Math.hypot(L.target[i].x - L.x, L.target[i].y - L.y);
      if (d < best) best = d;
      if (d < L.tol && !L.covered[i]) { L.covered[i] = 1; L.coveredCount++; }
    }
    if (best > L.tol) L.bad = true;

  }

  // ---- 面7: ブラックホール ----
  const G_BOX = 900;
  const BOX_IDLE = 8, BOX_RIDE = 15, BOX_FADE = 2;
  const STREAK_GAP = 8; // 面7のクリアの数え方: 中心で、運ぶ間隔がこれ(外の時間の秒)を超えたら数え直す // 床で止まって8秒・リフトに乗って15秒(外の時間)たった箱は、2秒かけて消える
  function placeLissLift(w, h) {
    const L = w.lissLift, l = w.lifts[0];
    let cxl, top;
    if (!L.active) { cxl = L.cx; top = L.cy; } // 押す前は真ん中で止まっている(箱の落ちる所の下ではない)
    else {
      const p0 = L.omega * L.c0 - Math.PI / 2, p1 = L.omega * L.c1 - Math.PI / 2;
      cxl = L.cx + L.A * Math.sin(p0); top = L.cy + L.B * Math.sin(2 * p1);
    }
    const nx = cxl - l.w / 2, ny = top;
    l.dx = nx - l.x; l.dy = ny - l.y; l.vx = l.dx / h; l.vy = l.dy / h; l.x = nx; l.y = ny;
  }
  function boxSolids(w, b) {
    const box = { x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r };
    return tilesIn(w, box, '#').concat((w.stoppers || []).filter(st => overlaps(box, st)));
  }
  // 外の世界(リフト・箱)を hw 秒だけ進める
  function stepOutside(w, hw) {
    w.T0 += w.t0 * hw; w.T1 += w.t1 * hw; w.outside += hw;
    const L = w.lissLift, l = w.lifts[0];
    if (L.active) { L.c0 += w.t0 * hw; L.c1 += w.t1 * hw; }
    placeLissLift(w, hw);
    const S = w.boxSpawn;
    S.timer += w.t1 * hw; // 箱が出てくるのは t₁ の時計で数える
    if (S.timer >= S.interval) { S.timer -= S.interval; if (w.boxes.length < S.max) w.boxes.push({ x: S.x, y: S.y, r: 10, v0: vec(0, 0), v1: vec(0, 0), on: null }); }
    for (let i = w.boxes.length - 1; i >= 0; i--) {
      const b = w.boxes[i];
      // 床で止まったまま、あるいはリフトに乗ったまま長く残った箱は、ゆっくり消える(上限で詰まって進めなくならないように)
      if (b.sleep) b.idle = (b.idle || 0) + hw;
      if (b.on) b.ride = (b.ride || 0) + hw; else b.ride = 0;
      if (b.fade !== undefined || (b.sleep && b.idle > BOX_IDLE) || (b.on && b.ride > BOX_RIDE)) {
        b.fade = (b.fade || 0) + hw / BOX_FADE;
        if (b.fade >= 1) { w.boxes.splice(i, 1); continue; }
      }
      if (b.on) {
        // リフトに乗っている箱は、リフトと一緒に動く。何かに当たったら(当たり板など)、押し出されて降りる
        b.px = b.x; b.py = b.y;
        b.x += l.dx; b.y = l.y - b.r;
        const hit = boxSolids(w, b);
        // 上にある地形へ下から押し付けられたら、箱は潰れて消える(押し出すと地形の上へワープしていた)
        if (hit.some(t => b.x >= t.x && b.x <= t.x + t.w && t.y + t.h <= b.y)) { w.boxes.splice(i, 1); continue; } // 地形が箱の真上にある時だけ(横から当たったのは押し出す)
        if (hit.length || b.x < l.x || b.x > l.x + l.w) {
          for (const t of hit) circleRect(w, b, t, 0, null);
          b.on = null; b.v0.x = b.v0.y = b.v1.x = b.v1.y = 0;
        }
      } else if (b.sleep) {
        continue; // 床で止まった箱は眠らせる(床の上では、もう何も箱を動かさない)
      } else {
        // 重力は t₁ の世界だけにある(θ = 0° なら浮いたまま、45° なら半分の強さで落ちる)
        b.v1.y += G_BOX * w.t1 * hw;
        const v = observed(b, w.t0, w.t1);
        b.px = b.x; b.py = b.y;
        b.x += v.x * hw; b.y += v.y * hw;
        const solids = boxSolids(w, b);
        for (const t of solids) circleRect(w, b, t, 0.2, null);
        const sp = observed(b, w.t0, w.t1);
        b.still = (solids.length && Math.hypot(sp.x, sp.y) < 2) ? (b.still || 0) + 1 : 0;
        if (b.still > 30 && b.y > 11 * TS) { b.sleep = true; continue; } // 床の上で止まり続けたら眠る
        // リフトの上に落ちたら乗る
        if (b.x >= l.x && b.x <= l.x + l.w && b.y + b.r >= l.y - 2 && b.y + b.r <= l.y + l.h + 6 && b.y < l.y) {
          b.on = l; b.y = l.y - b.r; b.v0.x = b.v0.y = b.v1.x = b.v1.y = 0;
        }
      }
      // 目標領域に箱の四角がかかったら数える。中心に入っている間は、1個ごとに増える数がだんだん大きくなる(演出)
      if (!b.on && tilesIn(w, { x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r }, 'T').length) {
        if (w.player.trapped) {
          // 運ぶ間隔が外の時間で STREAK_GAP 秒を超えたら数え直す(正しい ∞ なら1周約6秒ごとに必ず運べる。ずれた角度では空白が挟まる)
          if (w.outside - w.lastGainOutside > STREAK_GAP) w.realSinceEntry = 0;
          w.realSinceEntry++; w.lastGainOutside = w.outside;
          // 「進んだ」のは、中に入ってからの一番長い続きを更新した時だけ(暗転してやり直すまでの時計 lastGainT)。
          // ずれた角度では、運べない周の合間に数個ずつ運べても、続きが伸びないので暗転する
          if (w.realSinceEntry > w.bestStreak) { w.bestStreak = w.realSinceEntry; w.lastGainT = w.trapT; }
        }
        w.count++;
        w.boxes.splice(i, 1); continue;
      }
      if (b.y > ROWS * TS + 40) w.boxes.splice(i, 1);
    }
    if (w.player.trapped && w.realSinceEntry >= w.clearReal) w.cleared = true;
  }
  // あなたの位置での、外の時間の進み方(あなたの1秒に対して外が何秒進むか)。近づくほど「だんだん」上がる
  function timeFactor(w) {
    const B = w.bh, p = w.player;
    if (p.trapped) return B.kEdge + (B.kMax - B.kEdge) * Math.min(1, w.trapT / B.ramp);
    const d = Math.hypot(p.x + p.w / 2 - B.x, p.y + p.h / 2 - B.y);
    if (d >= B.timeR) return 1; // 遠くでは時間の遅れも無し(作業やほかの物に影響しない)
    const s = Math.max(0, 1 - (d - B.rs) / (B.timeR - B.rs));
    return 1 + (B.kEdge - 1) * Math.pow(s, B.kPow);
  }
  // 引力の強さ(演出なので距離の1.2乗に反比例、pullR より遠くでは0)
  function pullAccel(B, d) {
    return d >= B.pullR ? 0 : B.pullK * (Math.pow(Math.max(d, B.rs), -1.2) - Math.pow(B.pullR, -1.2));
  }
  function stepStage7(w, h, input) {
    const p = w.player, B = w.bh;
    if (!p.trapped) {
      // 引力は、床の摩擦では止まらない「流れ」として、横向きに引きずる(だんだん速くなる)
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2, d = Math.hypot(cx - B.x, cy - B.y);
      const a = pullAccel(B, d);
      p.pull = (p.pull || 0) * Math.exp(-0.8 * h) + a * Math.sign(B.x - cx) * h;
      if (a === 0) p.pull = 0;
      stepPlayer(w, h, input, p.pull);
      if (w.dead) return;
      if (p.hitX) p.pull = 0;
      const d2 = Math.hypot(p.x + p.w / 2 - B.x, p.y + p.h / 2 - B.y);
      if (d2 <= B.rs) { p.trapped = true; w.trapT = 0; w.countAtEntry = w.count; w.realSinceEntry = 0; w.bestStreak = 0; w.lastGainT = 0; w.lastGainOutside = w.outside; } // 中心(地平線の内側)。もう出られない
    }
    if (p.trapped) {
      p.x = B.x - p.w / 2; p.y = B.y - p.h / 2; p.vx = p.vy = 0; w.trapT += h;
      // しばらく数が増えなければ、だんだん暗転してやり直す
      w.fade = Math.max(0, Math.min(1, (w.trapT - w.lastGainT - B.stall) / B.fade));
      if (w.fade >= 1) { w.retry = true; return; }
      // 面7の裏ゴール: 1〜6面の裏ゴールを全部見た後、中心でキーボードを S → T → A → Y と押す。画面が続きを返して「STAY with me!」になる(インターステラー)
      if (w.allSecrets) for (const ch of input.typed || '') {
        w.stayBuf = (w.stayBuf + ch).slice(-4);
        if (w.stayBuf === 'stay') { secretClear(w, 7, 'with me!'); return; }
      }
    }
    if (input.press && !p.trapped && tilesIn(w, p, 'B').length) {
      const L = w.lissLift; L.active = true; L.c0 = 0; L.c1 = 0;
    }
    // 外の世界は k 倍の速さで進む。リフトと箱がすり抜けないよう、1回に 1/240 秒ずつ進める
    w.k = timeFactor(w);
    const total = h * w.k, n = Math.max(1, Math.ceil(total / (1 / 240)));
    for (let i = 0; i < n; i++) { stepOutside(w, total / n); if (w.cleared) break; }
  }

  // 1ステップ進める。h は秒。input = { left, right, jump, flap, press, typed }(typed: このステップで押された文字キー、面7の裏ゴール用)
  function step(w, h, input) {
    w.theta += (w.thetaTarget - w.theta) * Math.min(1, h * EASE);
    w.theta = Math.max(0, Math.min(Math.PI / 2, w.theta));
    w.t0 = Math.cos(w.theta); w.t1 = Math.sin(w.theta);
    if (w.cleared || w.dead) return;
    if (!w.started) {
      if (input.left || input.right || input.jump || input.flap) w.started = true; else return; // 最初に動くまで世界の時間は止めておく
    }
    if (w.bh) { stepStage7(w, h, input); return; } // 時計は外の世界の中で進める
    w.T0 += w.t0 * h; w.T1 += w.t1 * h;
    if (w.bird) { stepBird(w, h, input); return; }
    placeLifts(w, h);
    moveMovers(w, h);
    stepPlayer(w, h, input);
    if (w.dead) return;
    stepBalls(w, h);
    if (w.liss) {
      if (input.press && tilesIn(w, w.player, 'B').length) { pressLiss(w.liss); w.liss.opsAtPress = w.thetaOps; }
      stepLiss(w, h);
      return;
    }
    checkGoal(w);
  }

  // 面7のクリアの後の演出: 外の世界(リフトと箱)だけを k 倍で進め続ける。1回の計算の数には上限を付け、超えたら刻みを粗くする
  function stepOutsideFast(w, h, k) {
    const total = h * k, n = Math.min(1500, Math.max(1, Math.ceil(total / (1 / 240))));
    w.k = k;
    for (let i = 0; i < n; i++) stepOutside(w, total / n);
  }

  const api = { TS, COLS, ROWS, STAGES, createWorld, step, observed, tileAt, stepOutsideFast };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TwoTime = api;
})(typeof window !== 'undefined' ? window : globalThis);

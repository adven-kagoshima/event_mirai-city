// game-kit.js：ゲームの画面・入力・表示の部品（全ジャンル共通）
// game.html で、sound.js のあと、ゲームのスクリプトより前に読み込む
//   <script src="game-assets/_js/sound.js"></script>
//   <script src="game-assets/_js/game-kit.js"></script>
//
// 画面は 960×540。ウィンドウに合わせて形を変えずに広がる。座標はいつも 960×540 で考える
// 1フレームの描く順番：背景 → ゲームの draw(ctx) → キラキラ・浮かぶ文字 → ハート・点数・時間 → 操作の案内 → 音のボタン → タイトルなどの画面
// 表示の文字は英語（SCORE・TIME・STAGE CLEAR! など）。数字は game-assets/_ui の数字の絵で出す
//
// 使えるもの
//   kit.start({ images:{名前:"パス"}, update(dt), draw(ctx) })   画像を読み込んでから始める。dt は秒
//   kit.img("名前")                                  読み込んだ画像
//   kit.draw("名前", x, y, w, h, {flip, alpha, angle})   画像を貼る。x, y は左上。angle はラジアン（中心で回す）
//   kit.down("ArrowLeft")    押しているあいだ true      kit.pressed("Enter")  押した瞬間だけ true（スペースは " "）
//   kit.click                クリックした瞬間だけ {x, y}。ほかは null
//   kit.text("文字", x, y, {size, color, align})       縁取りのある文字（ゲームの中に出す短い文字に使う）
//   kit.hit(a, b)            {x, y, w, h} どうしが重なっていれば true
//   kit.sparks(x, y)         キラキラが飛び散る          kit.popup("+10", x, y)  文字が浮かんで消える
//   kit.background({far, mid, near, floor})           背景の3枚（パス）。near はなくてよい。宇宙（scifi）の中景は縦にもつなげる
//                     floor: 330 のように y を渡すと、その高さから下に、同じ舞台の地面のタイルをしく（RPG の足もと）
//   kit.scroll(x, y)          世界が動いた量（右へ進むと x が増え、上へ進むと y が減る）。中景はその 0.3 倍で流れる
//   kit.road({curvy, length, laps, ground})        レースの道（縦スクロール）。道・地面・道のわきの景色は kit が描く
//                     kit.scroll(0, -進んだ距離) で流れる。距離 d はスタートの線が 0 で、上へ進むほど大きい
//                     周回の線を越えると、kit が LAP 2/3・FINAL LAP! を大きく出して音を鳴らす
//   kit.roadX(d)        距離 d の道のまん中の x        kit.roadHalf  道の走れる幅の半分（道は kit.roadX(d) ± kit.roadHalf）
//   kit.screenY(d)      距離 d の画面の y（いまの距離の場所が y=400 に来る）
//   kit.hud({hearts, maxHearts, score, time, info})   ハート（左上）・時間（上のまん中）・点数（右上）。使わないものは書かない
//                                                     info は ["LAP", "2/3"] のような [英語のラベル, 値] の配列
//   kit.guide([["←→", "MOVE"], ["SPACE", "JUMP"]])    下の操作の案内（キーと英語1語）。始めて数秒でうすくなる
//   kit.screen({kind, title, lines, keys, score})     タイトル・クリア・ゲームオーバーの画面。kit.screen(null) で消す
// RPG の部品（毎フレーム update の中でよぶ。よんでいるあいだだけ画面に出る）
//   kit.menu(["たたかう", "かいふく", "にげる"], "どうする？")   左下にコマンド、右下に問いかけ。↑↓・Enter・スペース・クリックで選ぶ
//                     選ばれたフレームだけ、その番号（0から）を返す。ほかは -1
//   kit.message("スライムが あらわれた！")        下のメッセージ枠に1文字ずつ出す。出しきってから Enter・スペース・クリックで true を返す
//   kit.enemyHp(残り, 最大, x, 上はしのy)              draw の中でよぶ。敵の絵の少し上（x がまん中）にHPのバーを出す（1つ分ごとに区切り）
//       kind:"title"  title にゲームの名前、lines に目的を1行、keys に操作の案内。PRESS ENTER と HOW TO PLAY のボタンが出る
//                     lines と keys は HOW TO PLAY のカード（ボタンか H キーで開く）に出る
//       kind:"clear"  STAGE CLEAR! と score が出る      kind:"over"  GAME OVER と score が出る
// 音（sound.js）は、kit が startAudio()・updateBgm(dt) をよび、Mキーと右上のボタンで muted を切りかえる

const kit = (function(){
  const W = 960, H = 540;
  const me = document.currentScript;
  const base = me && me.src ? me.src.replace(/_js\/game-kit\.js(\?.*)?$/, "") : "game-assets/";
  const EN = '900 {s}px "Arial Black", "Segoe UI Black", "Arial Rounded MT Bold", Arial, sans-serif';
  const JA = 'bold {s}px "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif';
  const INK = "#1b1f3a";                           // 縁取りの色

  const style = document.createElement("style");
  style.textContent = "html,body{margin:0;height:100%;background:#0b0e1c;overflow:hidden;}"
    + "body{display:flex;align-items:center;justify-content:center;}"
    + "canvas#kit{display:block;touch-action:none;}";
  document.head.appendChild(style);

  let canvas, ctx, scale = 1, dpr = 1;
  const images = {}, ui = {};
  const keys = {}, hits = {};
  let clickNext = null;
  let opt = {}, last = 0, time = 0;
  let bg = null, bgImg = {}, scrollX = 0, scrollY = 0;
  let lastHudTime = null;
  let hudState = null, guideList = null, guideT = 0, screenState = null, screenT = 0;
  let menuNow = null, menuSel = 0, menuKey = "", msgNow = null, msgText = "", msgShown = 0;   // RPG のコマンドとメッセージ
  let howOpen = false;                                // タイトルの HOW TO PLAY のカードが開いているか
  const fx = [];
  let audioStarted = false;

  // ---------- 画面と入力 ----------
  function setup(){
    canvas = document.querySelector("canvas#kit") || document.createElement("canvas");
    canvas.id = "kit";
    if(!canvas.parentNode) document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("keydown", function(e){
      const k = e.code === "Space" ? " " : e.key;
      if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].indexOf(k) >= 0) e.preventDefault();
      firstInput();
      if(!keys[k]) hits[k] = true;
      keys[k] = true;
      if((k === "m" || k === "M") && !e.repeat) toggleSound();
      if((k === "h" || k === "H") && !e.repeat && hasHowTo()) howOpen = !howOpen;
      if(k === "Escape") howOpen = false;
    });
    window.addEventListener("keyup", function(e){ keys[e.code === "Space" ? " " : e.key] = false; });
    window.addEventListener("blur", function(){ for(const k in keys) keys[k] = false; });
    canvas.addEventListener("pointerdown", function(e){
      firstInput();
      const r = canvas.getBoundingClientRect();
      const p = {x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H};
      if(onSoundButton(p)){ toggleSound(); return; }
      if(howOpen){ howOpen = false; return; }                             // カードが開いていたら、クリックで閉じる
      if(hasHowTo() && p.x >= HB.x && p.x <= HB.x + HB.w && p.y >= HB.y && p.y <= HB.y + HB.h){ howOpen = true; return; }
      clickNext = p;
    });
  }
  function firstInput(){
    if(audioStarted) return;
    audioStarted = true;
    if(typeof startAudio === "function") startAudio();
  }
  function fit(){
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    dpr = window.devicePixelRatio || 1;
    canvas.style.width = Math.floor(W * scale) + "px";
    canvas.style.height = Math.floor(H * scale) + "px";
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
  }
  function loadAll(list, into, done){
    const names = Object.keys(list);
    let left = names.length;
    if(!left){ done(); return; }
    names.forEach(function(n){
      const im = new Image();
      im.onload = im.onerror = function(){ if(--left === 0) done(); };
      im.src = list[n];
      into[n] = im;
    });
  }

  function start(o){
    opt = o || {};
    setup();
    const mine = {heart: "_common/objects/hud_heart.png", heartEmpty: "_common/objects/hud_heart_empty.png",
                  star: "_common/objects/spark_star.png", twinkle: "_common/objects/spark_twinkle.png",
                  coin: "_ui/coin.png", times: "_ui/times.png"};
    for(let i = 0; i <= 9; i++) mine["d" + i] = "_ui/digit_" + i + ".png";
    Object.keys(mine).forEach(function(k){ mine[k] = base + mine[k]; });
    let left = 2;
    function go(){ if(--left === 0) requestAnimationFrame(loop); }
    loadAll(mine, ui, go);
    loadAll(opt.images || {}, images, go);
  }

  function loop(t){
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t; time += dt;
    api.click = clickNext; clickNext = null;
    if(typeof updateBgm === "function") updateBgm(dt);
    menuNow = null; msgNow = null;
    if(opt.update) opt.update(dt);
    if(msgNow !== null) msgShown = Math.min(msgText.length, msgShown + dt * 30);   // 1秒に30文字
    if(screenState){ guideT = 0; screenT += dt; } else { guideT += dt; screenT = 0; }
    updateFx(dt);

    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawRoad();
    ctx.save(); if(opt.draw) opt.draw(ctx); ctx.restore();
    if(!screenState) drawFx();
    if(!screenState || screenState.kind !== "title") drawHud();
    if(!screenState) drawLapBanner(dt);
    if(!screenState) drawRpgBoxes();
    if(menuNow === null && msgNow === null) drawGuide();
    drawSoundButton();
    drawScreen();
    if(screenState) drawFx();
    for(const k in hits) delete hits[k];
    requestAnimationFrame(loop);
  }

  // ---------- 絵と文字 ----------
  function drawImg(name, x, y, w, h, o){
    const im = typeof name === "string" ? images[name] : name;
    if(!im || !im.complete || !im.naturalWidth) return;
    o = o || {};
    w = w || im.naturalWidth; h = h || im.naturalHeight;
    ctx.save();
    if(o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.translate(x + w / 2, y + h / 2);
    if(o.angle) ctx.rotate(o.angle);
    if(o.flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  function isJa(s){ return /[^\x00-\x7f←→↑↓]/.test(s); }
  function fontOf(s, size){ return (isJa(s) ? JA : EN).replace("{s}", size); }
  function measure(s, size){
    ctx.save(); ctx.font = fontOf(s, size);
    if(isJa(s) && "letterSpacing" in ctx) ctx.letterSpacing = Math.round(size * 0.06) + "px";
    const w = ctx.measureText(s).width; ctx.restore(); return w;
  }
  // ゲームの中の短い文字：白い文字に紺の縁
  function text(s, x, y, o){
    o = o || {};
    const size = o.size || 24;
    ctx.save();
    ctx.font = fontOf(String(s), size);
    ctx.textAlign = o.align || "left"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    if(o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    const ja = isJa(String(s));
    if(ja && "letterSpacing" in ctx) ctx.letterSpacing = Math.round(size * 0.04) + "px";
    ctx.lineWidth = ja ? Math.max(3, size * 0.16) : Math.max(4, size * 0.25); ctx.strokeStyle = o.outline || INK;   // 漢字は線がこむので、縁を細く
    ctx.strokeText(s, x, y);
    ctx.fillStyle = o.color || "#ffffff";
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  // 見出しの文字：上下で色が変わる文字に、太い縁と影
  function bigText(s, x, y, size, top, bottom){
    ctx.save();
    ctx.font = fontOf(s, size);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    // 漢字・かなは線がこむので、縁を細くし、字の間を少しあける（太い縁だと、すき間がうまってつぶれて見える）
    const ja = isJa(s), k = ja ? 0.5 : 1;
    if(ja && "letterSpacing" in ctx) ctx.letterSpacing = Math.round(size * 0.06) + "px";
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = size * 0.3 * k; ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeText(s, x, y + size * 0.08); ctx.fillText(s, x, y + size * 0.08);
    ctx.lineWidth = size * 0.26 * k; ctx.strokeStyle = INK; ctx.strokeText(s, x, y);
    if(!ja){ ctx.lineWidth = size * 0.1; ctx.strokeStyle = "#ffffff"; ctx.strokeText(s, x, y); }
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillText(s, x, y);
    ctx.restore();
  }
  // 数字の絵（game-assets/_ui/digit_0〜9）。align は "left" / "center" / "right"。戻り値は幅
  function digitsWidth(n, size){ return size * 0.5 * (String(Math.max(0, Math.floor(n))).length - 1) + size * 0.53; }
  function digits(n, x, y, size, align){
    const s = String(Math.max(0, Math.floor(n)));
    const step = size * 0.5, w = digitsWidth(n, size);
    const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    for(let i = 0; i < s.length; i++) drawImg(ui["d" + s[i]], left + i * step - size * 0.23, y - size / 2, size, size);   // 絵の左右の余白をのぞいて並べる
    return w;
  }
  // 文字は画面の点（ピクセル）にそろえて描かれるので、動かす量も点にそろえる。そろえないと、文字と枠が1点ずつずれて揺れて見える
  function snap(v){ const k = scale * dpr; return Math.round(v * k) / k; }
  function shadowed(fn){ ctx.save(); ctx.shadowColor = "rgba(10,14,40,0.75)"; ctx.shadowOffsetY = 3; ctx.shadowBlur = 5; fn(); ctx.restore(); }   // 明るい背景でも見えるように、こい影
  function roundRect(x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function label(s, x, y, align){ text(s, x, y, {size: 15, align: align || "left", color: "#fff6c8"}); }

  // ---------- 背景 ----------
  function setBackground(b){
    bg = b; bgImg = {};
    if(!b) return;
    if(b.wrapY === undefined) b.wrapY = /\/scifi\//.test(b.mid || "");   // 宇宙の星は上下左右につながる絵
    const list = {far: b.far, mid: b.mid};
    if(b.near) list.near = b.near;
    if(b.floor){                                                      // RPG：足もとに、同じ舞台の地面のタイルを1列しく
      const dir = String(b.far).replace(/[^\/]*$/, "");
      list.floorTop = dir + "ground_top.png"; list.floorCenter = dir + "ground_center.png";
    }
    loadAll(list, bgImg, function(){});
  }
  function drawBackground(){
    if(!bg) return;
    const ok = function(im){ return im && im.complete && im.naturalWidth; };
    if(ok(bgImg.far)) ctx.drawImage(bgImg.far, 0, 0, W, H);
    if(ok(bgImg.near)) ctx.drawImage(bgImg.near, bg.nearX || 740, bg.nearY || 90, 100, 100);   // 太陽・月・惑星は、中景（山や星）よりうしろ
    if(ok(bgImg.mid)){
      const ox = ((-scrollX * 0.3) % W + W) % W;
      if(bg.wrapY){
        const oy = ((-scrollY * 0.3) % H + H) % H;
        for(let i = -1; i <= 0; i++) for(let j = -1; j <= 0; j++) ctx.drawImage(bgImg.mid, ox + i * W, oy + j * H, W, H);
      } else {
        const oy = bg.floor ? bg.floor - H + 24 : Math.max(0, -scrollY * 0.3);   // 上へ進むと、山や丘が下へ消える。地面があるときは、中景の下はしを地面にそろえる
        ctx.drawImage(bgImg.mid, ox - W, oy, W, H); ctx.drawImage(bgImg.mid, ox, oy, W, H);
      }
    }
    if(bg.floor && ok(bgImg.floorTop)){
      for(let x = 0; x < W; x += 64){
        ctx.drawImage(bgImg.floorTop, x, bg.floor, 64, 64);
        for(let y = bg.floor + 64; y < H; y += 64) if(ok(bgImg.floorCenter)) ctx.drawImage(bgImg.floorCenter, x, y, 64, 64);
      }
    }
  }

  // ---------- レースの道（縦スクロール）----------
  // 道は横4マス（128px のタイル）。曲がる道は、タイルを高さ4pxの帯に切って、帯ごとに横へずらして描く
  const ROAD_Y = 400, TILE = 128, ROAD_W = 4 * TILE, ROAD_HALF = 236, STRIP = 4;
  let road = null, lastView = null, lapBanner = null;
  const roadImg = {};
  function setRoad(o){
    road = Object.assign({curvy: false, length: 12600, laps: 1, ground: "grass"}, o || {});
    lastView = null; lapBanner = null;
    road.length = Math.max(TILE * 8, road.length);
    road.waves = Math.max(1, Math.round(road.length / 2400));
    const t = base + "racing/tiles/", a = t + "asphalt_road/road_asphalt", ob = base + "racing/objects/";
    loadAll({
      ground: t + ({sand: "sand/land_sand12.png", dirt: "dirt/land_dirt12.png"}[road.ground] || "grass/land_grass04.png"),
      l: a + "21.png", m: a + "22.png", r: a + "23.png", fl: a + "69.png", fm: a + "70.png", fr: a + "71.png",
      treeL: ob + "tree_large.png", treeS: ob + "tree_small.png", tribune: ob + "tribune_full.png", tentR: ob + "tent_red.png", tentB: ob + "tent_blue.png"
    }, roadImg, function(){});
  }
  // 道のまん中。スタートとゴールの線の近くはまっすぐにして、そのあいだをゆるく曲げる（1周ごとに同じ形）
  function roadX(d){
    if(!road || !road.curvy || d <= 0) return W / 2;
    const L = road.length, u = d % L;
    const e = Math.max(0, Math.min(1, u / 900, (L - u) / 900)), ease = e * e * (3 - 2 * e);
    return W / 2 + 110 * ease * Math.sin(u / L * Math.PI * 2 * road.waves);
  }
  function viewD(){ return -scrollY; }
  // 周回の線を越えたら、画面のまん中に LAP 2/3（最後の周は FINAL LAP!）を大きく出して、音を鳴らす
  function checkLap(){
    if(!road || road.laps < 2) return;
    const v = viewD();
    if(lastView !== null && v > lastView){
      for(let k = 1; k < road.laps; k++){
        const line = k * road.length;
        if(lastView < line && v >= line){
          lapBanner = {text: k + 1 === road.laps ? "FINAL LAP!" : "LAP " + (k + 1) + "/" + road.laps, t: 0};
          if(typeof se === "function") se("good");
          sparks(W / 2 - 160, 200, 12); sparks(W / 2 + 160, 200, 12);
        }
      }
    }
    lastView = v;
  }
  function drawLapBanner(dt){
    checkLap();
    if(!lapBanner) return;
    lapBanner.t += dt;
    const t = lapBanner.t;
    if(t > 1.8){ lapBanner = null; return; }
    const pop = Math.min(1, t / 0.25), sc = 1 + Math.sin(pop * Math.PI) * 0.25;
    ctx.save();
    ctx.globalAlpha = t > 1.4 ? (1.8 - t) / 0.4 : 1;
    ctx.translate(snap(W / 2), snap(200)); ctx.scale(sc, sc);
    const fin = lapBanner.text.indexOf("FINAL") === 0;
    bigText(lapBanner.text, 0, 0, 72, fin ? "#ffd0d0" : "#fff8b0", fin ? "#e5484d" : "#ffb52e");
    ctx.restore();
  }
  function screenY(d){ return ROAD_Y - (d - viewD()); }
  function isLineRow(row){
    if(row === 0) return true;
    for(let k = 1; k <= road.laps; k++) if(row === Math.floor(k * road.length / TILE)) return true;   // その距離をふくむタイルの行に線を引く
    return false;
  }
  function hash(n){
    n = (n + 100003) | 0; n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  }
  function drawRoad(){
    if(!road) return;
    const ok = function(im){ return im && im.complete && im.naturalWidth; };
    const v = viewD();
    if(ok(roadImg.ground)){                                  // 地面
      const oy = ((ROAD_Y + v) % TILE + TILE) % TILE;
      for(let y = oy - TILE; y < H; y += TILE) for(let x = 0; x < W; x += TILE) ctx.drawImage(roadImg.ground, x, y, TILE, TILE);
    }
    drawScenery(v, ok);
    for(let d = Math.ceil((v + ROAD_Y) / STRIP) * STRIP; ; d -= STRIP){   // 道。上から下へ帯を描く
      const y = screenY(d);
      if(y >= H) break;
      const row = Math.floor((d - STRIP) / TILE), sy = (row + 1) * TILE - d;
      const x0 = roadX(d - STRIP / 2) - ROAD_W / 2;
      const set = isLineRow(row) ? [roadImg.fl, roadImg.fm, roadImg.fm, roadImg.fr] : [roadImg.l, roadImg.m, roadImg.m, roadImg.r];
      for(let i = 0; i < 4; i++) if(ok(set[i])) ctx.drawImage(set[i], 0, sy, TILE, STRIP, x0 + i * TILE, y, TILE, STRIP + 0.6);
    }
  }
  // 道のわきの景色。260px ごとに左右を決める。距離から決まるので、同じ場所にはいつも同じものが出る
  function drawScenery(v, ok){
    const SLOT = 260;
    for(let s = Math.floor((v - ROAD_Y - 300) / SLOT); s * SLOT < v + ROAD_Y + 300; s++){
      const d = s * SLOT, y = screenY(d);
      let nearLine = Math.abs(d) < 400;
      for(let k = 1; k <= road.laps; k++) if(Math.abs(d - k * road.length) < 400) nearLine = true;
      [-1, 1].forEach(function(side, i){
        const h = hash(s * 2 + i), edge = roadX(d) + side * (ROAD_W / 2 + 6);
        const room = side < 0 ? edge : W - edge;              // 道の外の幅
        const cx = side < 0 ? edge / 2 : (edge + W) / 2;
        if(nearLine){                                          // スタートとゴールの近くは観客席
          const im = roadImg.tribune; if(!ok(im)) return;
          const sc = Math.min(0.55, (room - 16) / im.naturalHeight); if(sc < 0.25) return;
          const w = im.naturalWidth * sc, hh = im.naturalHeight * sc;
          ctx.save(); ctx.translate(cx, y); ctx.rotate(side < 0 ? Math.PI / 2 : -Math.PI / 2);
          ctx.drawImage(im, -w / 2, -hh / 2, w, hh); ctx.restore();
          return;
        }
        const im = h < 0.33 ? roadImg.treeL : h < 0.66 ? roadImg.treeS : h < 0.76 ? (h < 0.71 ? roadImg.tentR : roadImg.tentB) : null;
        if(!ok(im)) return;
        const size = Math.min(im.naturalWidth * 0.7, room - 16);
        if(size < 50) return;
        const jx = (hash(s * 7 + i) - 0.5) * Math.max(0, room - size - 16) * 0.6;
        ctx.drawImage(im, cx - size / 2 + jx, y - size / 2, size, size);
      });
    }
  }

  // ---------- キラキラと浮かぶ文字 ----------
  function sparks(x, y, n){
    n = n || 10;
    for(let i = 0; i < n; i++){
      const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 220;
      fx.push({kind: "spark", x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0.7 + Math.random() * 0.3, t: 0,
               size: 16 + Math.random() * 16, im: Math.random() < 0.5 ? "star" : "twinkle", rot: Math.random() * 6});
    }
  }
  function popup(s, x, y, color){ fx.push({kind: "text", s: String(s), x: x, y: y, life: 0.9, t: 0, color: color || "#ffe14d"}); }
  function updateFx(dt){
    for(let i = fx.length - 1; i >= 0; i--){
      const p = fx[i]; p.t += dt;
      if(p.kind === "spark"){ p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.rot += dt * 6; }
      else p.y -= 60 * dt;
      if(p.t >= p.life) fx.splice(i, 1);
    }
  }
  function drawFx(){
    fx.forEach(function(p){
      const a = 1 - p.t / p.life;
      if(p.kind === "spark") drawImg(ui[p.im], p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, {alpha: a, angle: p.rot});
      else { const sc = 1 + Math.max(0, 0.15 - p.t) * 3; text(p.s, p.x, p.y, {size: 30 * sc, color: p.color, align: "center", alpha: Math.min(1, a * 2)}); }
    });
  }

  // ---------- ハート・時間・点数 ----------
  function drawHud(){
    const h = hudState;
    if(!h) return;
    shadowed(function(){
      if(h.maxHearts) for(let i = 0; i < h.maxHearts; i++) drawImg(i < h.hearts ? ui.heart : ui.heartEmpty, 14 + i * 50, 12, 52, 52);
    });
    if(h.time !== undefined){
      label("TIME", W / 2, 16, "center");
      const down = lastHudTime !== null && h.time < lastHudTime;   // 減っているとき（残り時間）だけ、5秒以下で点滅する。走った時間などは点滅しない
      lastHudTime = h.time;
      const low = down && h.time <= 5 && Math.floor(time * 4) % 2;
      ctx.save(); if(low) ctx.globalAlpha = 0.45;
      shadowed(function(){ digits(Math.ceil(h.time), W / 2, 46, 46, "center"); });
      ctx.restore();
    }
    let right = W - 76;                                      // 音のボタンの左から並べる
    if(h.score !== undefined){
      shadowed(function(){
        const w = digits(h.score, right, 38, 48, "right");
        drawImg(ui.coin, right - w - 50, 14, 48, 48);
        right -= w + 62;
      });
    }
    [].concat(h.info ? (Array.isArray(h.info[0]) ? h.info : [h.info]) : []).forEach(function(it){
      const v = String(it[1]), vw = /^\d+$/.test(v) ? null : measure(v, 30);
      label(String(it[0]).toUpperCase(), right - (vw || 40) / 2 - 4, 16, "center");
      if(vw === null){ shadowed(function(){ right -= digits(+v, right, 46, 40, "right") + 18; }); }
      else { text(v, right, 46, {size: 30, align: "right"}); right -= vw + 24; }
    });
  }

  // ---------- RPG のコマンドとメッセージ ----------
  const MENU = {x: 16, w: 230, row: 44}, MSG = {x: 262, y: 404, w: 682, h: 120};
  function okPressed(){
    if(hits["Enter"] || hits[" "]){ delete hits["Enter"]; delete hits[" "]; return true; }   // ゲームの Enter と重ならないように使い切る
    return false;
  }
  function menu(items, ask){
    if(screenState) return -1;
    const key = items.join("|");
    if(key !== menuKey){ menuKey = key; menuSel = 0; }
    menuNow = {items: items, ask: ask || ""};
    const h = items.length * MENU.row + 24, top = H - 16 - h;
    if(hits["ArrowUp"]){ menuSel = (menuSel + items.length - 1) % items.length; delete hits["ArrowUp"]; if(typeof se === "function") se("move"); }
    if(hits["ArrowDown"]){ menuSel = (menuSel + 1) % items.length; delete hits["ArrowDown"]; if(typeof se === "function") se("move"); }
    if(api.click){
      const c = api.click, i = Math.floor((c.y - top - 12) / MENU.row);
      if(c.x >= MENU.x && c.x <= MENU.x + MENU.w && i >= 0 && i < items.length){ api.click = null; menuSel = i; if(typeof se === "function") se("click"); return i; }
    }
    if(okPressed()){ if(typeof se === "function") se("click"); return menuSel; }
    return -1;
  }
  function message(t){
    if(screenState) return false;
    t = String(t);
    if(t !== msgText){ msgText = t; msgShown = 0; }
    msgNow = t;
    const all = msgShown >= msgText.length;
    let ok = okPressed();
    if(!ok && api.click){ api.click = null; ok = true; }
    if(ok && !all){ msgShown = msgText.length; return false; }   // とちゅうで押したら、全部出す
    return ok && all;
  }
  function wrapLines(t, size, width){
    const out = [];
    t.split("\n").forEach(function(par){
      let line = "";
      for(const ch of par){
        if(measure(line + ch, size) > width && line){ out.push(line); line = ""; }
        line += ch;
      }
      out.push(line);
    });
    return out;
  }
  function box(x, y, w, h){
    shadowed(function(){ roundRect(x, y, w, h, 16); ctx.fillStyle = "rgba(18, 26, 64, 0.92)"; ctx.fill(); });
    ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = "#ffffff"; roundRect(x, y, w, h, 16); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.3)"; roundRect(x + 7, y + 7, w - 14, h - 14, 11); ctx.stroke(); ctx.restore();
  }
  function drawRpgBoxes(){
    if(menuNow){
      const items = menuNow.items, h = items.length * MENU.row + 24, top = H - 16 - h;
      box(MENU.x, top, MENU.w, h);
      items.forEach(function(it, i){
        const y = top + 12 + i * MENU.row + MENU.row / 2, on = i === menuSel;
        if(on){
          ctx.save(); roundRect(MENU.x + 12, y - MENU.row / 2 + 4, MENU.w - 24, MENU.row - 8, 10); ctx.fillStyle = "rgba(255, 216, 74, 0.25)"; ctx.fill();
          const bx = MENU.x + 30 + Math.sin(time * 8) * 3;                 // ▶ が少しゆれる
          ctx.beginPath(); ctx.moveTo(bx - 8, y - 9); ctx.lineTo(bx + 6, y); ctx.lineTo(bx - 8, y + 9); ctx.closePath();
          ctx.fillStyle = "#ffd84a"; ctx.fill(); ctx.restore();
        }
        text(it, MENU.x + 48, y + 1, {size: 26, color: on ? "#ffe680" : "#ffffff"});
      });
    }
    const t = menuNow ? menuNow.ask : msgNow;
    if(t !== null && t !== undefined && (menuNow || msgNow !== null)){
      const mx = menuNow ? MSG.x : 16, mw = menuNow ? MSG.w : W - 32;   // メッセージだけのときは横いっぱい
      box(mx, MSG.y, mw, MSG.h);
      const shown = menuNow ? t : msgText.slice(0, Math.floor(msgShown));
      wrapLines(shown, 26, mw - 56).slice(0, 3).forEach(function(l, i){ text(l, mx + 28, MSG.y + 34 + i * 36, {size: 26}); });
      if(!menuNow && msgShown >= msgText.length && Math.floor(time * 2.5) % 2){   // 出しきったら ▼ で「つぎへ」
        const x = mx + mw - 30, y = MSG.y + MSG.h - 24;
        ctx.save(); ctx.beginPath(); ctx.moveTo(x - 9, y - 6); ctx.lineTo(x + 9, y - 6); ctx.lineTo(x, y + 6); ctx.closePath(); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.restore();
      }
    }
  }
  // 敵のHP：バー。HPは2〜8と少ないので、1つ分ごとに区切り線を入れる。減るときは、減った分が白く残ってから縮む
  let hpBar = null;
  function enemyHp(n, max, x, top){
    const y = Math.max(24, top - 18);                                     // 敵の絵の上はしより少し上に出す
    n = Math.max(0, Math.min(max, n));
    if(!hpBar || hpBar.max !== max || n > hpBar.shown){ hpBar = {max: max, shown: n, trail: n}; }   // 新しい敵や回復は、すぐ合わせる
    hpBar.shown = n;
    hpBar.trail = Math.max(n, hpBar.trail - (1 / 60) * max * 0.9);           // 白い分を少しずつ縮める
    const iw = max > 5 ? 170 : 130, h = 18, bx = x - iw / 2, by = y - h / 2;   // 枠なし。バーだけ
    ctx.save();
    shadowed(function(){ roundRect(bx, by, iw, h, 6); ctx.fillStyle = "#2a2f4a"; ctx.fill(); });
    ctx.save(); roundRect(bx, by, iw, h, 6); ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(bx, by, iw * hpBar.trail / max, h);                 // 減った分（白）
    const r = n / max, col = r > 0.5 ? ["#7ee081", "#2fa84f"] : r > 0.25 ? ["#ffe066", "#e0a800"] : ["#ff8a8a", "#d93636"];
    const g = ctx.createLinearGradient(0, by, 0, by + h); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    ctx.fillStyle = g; ctx.fillRect(bx, by, iw * r, h);
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(bx, by + 2, iw * r, h * 0.3);                      // つや
    ctx.fillStyle = "rgba(18, 26, 64, 0.7)";
    for(let i = 1; i < max; i++) ctx.fillRect(bx + iw * i / max - 1, by, 2, h);                                  // 1つ分の区切り
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(bx - 1.5, by - 1.5, iw + 3, h + 3, 7); ctx.stroke();   // 明るい背景でも見えるように、紺のふちと白のふち
    ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; roundRect(bx, by, iw, h, 6); ctx.stroke();
    ctx.restore();
  }

  // ---------- 操作の案内 ----------
  function keycap(k, x, y){
    const w = Math.max(36, measure(k, 16) + 20), h = 34;
    ctx.save();
    roundRect(x, y + 4, w, h, 7); ctx.fillStyle = "#9aa3bf"; ctx.fill();
    roundRect(x, y, w, h, 7); ctx.fillStyle = "#f5f7fc"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; roundRect(x, y, w, h + 4, 7); ctx.stroke();
    ctx.font = fontOf(k, 16); ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(k, x + w / 2, y + h / 2 + 1);
    ctx.restore();
    return w;
  }
  function rowWidth(list){
    let w = 0;
    list.forEach(function(g){ g.slice(0, -1).forEach(function(k){ w += Math.max(36, measure(k, 16) + 20) + 5; }); w += measure(g[g.length - 1], 18) + 26; });
    return w - 26;
  }
  function drawRow(list, x, y){
    list.forEach(function(g){
      g.slice(0, -1).forEach(function(k){ x += keycap(k, x, y) + 5; });
      text(g[g.length - 1], x + 3, y + 19, {size: 18});
      x += measure(g[g.length - 1], 18) + 26;
    });
  }
  function splitKeys(list){
    return list.map(function(g){
      const out = [];
      g.slice(0, -1).forEach(function(k){ if(/^[←→↑↓]{2,4}$/.test(k)) k.split("").forEach(function(c){ out.push(c); }); else out.push(String(k).toUpperCase()); });
      return out.concat([String(g[g.length - 1]).toUpperCase()]);
    });
  }
  function drawGuide(){
    if(!guideList || screenState) return;
    ctx.save(); ctx.globalAlpha = guideT < 6 ? 1 : Math.max(0.3, 1 - (guideT - 6) * 0.7);
    drawRow(guideList, 18, H - 54);
    ctx.restore();
  }

  // ---------- 音のボタン ----------
  const SB = {x: W - 62, y: 12, w: 50, h: 50};
  function onSoundButton(p){ return typeof muted !== "undefined" && p.x >= SB.x && p.x <= SB.x + SB.w && p.y >= SB.y && p.y <= SB.y + SB.h; }
  function toggleSound(){ if(typeof muted !== "undefined") muted = !muted; }
  function drawSoundButton(){
    if(typeof muted === "undefined") return;
    shadowed(function(){
      roundRect(SB.x, SB.y, SB.w, SB.h, 12); ctx.fillStyle = "#f5f7fc"; ctx.fill();
    });
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(SB.x, SB.y, SB.w, SB.h, 12); ctx.stroke();
    const cx = SB.x + 19, cy = SB.y + 25;
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx - 9, cy - 6); ctx.lineTo(cx - 3, cy - 6); ctx.lineTo(cx + 5, cy - 13); ctx.lineTo(cx + 5, cy + 13);
    ctx.lineTo(cx - 3, cy + 6); ctx.lineTo(cx - 9, cy + 6); ctx.closePath(); ctx.fill();
    if(muted){
      ctx.strokeStyle = "#e5484d"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx + 11, cy - 7); ctx.lineTo(cx + 23, cy + 7); ctx.moveTo(cx + 23, cy - 7); ctx.lineTo(cx + 11, cy + 7); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(cx + 7, cy, 8, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 7, cy, 15, -0.9, 0.9); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- タイトル・クリア・ゲームオーバー ----------
  function drawScreen(){
    const s = screenState;
    if(!s) return;
    const kind = s.kind || "title";
    ctx.save();
    const v = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 620);
    v.addColorStop(0, "rgba(6, 10, 28, 0.25)"); v.addColorStop(1, "rgba(6, 10, 28, 0.75)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const pop = Math.min(1, screenT / 0.35), bounce = 1 + Math.sin(pop * Math.PI) * 0.18;   // 出てくるときにはずむ
    const bob = Math.sin(time * 2.5) * 5;
    let y;
    ctx.save();
    if(kind === "title"){
      ctx.translate(snap(W / 2), snap(180 + bob * 0.6)); ctx.scale(bounce, bounce);
      drawTitleFrame(s.title || "");
      ctx.restore();
      if(howOpen){ drawHowTo(s); return; }
      pressEnter("PRESS ENTER", 345);
      if(hasHowTo()) drawHowButton();
    } else {
      const over = kind === "over";
      const t = s.title || (over ? "GAME OVER" : "STAGE CLEAR!");
      ctx.translate(snap(W / 2), snap(190 + (over ? (1 - pop) * -60 : bob))); ctx.scale(over ? 1 : bounce, over ? 1 : bounce);
      bigText(t, 0, 0, 84, over ? "#ffd0d0" : "#fff8b0", over ? "#e5484d" : "#ffb52e");
      ctx.restore();
      y = 300;
      if(s.score !== undefined){
        label("SCORE", W / 2, y - 22, "center");
        shadowed(function(){
          const w = digitsWidth(s.score, 56) + 60;
          drawImg(ui.coin, W / 2 - w / 2 - 8, y, 56, 56);
          digits(s.score, W / 2 - w / 2 + 60, y + 28, 56, "left");
        });
        y += 84;
      }
      [].concat(s.lines || []).forEach(function(l){ text(l, W / 2, y, {size: 26, align: "center"}); y += 38; });
      pressEnter("PRESS ENTER");
      if(!over && Math.random() < 0.25) sparks(80 + Math.random() * (W - 160), -10, 2);
    }
  }
  function pressEnter(s, y){
    if(Math.floor(time * 2.2) % 2) return;                // 点滅
    text(s, W / 2, y || H - 70, {size: 34, align: "center", color: "#ffffff"});
  }

  // タイトルの枠。色は舞台（背景のパスの world/<舞台>/）に合わせる。形は4種類
  const THEMES = {
    nature: ["#4fd26b", "#1d6b33"], snow: ["#66c4ff", "#1c5c9a"], desert: ["#ffb340", "#94550c"],
    volcano: ["#ff6a45", "#8a2010"], fantasy: ["#b47bff", "#4c2590"], scifi: ["#3fe0e8", "#155a7a"], none: ["#ff8a3d", "#8a3a10"]
  };
  let titleStyle = "auto";
  function worldName(){
    const m = bg && bg.far ? String(bg.far).match(/world\/(\w+)\//) : null;
    return m && THEMES[m[1]] ? m[1] : "none";
  }
  function styleName(){
    if(titleStyle !== "auto") return titleStyle;
    return {nature: "sign", desert: "sign", snow: "ribbon", fantasy: "ribbon", volcano: "card", scifi: "card"}[worldName()] || "badge";
  }
  function drawTitleFrame(t){
    const size = Math.min(70, 70 * 700 / Math.max(1, measure(t, 70)));
    const tw = measure(t, size), w = Math.max(460, tw + 130), h = size * 1.9;
    const c = THEMES[worldName()], st = styleName();
    ctx.save();
    if(st === "card"){
      shadowed(function(){ roundRect(-w / 2, -h / 2, w, h, 26); ctx.fillStyle = "rgba(14, 20, 50, 0.92)"; ctx.fill(); });
      ctx.lineWidth = 5; ctx.strokeStyle = c[0]; roundRect(-w / 2, -h / 2, w, h, 26); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.35)"; roundRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 18); ctx.stroke();
      ctx.restore(); bigText(t, 0, 2, size, "#ffffff", c[0]); return;
    }
    if(st === "ribbon"){
      const tail = 64;
      [-1, 1].forEach(function(d){                              // うしろの、切れこみのあるはし
        const x0 = d * (w / 2 - 30), x1 = d * (w / 2 + tail), top = -h / 2 + 24, bot = h / 2 + 20;
        ctx.beginPath();
        ctx.moveTo(x0, top); ctx.lineTo(x1, top); ctx.lineTo(x1 - d * 28, (top + bot) / 2); ctx.lineTo(x1, bot); ctx.lineTo(x0, bot); ctx.closePath();
        ctx.fillStyle = c[1]; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
      });
      shadowed(function(){ ctx.fillStyle = c[0]; ctx.fillRect(-w / 2, -h / 2, w, h); });
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, "rgba(255,255,255,0.35)"); g.addColorStop(0.5, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.setLineDash([10, 8]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.strokeRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18);
      ctx.restore(); bigText(t, 0, 2, size, "#ffffff", "#fff2c0"); return;
    }
    if(st === "sign"){
      shadowed(function(){ roundRect(-w / 2, -h / 2, w, h, 16); ctx.fillStyle = "#c98a4b"; ctx.fill(); });
      ctx.save(); roundRect(-w / 2, -h / 2, w, h, 16); ctx.clip();
      for(let i = 0; i < 3; i++){ ctx.fillStyle = i % 2 ? "#b97a3e" : "#d39556"; ctx.fillRect(-w / 2, -h / 2 + i * h / 3, w, h / 3 + 1); }
      ctx.strokeStyle = "rgba(90, 50, 20, 0.5)"; ctx.lineWidth = 2;
      for(let i = 1; i < 3; i++){ ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + i * h / 3); ctx.lineTo(w / 2, -h / 2 + i * h / 3); ctx.stroke(); }
      ctx.restore();
      ctx.lineWidth = 5; ctx.strokeStyle = "#5a3a1c"; roundRect(-w / 2, -h / 2, w, h, 16); ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = c[0]; roundRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 10); ctx.stroke();
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(q){ ctx.beginPath(); ctx.arc(q[0] * (w / 2 - 24), q[1] * (h / 2 - 24), 5, 0, Math.PI * 2); ctx.fillStyle = "#6b4a2a"; ctx.fill(); });
      ctx.restore(); bigText(t, 0, 2, size, "#fffbe8", "#ffd27a"); return;
    }
    // badge：つやのある丸い板
    shadowed(function(){ roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = c[0]; ctx.fill(); });
    ctx.save(); roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.clip();
    ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(-w / 2, h * 0.12, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.32)"; roundRect(-w / 2 + 18, -h / 2 + 8, w - 36, h * 0.4, h * 0.2); ctx.fill();
    ctx.restore();
    ctx.lineWidth = 6; ctx.strokeStyle = "#ffffff"; roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, h / 2 + 4); ctx.stroke();
    ctx.restore(); bigText(t, 0, 2, size, "#ffffff", "#fff2c0");
  }

  // タイトルの HOW TO PLAY：ボタン（クリックか H キー）で、目的と操作のカードを開く
  const HB = {x: W / 2 - 105, y: H - 92, w: 210, h: 42};
  function hasHowTo(){ const s = screenState; return !!(s && (s.kind || "title") === "title" && (s.lines || s.keys)); }
  function drawHowButton(){
    ctx.save();                                           // タイトルより目立たないように、うすい板と細い線
    roundRect(HB.x, HB.y, HB.w, HB.h, 21); ctx.fillStyle = "rgba(10, 16, 40, 0.55)"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255, 255, 255, 0.7)"; ctx.stroke();
    ctx.beginPath(); ctx.arc(HB.x + 24, HB.y + HB.h / 2, 12, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.font = EN.replace("{s}", 15); ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("?", HB.x + 24, HB.y + HB.h / 2 + 1);
    ctx.font = EN.replace("{s}", 17); ctx.fillStyle = "#ffffff"; ctx.textAlign = "left";
    ctx.fillText("HOW TO PLAY", HB.x + 44, HB.y + HB.h / 2 + 1);
    ctx.font = EN.replace("{s}", 12); ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.textAlign = "center";
    ctx.fillText("H", HB.x + HB.w - 16, HB.y + HB.h / 2 + 1);
    ctx.restore();
  }
  function drawHowTo(s){
    const lines = [].concat(s.lines || []);
    const keysRow = s.keys ? splitKeys(s.keys) : null;
    const cw = Math.max(560, keysRow ? rowWidth(keysRow) + 80 : 0);
    const ch = 130 + lines.length * 44 + (keysRow ? 70 : 0) + 50;
    const cx = (W - cw) / 2, cy = (H - ch) / 2;
    shadowed(function(){ roundRect(cx, cy, cw, ch, 24); ctx.fillStyle = "rgba(20, 30, 70, 0.94)"; ctx.fill(); });
    ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = "#4cc3ff"; roundRect(cx, cy, cw, ch, 24); ctx.stroke(); ctx.restore();
    bigText("HOW TO PLAY", W / 2, cy + 52, 40, "#d8f3ff", "#4cc3ff");
    let y = cy + 118;
    lines.forEach(function(l){ text(l, W / 2, y, {size: 28, align: "center"}); y += 44; });
    if(keysRow){ drawRow(keysRow, (W - rowWidth(keysRow)) / 2, y - 6); y += 70; }
    text("CLICK / H TO CLOSE", W / 2, cy + ch - 30, {size: 16, align: "center", color: "#d8f3ff"});
  }

  const api = {
    W: W, H: H, click: null,
    start: start,
    img: function(n){ return images[n]; },
    draw: drawImg,
    down: function(k){ return !!keys[k]; },
    pressed: function(k){ return !!hits[k]; },
    text: text,
    hit: function(a, b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; },
    sparks: sparks, popup: popup,
    background: setBackground,
    road: setRoad, roadX: roadX, screenY: screenY, roadHalf: ROAD_HALF,
    menu: menu, message: message, enemyHp: enemyHp,
    scroll: function(x, y){ scrollX = x || 0; scrollY = y || 0; },
    hud: function(h){ hudState = h; },
    guide: function(list){ guideList = list ? splitKeys(list) : null; },
    titleStyle: function(n){ titleStyle = n || "auto"; },    // 見本用。ふだんは舞台で自動に決まる
    screen: function(s){
      if(!s || !screenState || s.kind !== screenState.kind || s.title !== screenState.title){ screenT = 0; howOpen = false; }   // 毎フレームよんでもよい
      screenState = s;
    }
  };
  return api;
})();

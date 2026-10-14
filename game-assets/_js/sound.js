// sound.js：ゲームの効果音とBGM（全ジャンル共通）
// game.html で、ゲームのスクリプトより前に読み込む
//   <script src="game-assets/_js/sound.js"></script>
//
// 使えるもの
//   startAudio()   最初にキーを押したとき、またはクリックしたときに1回よぶ
//   se("jump")     効果音。名前は click / move / turn / drop / jump / shot / hit / good / clear / over
//   updateBgm(dt)  ゲームループから毎フレームよぶ。dt は前のフレームからの秒数
//   muted          true にすると音が消える
//   bgmOn          true のあいだ BGM が流れる
//   bgmSong        BGM の曲の記号（"B"〜"L"）。場面で変えてもよい
//
// 効果音のうち click〜good の8つは game-assets/_sounds の mp3 を鳴らす（Kenney の CC0 素材）
// clear・over・BGM はオシレーターで作った音。BGM はメロディ・伴奏・低い音・ドラムの曲（B〜L の11曲）
// 曲のデータは、となりの bgm_songs.js にある（sound.js が読み込むので、game.html で読み込まなくてよい）

let audioCtx = null;
let muted = false;
let bgmOn = false;
// BGM の曲。ゲームが bgmSong に曲の記号を入れて選ぶ（場面で変えてもよい）
// B げんき・C のんびり・D ぼうけん・E ふしぎ・F ファミコン風・G きらきら・H ゆうしゃ・I まち・J うみ・K おばけやしき・L スピード
let bgmSong = "B";
let bgmPos = 0, bgmAt = -1, bgmNoise = null, bgmNow = null;
const seLast = {};

function startAudio(){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(audioCtx.state === "suspended") audioCtx.resume();
}

function beep(freq, len, type, vol, delay){
  if(!audioCtx || muted) return;
  const t = audioCtx.currentTime + (delay || 0);
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || "square";
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

// 効果音のファイル（game-assets/_sounds）。ここにない名前（clear・over）は、下の seBeep の音で鳴らす
const SE_FILES = ["click", "move", "turn", "drop", "jump", "shot", "hit", "good"];
const SE_VOLUME = 0.5;
// mp3 を鳴らせない端末では、ファイルを使わずに seBeep の音で鳴らす
const canPlayMp3 = !!(window.Audio && new Audio().canPlayType('audio/mpeg'));

function se(name){
  if(!audioCtx || muted) return;
  // 同じ瞬間に同じ音を重ねない
  const now = audioCtx.currentTime;
  if(seLast[name] !== undefined && now - seLast[name] < 0.05) return;
  seLast[name] = now;
  if(canPlayMp3 && SE_FILES.indexOf(name) >= 0){
    const a = new Audio("game-assets/_sounds/" + name + ".mp3");
    a.volume = SE_VOLUME;
    const p = a.play();
    if(p && p.catch) p.catch(function(){ seBeep(name); });   // 読めなかったときは seBeep の音
    return;
  }
  seBeep(name);
}

// オシレーターで作る音（ファイルがない音と、ファイルを鳴らせないとき）
function seBeep(name){
  if(!audioCtx || muted) return;
  if(name === "click") beep(880, 0.04, "square", 0.05);
  if(name === "move") beep(440, 0.03, "square", 0.04);
  if(name === "turn"){ beep(500, 0.04, "square", 0.05); beep(700, 0.04, "square", 0.05, 0.04); }
  if(name === "drop") beep(280, 0.07, "triangle", 0.05);
  if(name === "jump") beep(520, 0.08, "square", 0.07);
  if(name === "shot") beep(740, 0.05, "square", 0.05);
  if(name === "hit") beep(160, 0.18, "sawtooth", 0.08);
  if(name === "good"){ beep(660, 0.07, "square", 0.07); beep(880, 0.09, "square", 0.07, 0.08); }
  if(name === "clear"){ beep(523, 0.12, "square", 0.2); beep(659, 0.12, "square", 0.2, 0.13); beep(784, 0.12, "square", 0.2, 0.26); beep(1046, 0.2, "square", 0.2, 0.39); }
  if(name === "over"){ beep(392, 0.16, "sawtooth", 0.25); beep(330, 0.16, "sawtooth", 0.25, 0.17); beep(262, 0.28, "sawtooth", 0.25, 0.34); }
}

// ドラム：k＝バスドラム（ドン）、s＝スネア（タン）、h＝ハイハット（チッ）
function bgmDrum(type, t){
  if(!audioCtx || muted) return;
  if(!bgmNoise){
    bgmNoise = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
    const d = bgmNoise.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if(type === "k"){
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.16);
    return;
  }
  const n = audioCtx.createBufferSource(); n.buffer = bgmNoise;
  const f = audioCtx.createBiquadFilter(); f.type = "highpass";
  const g = audioCtx.createGain();
  const len = type === "s" ? 0.12 : 0.04;
  f.frequency.value = type === "s" ? 1200 : 7000;
  g.gain.setValueAtTime(type === "s" ? 0.12 : 0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(f); f.connect(g); g.connect(audioCtx.destination); n.start(t); n.stop(t + len + 0.01);
}

// ゲームループから毎フレームよぶ。bgmOn のあいだ、曲を先の分まで少しずつ予約して鳴らす
function updateBgm(dt){
  if(!audioCtx || !bgmOn || typeof BGM_SONGS === "undefined"){ bgmAt = -1; return; }   // 曲のデータがまだ読めていないときは待つ
  const b = BGM_SONGS[bgmSong] || BGM_SONGS.B;
  const now = audioCtx.currentTime;
  if(bgmNow !== bgmSong){ bgmNow = bgmSong; bgmPos = 0; bgmAt = -1; }   // 曲が変わったら、はじめから
  if(bgmAt < 0 || bgmAt < now - 1){ bgmAt = now + 0.05; }          // 始めたとき・長く止まっていたとき
  while(now >= bgmAt - 0.1){
    const i = bgmPos % b.mel.length, d = Math.max(0, bgmAt - now);
    const m = b.mel[i];
    if(m){ beep(m, b.ml, b.mw, b.mv, d); beep(m / 2, b.ml, b.mw, b.mv * 0.4, d); }   // 1オクターブ下を重ねる
    if(b.bass[i]) beep(b.bass[i], b.bl, b.bw, b.bv, d);
    b.comp[i].forEach(function(c){ beep(c, b.cl, b.cw, b.cv, d); });
    if(b.drum[i] !== ".") bgmDrum(b.drum[i], bgmAt);
    bgmPos++; bgmAt += b.step;
  }
}

// 曲のデータ（bgm_songs.js）を読み込む。sound.js と同じフォルダから読む
(function(){
  const me = document.currentScript;
  const tag = document.createElement("script");
  tag.src = me && me.src ? me.src.replace(/sound\.js(\?.*)?$/, "bgm_songs.js") : "game-assets/_js/bgm_songs.js";
  (document.head || document.documentElement).appendChild(tag);
})();

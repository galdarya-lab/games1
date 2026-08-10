"use strict";

const STORAGE_KEY = "oceanPlayProfileV1";
const state = {
  profile: null,
  sound: true,
  musicVolume: .28,
  currentGame: null,
  lastSpeech: "",
  match: null,
  quiz: null,
  hintTimer: null,
  busy: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const shuffle = list => [...list].sort(() => Math.random() - .5);

const els = {
  profileScreen: $("#profile-screen"), app: $("#app"), profileForm: $("#profile-form"),
  nameInput: $("#student-name"), headerName: $("#header-name"), headerAvatar: $("#header-avatar"),
  heroName: $("#hero-name"), totalCoins: $("#total-coins"), miniProgress: $("#mini-progress"),
  map: $("#treasure-map"), mapList: $("#map-game-list"), mapTitle: $("#map-title"),
  mapMessage: $("#map-message"), openTreasure: $("#open-treasure"), sound: $("#sound-toggle"), musicVolume: $("#music-volume"),
  gameTitle: $("#game-title"), gameStatus: $("#game-status"), gameStage: $("#game-stage"),
  repeatAudio: $("#repeat-audio"), modal: $("#modal"), modalContent: $("#modal-content"), toast: $("#toast")
};

const gameNames = { bubble: "Bubble Match", shark: "Shark Adventure", submarine: "Submarine Sorter" };

function defaultProfile(name, avatar) {
  return { name, avatar, sound: true, musicVolume: .28, treasureSeen: false, games: {
    bubble: { score: 0, coins: 0 }, shark: { score: 0, coins: 0 }, submarine: { score: 0, coins: 0 }
  }};
}

function save() {
  if (!state.profile) return;
  state.profile.sound = state.sound;
  state.profile.musicVolume = state.musicVolume;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.profile));
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data?.name || !data.games) return false;
    state.profile = data;
    state.sound = data.sound !== false;
    state.musicVolume = Number.isFinite(data.musicVolume) ? Math.max(0, Math.min(1, data.musicVolume)) : .28;
    return true;
  } catch { return false; }
}

function totalCoins() { return Object.values(state.profile.games).reduce((n, game) => n + game.coins, 0); }
function unlockedCount() { return Object.values(state.profile.games).filter(game => game.coins === 3).length; }
function rewardFor(score) { return score === 100 ? 3 : score >= 75 ? 2 : 1; }

function createBubbles() {
  const wrap = $("#bubble-bg");
  for (let i = 0; i < 24; i++) {
    const bubble = document.createElement("i");
    bubble.className = "bg-bubble";
    const size = 8 + Math.random() * 35;
    Object.assign(bubble.style, { left: `${Math.random() * 100}%`, width: `${size}px`, height: `${size}px`, animationDuration: `${7 + Math.random() * 10}s`, animationDelay: `${-Math.random() * 15}s` });
    wrap.append(bubble);
  }
}

function startApp() {
  els.profileScreen.classList.add("hidden");
  els.app.classList.remove("hidden");
  updateUI();
  showView("home");
}

function updateUI() {
  const { name, avatar, games } = state.profile;
  els.headerName.textContent = name;
  const safeAvatar = ["child-1","child-2","child-3","child-4"].includes(avatar) ? avatar : "child-1";
  els.headerAvatar.textContent = "";
  els.headerAvatar.dataset.avatar = safeAvatar;
  if (els.heroName) els.heroName.textContent = name;
  els.totalCoins.innerHTML = `<i class="tiny-coin"></i> ${totalCoins()}`;
  els.sound.textContent = state.sound ? "🔊" : "🔇";
  els.sound.setAttribute("aria-label", state.sound ? "Mute all sound" : "Unmute all sound");
  els.sound.classList.toggle("muted", !state.sound);
  els.musicVolume.value = Math.round(state.musicVolume * 100);
  $$(".card-coins").forEach(row => row.innerHTML = coinHTML(games[row.dataset.coins].coins));
  els.miniProgress.innerHTML = `<strong>Map:</strong>${[0,1,2].map((_, i) => `<span class="progress-piece ${i < unlockedCount() ? "open" : ""}">${i < unlockedCount() ? "✓" : "?"}</span>${i < 2 ? '<i class="progress-line"></i>' : ""}`).join("")}<strong>${unlockedCount()}/3</strong>`;
  renderMap();
}

function coinHTML(count, className = "") {
  return [0,1,2].map(i => `<span class="coin ${i < count ? "earned" : ""} ${className}">★</span>`).join("");
}

function showView(view) {
  $$(".view").forEach(item => item.classList.toggle("active", item.id === `${view}-view`));
  $$("nav button").forEach(button => button.classList.toggle("active", button.dataset.nav === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function openModal(html, locked = false) {
  els.modalContent.innerHTML = html;
  els.modal.classList.remove("hidden");
  $("#modal-close").classList.toggle("hidden", locked);
}

function closeModal() { els.modal.classList.add("hidden"); els.modalContent.innerHTML = ""; }

// ---------- Procedural audio ----------
const audioEngine = { ctx:null, master:null, music:null, sfx:null, timer:null, step:0 };

function ensureAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioEngine.ctx) {
    const ctx = new AudioContextClass();
    audioEngine.ctx = ctx;
    audioEngine.master = ctx.createGain();
    audioEngine.music = ctx.createGain();
    audioEngine.sfx = ctx.createGain();
    audioEngine.music.gain.value = state.musicVolume;
    audioEngine.sfx.gain.value = .72;
    audioEngine.master.gain.value = state.sound ? 1 : 0;
    audioEngine.music.connect(audioEngine.master);
    audioEngine.sfx.connect(audioEngine.master);
    audioEngine.master.connect(ctx.destination);
    startBackgroundMusic();
  }
  if (audioEngine.ctx.state === "suspended") audioEngine.ctx.resume().catch(()=>{});
  return audioEngine.ctx;
}

function startBackgroundMusic() {
  if (audioEngine.timer) return;
  const melody = [261.63,329.63,392,329.63,293.66,349.23,440,349.23,246.94,329.63,392,329.63];
  const playStep = () => {
    const ctx=audioEngine.ctx;if(!ctx)return;
    const now=ctx.currentTime,frequency=melody[audioEngine.step++%melody.length];
    const oscillator=ctx.createOscillator(),gain=ctx.createGain();
    oscillator.type="sine";oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.055,now+.06);gain.gain.exponentialRampToValueAtTime(.0001,now+.72);
    oscillator.connect(gain);gain.connect(audioEngine.music);oscillator.start(now);oscillator.stop(now+.75);
    if(audioEngine.step%4===1){const bass=ctx.createOscillator(),bassGain=ctx.createGain();bass.type="triangle";bass.frequency.value=frequency/2;bassGain.gain.setValueAtTime(.0001,now);bassGain.gain.exponentialRampToValueAtTime(.028,now+.08);bassGain.gain.exponentialRampToValueAtTime(.0001,now+1.4);bass.connect(bassGain);bassGain.connect(audioEngine.music);bass.start(now);bass.stop(now+1.45);}
  };
  playStep();audioEngine.timer=setInterval(playStep,760);
}

function setMasterSound(enabled) {
  state.sound=enabled;const ctx=ensureAudio();
  if(ctx)audioEngine.master.gain.setTargetAtTime(enabled?1:0,ctx.currentTime,.03);
  if(!enabled)window.speechSynthesis?.cancel();
}

function setMusicVolume(value) {
  state.musicVolume=Math.max(0,Math.min(1,value));const ctx=ensureAudio();
  if(ctx)audioEngine.music.gain.setTargetAtTime(state.musicVolume,ctx.currentTime,.05);
}

function playBubblePop(strength=1) {
  const ctx=ensureAudio();if(!ctx||!state.sound)return;const now=ctx.currentTime;
  const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type="sine";oscillator.frequency.setValueAtTime(520+Math.random()*160,now);oscillator.frequency.exponentialRampToValueAtTime(95,now+.12);gain.gain.setValueAtTime(.09*Math.min(1.5,strength),now);gain.gain.exponentialRampToValueAtTime(.0001,now+.14);oscillator.connect(gain);gain.connect(audioEngine.sfx);oscillator.start(now);oscillator.stop(now+.15);
}

function playGurgle() {
  const ctx=ensureAudio();if(!ctx||!state.sound)return;const now=ctx.currentTime;
  for(let i=0;i<3;i++){const oscillator=ctx.createOscillator(),gain=ctx.createGain(),start=now+i*.085;oscillator.type="sine";oscillator.frequency.setValueAtTime(150+i*42,start);oscillator.frequency.exponentialRampToValueAtTime(310+i*55,start+.13);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.055,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+.16);oscillator.connect(gain);gain.connect(audioEngine.sfx);oscillator.start(start);oscillator.stop(start+.18);}
}

function playWrongFishSignal() {
  const ctx=ensureAudio();if(!ctx||!state.sound)return;const now=ctx.currentTime;
  [230,165].forEach((frequency,index)=>{const oscillator=ctx.createOscillator(),gain=ctx.createGain(),start=now+index*.16;oscillator.type="triangle";oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(frequency*.82,start+.13);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.06,start+.018);gain.gain.exponentialRampToValueAtTime(.0001,start+.14);oscillator.connect(gain);gain.connect(audioEngine.sfx);oscillator.start(start);oscillator.stop(start+.15);});
}

function speak(word) {
  state.lastSpeech = word;
  if (!state.sound || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-GB";
  const britishVoice = speechSynthesis.getVoices().find(voice => /^en-GB/i.test(voice.lang));
  if (britishVoice) utterance.voice = britishVoice;
  utterance.rate = .7;
  utterance.pitch = 1.04;
  speechSynthesis.speak(utterance);
}

function renderMap() {
  if (!state.profile) return;
  const keys = ["bubble", "shark", "submarine"];
  const icons = ["REEF", "BAY", "X"];
  els.map.innerHTML = keys.map((key, i) => {
    const open = state.profile.games[key].coins === 3;
    return `<div class="map-piece ${open ? "open" : "locked"}"><span class="land">${open ? icons[i] : "?"}</span>${open ? '<i class="route"></i>' : ""}</div>`;
  }).join("");
  els.mapList.innerHTML = keys.map(key => `<div class="map-list-row"><span>${gameNames[key]}</span><span>${state.profile.games[key].coins === 3 ? "COMPLETE" : `${state.profile.games[key].coins}/3`}</span></div>`).join("");
  const done = unlockedCount() === 3;
  els.mapTitle.textContent = done ? "The map is complete!" : "Keep exploring!";
  els.mapMessage.textContent = done ? "You found the route. Open the treasure chest!" : "Earn 3 coins in each game to reveal every map piece.";
  els.openTreasure.classList.toggle("hidden", !done);
}

function showHelp(game) {
  const help = {
    bubble: ["ABC", "Match the bubbles", "Swap two bubbles next to each other. Match 3 of the same letter. A match of 4 or 5 makes a power bubble. You have 15 moves."],
    shark: ["↑ ↓", "Swim and catch a fish", "Use the Up and Down arrow keys, or W and S, to move the shark. Catch a fish, then solve its colour or number challenge. This game has no speech."],
    submarine: ["SORT", "Sort with the submarine", "Drag the submarine card to Pets, Animals, Family, or Clothes. You can also tap a category. Sort every picture and word into the right group."]
  }[game];
  openModal(`<div class="how-icon">${help[0]}</div><h2 id="modal-title">${help[1]}</h2><p>${help[2]}</p><button class="primary-btn blue" data-modal-start="${game}">Got it — play!</button>`);
}

function startGame(game) {
  ensureAudio();
  cleanupShark();
  clearTimeout(state.speechTimer);
  window.speechSynthesis?.cancel();
  closeModal();
  clearTimeout(state.hintTimer);
  state.currentGame = game;
  state.busy = false;
  els.repeatAudio.classList.add("hidden");
  els.gameTitle.textContent = gameNames[game];
  els.gameStage.dataset.game = game;
  showView("game");
  if (game === "bubble") initMatch();
  if (game === "shark") initShark();
  if (game === "submarine") initSorter();
}

function finishGame(game, score) {
  const oldCoins = state.profile.games[game].coins;
  const earned = rewardFor(score);
  const best = Math.max(state.profile.games[game].score, score);
  const bestCoins = Math.max(oldCoins, earned);
  state.profile.games[game] = { score: best, coins: bestCoins };
  const newPiece = oldCoins < 3 && bestCoins === 3;
  save(); updateUI();
  const phrase = score === 100 ? "Brilliant! You earned all three coins!" : score >= 75 ? "Great work! You earned a bonus coin!" : "Good start! Ready to try again?";
  const pieceIndex = ["bubble", "shark", "submarine"].indexOf(game);
  const piece = newPiece ? `<div class="new-map-piece"><div class="result-map-piece piece-${pieceIndex}"></div><strong>A new map piece!</strong><span>Your route to the treasure is growing.</span></div>` : "";
  openModal(`<div class="reward-burst"><i></i><span>${score === 100 ? "AMAZING" : "WELL DONE"}</span></div><h2 id="modal-title">${phrase}</h2><div class="result-score">${score}%</div><div class="result-coins">${coinHTML(earned)}</div><p>Best score: <strong>${best}%</strong></p>${piece}<div class="result-actions"><button class="primary-btn" data-replay="${game}">↻ Play again</button><button class="primary-btn blue" data-result-home>Home</button></div>`, true);
  if (newPiece && unlockedCount() === 3) setTimeout(showTreasure, 900);
}

function showTreasure() {
  state.profile.treasureSeen = true; save();
  openModal(`<div class="treasure-scene"><div class="illustrated-chest"><i></i></div><h2 id="modal-title">Treasure found!</h2><p><strong>${state.profile.name}</strong>, you completed the map and became a true English explorer!</p><div class="captain-badge">SEA CAPTAIN</div><button class="primary-btn blue" data-result-home>Keep playing</button></div>`, true);
  for (let i = 0; i < 30; i++) setTimeout(() => {
    const bit = document.createElement("i"); bit.className = `confetti treasure-particle p${i%3}`; bit.textContent = "";
    bit.style.left = `${10 + Math.random() * 80}vw`; bit.style.top = "-40px"; bit.style.setProperty("--x", `${-120 + Math.random() * 240}px`);
    document.body.append(bit); setTimeout(() => bit.remove(), 2400);
  }, i * 55);
}

// ---------- Bubble Match ----------
const ROWS = 7, COLS = 7, LETTERS = ["A","B","C","D","E","F"];
const idx = (r,c) => r * COLS + c;
const rc = index => [Math.floor(index / COLS), index % COLS];
const adjacent = (a,b) => { const [ar,ac]=rc(a), [br,bc]=rc(b); return Math.abs(ar-br)+Math.abs(ac-bc)===1; };

function randomTile() { return { letter: LETTERS[Math.floor(Math.random()*LETTERS.length)], bonus: null }; }
function boardMatches(board) {
  const groups = [];
  for (let r=0;r<ROWS;r++) { let start=0; for(let c=1;c<=COLS;c++) if(c===COLS || board[idx(r,c)]?.letter!==board[idx(r,start)]?.letter){if(c-start>=3)groups.push(Array.from({length:c-start},(_,n)=>idx(r,start+n)));start=c;} }
  for (let c=0;c<COLS;c++) { let start=0; for(let r=1;r<=ROWS;r++) if(r===ROWS || board[idx(r,c)]?.letter!==board[idx(start,c)]?.letter){if(r-start>=3)groups.push(Array.from({length:r-start},(_,n)=>idx(start+n,c)));start=r;} }
  return groups;
}
function possibleMove(board) {
  for(let i=0;i<board.length;i++) for(const j of [i+1,i+COLS]) if(j<board.length && adjacent(i,j)) { [board[i],board[j]]=[board[j],board[i]]; const ok=boardMatches(board).length; [board[i],board[j]]=[board[j],board[i]]; if(ok)return [i,j]; }
  return null;
}
function freshBoard() {
  let board;
  do {
    board = Array.from({length:ROWS*COLS}, randomTile);
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
      const used=[]; if(c>=2 && board[idx(r,c-1)].letter===board[idx(r,c-2)].letter)used.push(board[idx(r,c-1)].letter); if(r>=2&&board[idx(r-1,c)].letter===board[idx(r-2,c)].letter)used.push(board[idx(r-1,c)].letter);
      while(used.includes(board[idx(r,c)].letter))board[idx(r,c)]=randomTile();
    }
  } while(!possibleMove(board));
  return board;
}

function initMatch() {
  state.match = { board:freshBoard(), selected:null, moves:15, collected:0, goal:30 };
  els.gameStatus.textContent = "Moves: 15";
  els.gameStage.innerHTML = `<div class="match-wrap"><div id="match-board" class="match-board" aria-label="Letter matching board"></div><aside class="match-side"><div class="mission-card"><span>Mission</span><div class="mission-letter">A B C</div><p>Pop <strong>30</strong> bubbles</p><div class="big-count"><span id="match-count">0</span> / 30</div><div class="meter"><i id="match-meter"></i></div></div><div><div class="move-count">🫧 Moves left: <span id="moves-count">15</span></div><p class="match-tip">Select two bubbles next to each other. A hint appears after 5 seconds.</p></div></aside></div>`;
  renderMatch(); resetHint();
}

function renderMatch() {
  const boardEl = $("#match-board"); if(!boardEl)return;
  boardEl.innerHTML = state.match.board.map((tile,i)=>`<button class="tile ${tile.bonus||""} ${state.match.selected===i?"selected":""}" data-i="${i}" data-letter="${tile.letter}" aria-label="Letter ${tile.letter}">${tile.bonus==="rainbow"?"★":tile.letter}</button>`).join("");
  $$(".tile",boardEl).forEach(button=>button.addEventListener("click",()=>selectTile(+button.dataset.i)));
  $("#moves-count").textContent=state.match.moves; $("#match-count").textContent=state.match.collected; $("#match-meter").style.width=`${Math.min(100,state.match.collected/state.match.goal*100)}%`; els.gameStatus.textContent=`Moves: ${state.match.moves}`;
}

async function selectTile(i) {
  if(state.busy)return; resetHint();
  const selected=state.match.selected;
  if(selected===null){state.match.selected=i;renderMatch();return;}
  if(selected===i){state.match.selected=null;renderMatch();return;}
  if(!adjacent(selected,i)){state.match.selected=i;renderMatch();return;}
  const board=state.match.board;
  if(board[selected].bonus==="rainbow" || board[i].bonus==="rainbow") {
    const rainbow=board[selected].bonus==="rainbow"?selected:i, target=rainbow===selected?i:selected;
    state.match.selected=null; state.match.moves--; await clearIndices(board.map((t,k)=>t.letter===board[target].letter||k===rainbow?k:null).filter(k=>k!==null), board[target].letter); return;
  }
  [board[selected],board[i]]=[board[i],board[selected]];
  const groups=boardMatches(board);
  if(!groups.length){[board[selected],board[i]]=[board[i],board[selected]];state.match.selected=null;renderMatch();showToast("Try another move 🫧");return;}
  state.match.selected=null;state.match.moves--;await resolveMatches(i);
}

async function resolveMatches(movedIndex) {
  state.busy=true;
  let cascade=0;
  while(true){
    const groups=boardMatches(state.match.board); if(!groups.length)break;
    cascade++;
    const remove=new Set(groups.flat());
    for(const pos of [...remove]){const tile=state.match.board[pos];if(tile?.bonus==="bonus-row"){const [r]=rc(pos);for(let c=0;c<COLS;c++)remove.add(idx(r,c));}if(tile?.bonus==="bonus-col"){const [,c]=rc(pos);for(let r=0;r<ROWS;r++)remove.add(idx(r,c));}}
    let bonus=null; const longest=groups.sort((a,b)=>b.length-a.length)[0];
    if(longest.length>=5)bonus={pos:remove.has(movedIndex)?movedIndex:longest[2],type:"rainbow",letter:state.match.board[longest[0]].letter};
    else if(longest.length===4){const horizontal=rc(longest[0])[0]===rc(longest[1])[0];bonus={pos:remove.has(movedIndex)?movedIndex:longest[1],type:horizontal?"bonus-row":"bonus-col",letter:state.match.board[longest[0]].letter};}
    if(bonus)remove.delete(bonus.pos);
    const letter=state.match.board[longest[0]]?.letter||"A";
    await clearIndices([...remove],letter,bonus);
  }
  state.busy=false;
  if(state.match.moves<=0 || state.match.collected>=state.match.goal){clearTimeout(state.hintTimer);const score=Math.min(100,Math.round(state.match.collected/state.match.goal*100));setTimeout(()=>finishGame("bubble",score),450);return;}
  if(!possibleMove(state.match.board)){showToast("Shuffling the bubbles! ✨");await wait(400);state.match.board=freshBoard();renderMatch();}
  if(cascade>1)showToast(cascade>2?"Amazing! 🌟":"Super! ✨"); resetHint();
}

async function clearIndices(indices, letter, bonus=null) {
  state.busy=true; speak(letter);
  for(let n=0;n<Math.min(5,Math.max(1,indices.length));n++)setTimeout(()=>playBubblePop(.75+n*.08),n*42);
  indices.forEach(i=>$( `.tile[data-i="${i}"]`)?.classList.add("pop")); await wait(280);
  state.match.collected+=indices.length;
  const removeSet=new Set(indices);
  for(let c=0;c<COLS;c++){
    const kept=[];for(let r=ROWS-1;r>=0;r--){const i=idx(r,c);if(!removeSet.has(i))kept.push(state.match.board[i]);}
    while(kept.length<ROWS)kept.push(randomTile());
    for(let r=ROWS-1,n=0;r>=0;r--,n++)state.match.board[idx(r,c)]=kept[n];
  }
  if(bonus){const [r,c]=rc(bonus.pos);state.match.board[idx(r,c)]={letter:bonus.letter,bonus:bonus.type};showToast(bonus.type==="rainbow"?"Rainbow bubble! 🌈":"Power bubble! ⚡");}
  renderMatch();await wait(240);
  if(arguments.length<3){await resolveMatches(-1);}
}

function resetHint(){clearTimeout(state.hintTimer);$$('.tile.hint').forEach(x=>x.classList.remove('hint'));if(state.currentGame!=="bubble"||state.busy)return;state.hintTimer=setTimeout(()=>{const move=possibleMove(state.match.board);if(move){move.forEach(i=>$( `.tile[data-i="${i}"]`)?.classList.add("hint"));showToast("Here is a good move! 👆");}else{state.match.board=freshBoard();renderMatch();showToast("Bubbles shuffled! ✨");resetHint();}},5000);}

// ---------- Shark Adventure ----------
const colorData = [
  {word:"red",color:"#ed4862",fish:"red"},{word:"blue",color:"#278edb",fish:"blue"},{word:"green",color:"#4eb849",fish:"green"},
  {word:"yellow",color:"#f3bd23",fish:"yellow"},{word:"orange",color:"#f08a28",fish:"orange"},{word:"purple",color:"#9355cc",fish:"purple"}
];
const numberData = ["one","two","three","four","five","six","seven","eight","nine","ten"];

function buildSharkQuestions(){
  const questions=[];
  for(let i=0;i<5;i++){
    const correct=colorData[i], options=shuffle([correct,...shuffle(colorData.filter(x=>x!==correct)).slice(0,2)]);
    questions.push({type:"colour", display:`Choose ${correct.word}`, answer:correct.word, options:options.map(x=>({label:x.word,value:x.word,color:x.color}))});
  }
  for(let i=0;i<5;i++){
    const n=i+1, word=numberData[i], nums=shuffle([n,...shuffle([1,2,3,4,5].filter(x=>x!==n)).slice(0,2)]);
    questions.push({type:"number", display:`Which number is ${word}?`, answer:String(n), options:nums.map(x=>({label:String(x),value:String(x)}))});
  }
  return shuffle(questions);
}

function initShark(){
  cleanupShark();
  state.quiz={index:0,correct:0,firstTry:true,questions:buildSharkQuestions()};
  state.shark={y:130,keys:{up:false,down:false},paused:false,last:0,frame:0,fishes:[]};
  els.repeatAudio.classList.add("hidden");
  els.gameStatus.textContent="Fish 1 / 10";
  els.gameStage.innerHTML=`<div id="shark-arcade" class="shark-arcade" tabindex="0" aria-label="Shark swimming game. Use Up and Down arrow keys.">
    <div class="arcade-hud"><strong>Catch the fish with the star!</strong><span>↑ ↓ or W S</span></div>
    <div class="arcade-bubbles"></div><div class="arcade-seabed"></div>
    <div id="player-shark" class="player-shark"><img class="idle-state" src="assets/generated/shark-idle.png" alt="Friendly cartoon shark"><img class="eat-state" src="assets/generated/shark-eat.png" alt=""></div>
    <div id="fish-school" class="fish-school" aria-hidden="true"></div>
    <div class="key-help"><kbd>↑</kbd><kbd>↓</kbd><span>Swim up and down</span></div>
  </div>`;
  const field=$("#shark-arcade");
  const target=Math.floor(Math.random()*4);
  state.shark.fishes=Array.from({length:4},(_,i)=>({id:i,x:field.clientWidth*(.5+i*.18),y:70+(i%3)*(field.clientHeight-190)/2,speed:.15+i*.018,target:i===target,kind:(i+state.quiz.index)%6}));
  $("#fish-school").innerHTML=state.shark.fishes.map(f=>`<div id="arcade-fish-${f.id}" class="arcade-fish fish-${f.kind} ${f.target?"target-fish":""}"></div>`).join("");
  field.focus();
  state.shark.keyDown=event=>{if(["ArrowUp","ArrowDown","KeyW","KeyS"].includes(event.code))event.preventDefault();if(event.code==="ArrowUp"||event.code==="KeyW")state.shark.keys.up=true;if(event.code==="ArrowDown"||event.code==="KeyS")state.shark.keys.down=true;};
  state.shark.keyUp=event=>{if(event.code==="ArrowUp"||event.code==="KeyW")state.shark.keys.up=false;if(event.code==="ArrowDown"||event.code==="KeyS")state.shark.keys.down=false;};
  window.addEventListener("keydown",state.shark.keyDown);window.addEventListener("keyup",state.shark.keyUp);
  state.shark.frame=requestAnimationFrame(sharkLoop);
}

function sharkLoop(time){
  const s=state.shark, field=$("#shark-arcade"), shark=$("#player-shark");
  if(!s||!field||state.currentGame!=="shark")return;
  const dt=Math.min(32,time-(s.last||time));s.last=time;
  if(!s.paused){
    const direction=(s.keys.down?1:0)-(s.keys.up?1:0);
    s.y=Math.max(20,Math.min(field.clientHeight-190,s.y+direction*.34*dt));
    shark.style.transform=`translateY(${s.y}px) rotate(${direction*4}deg)`;
    for(const f of s.fishes){
      f.x-=f.speed*dt; if(f.x < -150){f.x=field.clientWidth+80+Math.random()*220;f.y=55+Math.random()*(field.clientHeight-175);}
      const fish=$(`#arcade-fish-${f.id}`);if(fish)fish.style.transform=`translate(${f.x}px,${f.y}px)`;
      if(f.x<285&&f.x>115&&Math.abs((s.y+90)-(f.y+50))<82){
        if(f.target)openSharkTask(f.id);else{f.x=field.clientWidth+120;f.y=55+Math.random()*(field.clientHeight-175);playWrongFishSignal();showToast("Look for the fish with the star!");}
      }
    }
  }
  s.frame=requestAnimationFrame(sharkLoop);
}

function openSharkTask(fishId){
  const s=state.shark,q=state.quiz.questions[state.quiz.index];if(!s||s.paused)return;s.paused=true;
  playGurgle();
  const field=$("#shark-arcade"), fish=$(`#arcade-fish-${fishId}`);fish?.classList.add("caught");
  const answers=q.options.map(o=>q.type==="colour"?`<button class="colour-swatch" style="--swatch:${o.color}" data-shark-answer="${o.value}" aria-label="${o.label}"></button>`:`<button data-shark-answer="${o.value}">${o.label}</button>`).join("");
  field.insertAdjacentHTML("beforeend",`<div class="fish-task" role="dialog" aria-label="Fish challenge"><small>Fish challenge ${state.quiz.index+1} of 10</small><h2>${q.display}</h2><div class="fish-task-options">${answers}</div><p>${q.type==="colour"?"Choose the correct colour square.":"Choose the correct number."}</p></div>`);
  $$("[data-shark-answer]",field).forEach(button=>button.addEventListener("click",()=>answerShark(button)));
}

async function answerShark(button){
  if(state.busy)return;const q=state.quiz.questions[state.quiz.index];
  if(button.dataset.sharkAnswer!==q.answer){state.quiz.firstTry=false;button.classList.add("wrong");showToast("Try again — look carefully!");return;}
  state.busy=true;if(state.quiz.firstTry)state.quiz.correct++;button.classList.add("correct");$("#player-shark")?.classList.add("eating");playGurgle();showToast("Great catch! ⭐");await wait(700);
  state.quiz.index++;state.quiz.firstTry=true;state.busy=false;
  if(state.quiz.index>=10){cleanupShark();finishGame("shark",state.quiz.correct*10);return;}
  $(".fish-task")?.remove();$("#player-shark")?.classList.remove("eating");
  const field=$("#shark-arcade"),target=Math.floor(Math.random()*4);state.shark.fishes.forEach((f,i)=>{f.x=field.clientWidth*(.55+i*.2);f.y=55+Math.random()*(field.clientHeight-175);f.target=i===target;f.kind=(i+state.quiz.index)%6;});
  $("#fish-school").innerHTML=state.shark.fishes.map(f=>`<div id="arcade-fish-${f.id}" class="arcade-fish fish-${f.kind} ${f.target?"target-fish":""}"></div>`).join("");
  state.shark.paused=false;els.gameStatus.textContent=`Fish ${state.quiz.index+1} / 10`;
}

function cleanupShark(){
  if(!state.shark)return;cancelAnimationFrame(state.shark.frame);window.removeEventListener("keydown",state.shark.keyDown);window.removeEventListener("keyup",state.shark.keyUp);state.shark=null;
}

// ---------- Submarine Sorter ----------
const sorterGroups = {
  pets:["cat","dog","horse","fish","pig","rat","bird"],
  animals:["hippo","lion","tiger","crocodile","elephant"],
  family:["mother","father","brother","sister"],
  clothes:["hat","trousers","jeans","skirt","shirt","shoes"]
};
const sorterItems = Object.entries(sorterGroups).flatMap(([category,words])=>words.map(word=>({word,category,image:`assets/generated/sorter-${word}.png`})));
const sorterLabels = {pets:["Pets","🐾"],animals:["Animals","🌿"],family:["Family","⌂"],clothes:["Clothes","◆"]};

function initSorter(){
  clearTimeout(state.speechTimer);window.speechSynthesis?.cancel();els.repeatAudio.classList.add("hidden");
  state.sorter={items:shuffle(sorterItems),index:0,correct:0,firstTry:true,counts:{pets:0,animals:0,family:0,clothes:0}};
  renderSorterRound();
}

function renderSorterRound(){
  const sorter=state.sorter,item=sorter.items[sorter.index];els.gameStatus.textContent=`Word ${sorter.index+1} / ${sorter.items.length}`;
  const docks=Object.entries(sorterLabels).map(([key,[label,icon]])=>`<button class="sorter-dock dock-${key}" data-sort-category="${key}"><span>${icon}</span><strong>${label}</strong><small>${sorter.counts[key]} sorted</small></button>`).join("");
  els.gameStage.innerHTML=`<div class="sorter-game"><div class="sorter-heading"><p class="eyebrow">Submarine delivery</p><h2>Where does this word belong?</h2></div><div class="sorter-docks">${docks}</div><div class="sorter-water"><div id="sorter-transport" class="sorter-transport" draggable="true" tabindex="0" aria-label="Drag ${item.word} to its category"><div class="sorter-word-card"><img src="${item.image}" alt="${item.word}" draggable="false"><strong>${item.word}</strong></div><img class="sorter-submarine" src="assets/generated/submarine.png" alt="Friendly submarine" draggable="false"></div><p class="sorter-tip">Drag the submarine to a group — or tap a group.</p></div></div>`;
  const transport=$("#sorter-transport");
  transport.addEventListener("dragstart",event=>{event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",item.word);transport.classList.add("dragging");});
  transport.addEventListener("dragend",()=>transport.classList.remove("dragging"));
  $$(".sorter-dock").forEach(dock=>{dock.addEventListener("dragover",event=>{event.preventDefault();event.dataTransfer.dropEffect="move";dock.classList.add("drag-over");});dock.addEventListener("dragleave",()=>dock.classList.remove("drag-over"));dock.addEventListener("drop",event=>{event.preventDefault();dock.classList.remove("drag-over");answerSorter(dock.dataset.sortCategory,dock);});dock.addEventListener("click",()=>answerSorter(dock.dataset.sortCategory,dock));});
}

async function answerSorter(category,dock){
  if(state.busy)return;const sorter=state.sorter,item=sorter.items[sorter.index],transport=$("#sorter-transport");
  if(category!==item.category){sorter.firstTry=false;dock.classList.add("wrong");transport.classList.add("wrong");showToast(`Try another group for ${item.word}.`);setTimeout(()=>{dock.classList.remove("wrong");transport.classList.remove("wrong");},650);return;}
  state.busy=true;if(sorter.firstTry)sorter.correct++;sorter.counts[category]++;dock.classList.add("correct");
  const from=transport.getBoundingClientRect(),to=dock.getBoundingClientRect();const dx=to.left+to.width/2-(from.left+from.width/2),dy=to.top+to.height/2-(from.top+from.height/2);transport.classList.add("delivering");transport.style.transform=`translate(${dx}px,${dy}px) scale(.48)`;showToast(`${item.word} goes in ${sorterLabels[category][0]}! ⭐`);await wait(780);
  sorter.index++;sorter.firstTry=true;state.busy=false;
  if(sorter.index>=sorter.items.length){const score=Math.round(sorter.correct/sorter.items.length*100);finishGame("submarine",score);}else renderSorterRound();
}

// ---------- Events ----------
els.profileForm.addEventListener("submit", event => { event.preventDefault(); const name=els.nameInput.value.trim().replace(/[<>]/g,"");if(!name){showToast("Please enter your name 😊");return;}const avatar=$("input[name=avatar]:checked").value;state.profile=defaultProfile(name,avatar);state.sound=true;state.musicVolume=.28;ensureAudio();save();startApp(); });
$$('[data-nav]').forEach(button=>button.addEventListener('click',()=>{clearTimeout(state.hintTimer);clearTimeout(state.speechTimer);window.speechSynthesis?.cancel();cleanupShark();state.currentGame=null;showView(button.dataset.nav);updateUI();}));
$$('[data-start]').forEach(button=>button.addEventListener('click',()=>startGame(button.dataset.start)));
$$('[data-help]').forEach(button=>button.addEventListener('click',()=>showHelp(button.dataset.help)));
$("#exit-game").addEventListener("click",()=>{clearTimeout(state.hintTimer);clearTimeout(state.speechTimer);cleanupShark();state.currentGame=null;window.speechSynthesis?.cancel();showView("home");});
$("#modal-close").addEventListener("click",closeModal);
els.modal.addEventListener("click",event=>{if(event.target===els.modal&&!$("#modal-close").classList.contains("hidden"))closeModal();});
els.modalContent.addEventListener("click",event=>{const start=event.target.closest('[data-modal-start]'),replay=event.target.closest('[data-replay]'),home=event.target.closest('[data-result-home]');if(start)startGame(start.dataset.modalStart);if(replay)startGame(replay.dataset.replay);if(home){closeModal();state.currentGame=null;showView("home");updateUI();}});
els.repeatAudio.addEventListener("click",()=>state.lastSpeech&&speak(state.lastSpeech));
els.sound.addEventListener("click",()=>{setMasterSound(!state.sound);save();updateUI();showToast(state.sound?"Sound on 🔊":"All sound muted 🔇");});
els.musicVolume.addEventListener("input",()=>{setMusicVolume(+els.musicVolume.value/100);save();});
$("#profile-button").addEventListener("click",()=>{const avatar=["child-1","child-2","child-3","child-4"].includes(state.profile.avatar)?state.profile.avatar:"child-1";openModal(`<div class="profile-modal-avatar avatar-portrait" data-avatar="${avatar}"></div><h2 id="modal-title">${state.profile.name}</h2><p>Total coins: <strong>${totalCoins()}</strong><br>Map pieces: <strong>${unlockedCount()} / 3</strong></p><button id="reset-profile" class="help-btn">Reset profile</button>`)});
els.modalContent.addEventListener("click",event=>{if(event.target.id==="reset-profile"&&confirm("Delete this profile and all progress?")){localStorage.removeItem(STORAGE_KEY);location.reload();}});
els.openTreasure.addEventListener("click",showTreasure);
document.addEventListener("pointerdown",()=>{if(state.profile)ensureAudio();},{once:true});

createBubbles();
if(load()) startApp();

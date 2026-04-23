console.log('V2')
const Audio = (() => {
  let ctx;
  const debugSounds = {
    1: { type: 'square', attack: 0.02, release: 0.05, freq: 500 },
    2: { type: 'triangle', attack: 0.02, release: 0.05, freq: 500 },
    3: { type: 'sine', attack: 0.02, release: 0.05, freq: 500 },
    4: { type: 'sawtooth', attack: 0.02, release: 0.05, freq: 500 },
    5: { type: 'triangle', attack: 0.08, release: 0.12, freq: 500 },
    6: { type: 'sine', attack: 0.08, release: 0.12, freq: 500 },
    7: { type: 'triangle', attack: 0.005, release: 0.2, freq: 600 },
    8: { type: 'sine', attack: 0.15, release: 0.2, freq: 600 },
  };

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function beep(freq=880, dur=0.7, options={}){
    const c = ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = options.type ?? 'square';
    o.frequency.value = freq;
    const now = c.currentTime;
    const attack = Math.min(options.attack ?? 0.02, dur * 0.5);
    const release = Math.min(options.release ?? 0.05, Math.max(0.01, dur * 0.8));
    const releaseStart = Math.max(now + attack, now + dur - release);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + attack);
    g.gain.setValueAtTime(1, releaseStart);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(now + dur + 0.02);
  }
  function debugBeep(id, dur=0.7) {
    const sound = debugSounds[id];
    if (!sound) return;
    beep(sound.freq, dur, sound);
  }
  function presetBeep(id, dur=0.7) {
    debugBeep(String(id), dur);
  }
  return { beep, debugBeep, presetBeep };
})();

const onInput  = document.getElementById('onSec');
const offInput = document.getElementById('offSec');
const repsInput = document.getElementById('reps');
const btnToggle = document.getElementById('btnToggle');
const dialOn = document.getElementById('dialOn');
const dialOff = document.getElementById('dialOff');
const dialReps = document.getElementById('dialReps');
const stepButtons = [
  { button: document.getElementById('onDown'), input: onInput, delta: -1 },
  { button: document.getElementById('onUp'), input: onInput, delta: 1 },
  { button: document.getElementById('offDown'), input: offInput, delta: -1 },
  { button: document.getElementById('offUp'), input: offInput, delta: 1 },
  { button: document.getElementById('repsDown'), input: repsInput, delta: -1 },
  { button: document.getElementById('repsUp'), input: repsInput, delta: 1 },
];

let running = false;
let phase = 'idle';
let switchDeadline = null;
let pendingTimeout = null;
let count = 0;
let repsTarget = 5;
let preStartTimers = [];
let animationFrame = null;

function sec(v){ return Math.max(1, Math.floor(Number(v)||8)); }

function saveDurations(){
  localStorage.setItem('chime_on', sec(onInput.value));
  localStorage.setItem('chime_off', sec(offInput.value));
  localStorage.setItem('chime_reps', getReps());
}
function loadDurations(){
  const on = parseInt(localStorage.getItem('chime_on'), 10);
  const off = parseInt(localStorage.getItem('chime_off'), 10);
  const reps = parseInt(localStorage.getItem('chime_reps'), 10);
  if(!isNaN(on)) onInput.value = on;
  if(!isNaN(off)) offInput.value = off;
  if(!isNaN(reps)) repsInput.value = Math.max(1, reps);
}

function getReps(){
  return Math.max(1, Math.floor(Number(repsInput.value) || 5));
}

function syncToggleButton() {
  btnToggle.textContent = running ? 'Stop' : 'Start';
  btnToggle.classList.toggle('start', !running);
  btnToggle.classList.toggle('stop', running);
}

function setDialProgress(el, progress){
  el.style.setProperty('--progress', progress);
}

function updateDialVisuals(){
  if (!running) {
    setDialProgress(dialOn, 1);
    setDialProgress(dialOff, 1);
    setDialProgress(dialReps, 1);
    return;
  }

  if (phase === 'idle' || switchDeadline == null) {
    setDialProgress(dialOn, 1);
    setDialProgress(dialOff, 1);
    setDialProgress(dialReps, 1);
    return;
  }

  const onDuration = sec(onInput.value) * 1000;
  const offDuration = sec(offInput.value) * 1000;
  const left = Math.max(0, (switchDeadline ?? performance.now()) - performance.now());

  setDialProgress(dialOn, phase === 'on' ? left / onDuration : 0);
  setDialProgress(dialOff, phase === 'off' ? left / offDuration : 1);
  const completedRounds = phase === 'off' ? count : Math.max(0, count - 1);
  setDialProgress(dialReps, Math.max(0, 1 - (completedRounds / repsTarget)));
}

function animate(){
  updateDialVisuals();
  animationFrame = running ? requestAnimationFrame(animate) : null;
}

function startAnimation(){
  if (animationFrame != null) return;
  animationFrame = requestAnimationFrame(animate);
}

function stopAnimation(){
  if (animationFrame == null) return;
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function setPhase(newPhase){
  phase = newPhase;
  document.body.dataset.phase = phase;
  updateDialVisuals();
}

function onDeadline(){
  if (!running) return;
  if (phase === 'on') {
    if (count >= repsTarget) {
      // Final rep completed: triple stop beep, then stop.
      tripleStopBeep();
      stop();
      return;
    } else {
      doStopPhase();
    }
  } else {
    Audio.presetBeep(7);
    doStartPhase();
  }
}

function scheduleNext(){
  clearTimeout(pendingTimeout);
  const now = performance.now();
  const durMs = (phase === 'on' ? sec(onInput.value) : sec(offInput.value)) * 1000;
  switchDeadline = now + durMs;
  pendingTimeout = setTimeout(onDeadline, durMs);
}

function doStartPhase(){
  setPhase('on');
  count++;
  scheduleNext();
  updateDialVisuals();
}

function doStopPhase(){
  setPhase('off');
  Audio.presetBeep(2);
  scheduleNext();
  updateDialVisuals();
}

function start(){
  if (running) return;
  running = true;
  count = 0;
  repsTarget = getReps();
  syncToggleButton();
  startAnimation();
  // Three short pre-start beeps 600ms apart; then actually start.
  clearPreStartTimers();
  const gap = 600; // ms
  const short = 0.2; // seconds
  preStartTimers.push(setTimeout(()=>{ if(running) Audio.presetBeep(2, short); }, 0));
  preStartTimers.push(setTimeout(()=>{ if(running) Audio.presetBeep(2, short); }, gap));
  preStartTimers.push(setTimeout(()=>{ if(running) Audio.presetBeep(2, short); }, gap*2));
  preStartTimers.push(setTimeout(()=>{
    if(!running) return;
    Audio.presetBeep(7);
    clearPreStartTimers();
    doStartPhase();
  }, gap*3));
}

function stop(){
  running = false;
  syncToggleButton();
  clearTimeout(pendingTimeout); pendingTimeout = null;
  clearPreStartTimers();
  stopAnimation();
  setPhase('idle');
  updateDialVisuals();
}

btnToggle.addEventListener('click', () => {
  if (running) stop();
  else start();
});

for (const { button, input, delta } of stepButtons) {
  button.addEventListener('click', () => {
    input.value = Math.max(1, sec(input.value) + delta);
    saveDurations();
    if (!running) updateDialVisuals();
  });
}

onInput.addEventListener('input', ()=> { saveDurations(); });
offInput.addEventListener('input', ()=> { saveDurations(); });

repsInput.addEventListener('input', ()=> { saveDurations(); });

document.addEventListener('visibilitychange', () => { if (!running || switchDeadline==null) return; const rem = Math.max(0, switchDeadline - performance.now()); clearTimeout(pendingTimeout); pendingTimeout = setTimeout(onDeadline, rem); });

loadDurations();
setPhase('idle');
updateDialVisuals();
syncToggleButton();

function tripleStopBeep(){
  const gap = 800; // ms between beeps
  Audio.presetBeep(2, 0.5);
  setTimeout(()=>Audio.presetBeep(2, 0.5), gap);
  setTimeout(()=>Audio.presetBeep(2, 0.5), gap*2);
}

function clearPreStartTimers(){
  for (const t of preStartTimers) clearTimeout(t);
  preStartTimers = [];
}

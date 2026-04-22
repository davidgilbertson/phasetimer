console.log('V2')
const Audio = (() => {
  let ctx;
  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function beep(freq=880, dur=0.7){
    const c = ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    const now = c.currentTime;
    const attack = Math.min(0.02, dur * 0.25);
    const release = Math.min(0.05, Math.max(0.01, dur * 0.5));
    const releaseStart = Math.max(now + attack, now + dur - release);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + attack);
    g.gain.setValueAtTime(1, releaseStart);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(now + dur + 0.02);
  }
  return { beep };
})();

const onInput  = document.getElementById('onSec');
const offInput = document.getElementById('offSec');
const repsInput = document.getElementById('reps');
const btnStart = document.getElementById('btnStart');
const btnStop  = document.getElementById('btnStop');
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
  setDialProgress(dialReps, Math.max(0, 1 - (count / repsTarget)));
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
  Audio.beep(500);
  scheduleNext();
  updateDialVisuals();
}

function doStopPhase(){
  setPhase('off');
  Audio.beep(250);
  scheduleNext();
  updateDialVisuals();
}

function start(){
  if (running) return;
  running = true;
  count = 0;
  repsTarget = getReps();
  btnStart.disabled = true; btnStop.disabled = false;
  startAnimation();
  // Three short pre-start beeps 600ms apart; then actually start.
  clearPreStartTimers();
  const gap = 600; // ms
  const short = 0.2; // seconds
  preStartTimers.push(setTimeout(()=>{ if(running) Audio.beep(500, short); }, 0));
  preStartTimers.push(setTimeout(()=>{ if(running) Audio.beep(500, short); }, gap));
  preStartTimers.push(setTimeout(()=>{ if(running) Audio.beep(500, short); }, gap*2));
  preStartTimers.push(setTimeout(()=>{ if(!running) return; clearPreStartTimers(); doStartPhase(); }, gap*3));
}

function stop(){
  running = false;
  btnStart.disabled = false; btnStop.disabled = true;
  clearTimeout(pendingTimeout); pendingTimeout = null;
  clearPreStartTimers();
  stopAnimation();
  setPhase('idle');
  updateDialVisuals();
}

btnStart.addEventListener('click', start);
btnStop.addEventListener('click', stop);

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

function tripleStopBeep(){
  const gap = 800; // ms between beeps
  Audio.beep(250);
  setTimeout(()=>Audio.beep(250), gap);
  setTimeout(()=>Audio.beep(250), gap*2);
}

function clearPreStartTimers(){
  for (const t of preStartTimers) clearTimeout(t);
  preStartTimers = [];
}

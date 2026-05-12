// ─── DOM ─────────────────────────────────────────────────────────────────────

const viewSelect  = document.getElementById('view-select');
const viewAnalyse = document.getElementById('view-analyse');
const backBtn     = document.getElementById('back-btn');
const mvIconHdr   = document.getElementById('mv-icon-header');
const mvNameHdr   = document.getElementById('mv-name-header');

const video       = document.getElementById('video');
const canvas      = document.getElementById('canvas');
const ctx         = canvas.getContext('2d');

const feedbackBadge   = document.getElementById('feedback-badge');
const poseHint        = document.getElementById('pose-hint');

const statReps    = document.getElementById('stat-reps');
const statAngle   = document.getElementById('stat-angle');
const statAngleLbl= document.getElementById('stat-angle-label');
const statPhase   = document.getElementById('stat-phase');
const statSpeed   = document.getElementById('stat-speed');

const scoreFill   = document.getElementById('score-fill');
const scoreValue  = document.getElementById('score-value');

const corrList    = document.getElementById('corrections-list');
const startBtn    = document.getElementById('start-btn');
const resetBtn    = document.getElementById('reset-btn');

// ─── State ───────────────────────────────────────────────────────────────────

let currentMovement = null;
let camera = null;

const st = {
  running: false,
  reps: 0,
  phase: 'up',
  phaseStart: null,
  lastDuration: null,
};

// ─── Navigation ──────────────────────────────────────────────────────────────

document.querySelectorAll('.mv-card').forEach(card => {
  card.addEventListener('click', () => {
    const mv = MOVEMENTS[card.dataset.id];
    if (!mv) return;
    currentMovement = mv;
    openAnalyser(mv);
  });
});

backBtn.addEventListener('click', () => {
  stopCamera();
  resetStats();
  viewAnalyse.classList.remove('active');
  viewSelect.classList.add('active');
});

function openAnalyser(mv) {
  mvIconHdr.textContent = mv.icon;
  mvNameHdr.textContent = mv.name;
  statAngleLbl.textContent = mv.angleLabel;
  poseHint.innerHTML = mv.hint;
  viewSelect.classList.remove('active');
  viewAnalyse.classList.add('active');
}

// ─── MediaPipe ───────────────────────────────────────────────────────────────

const pose = new Pose({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
});
pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
});
pose.onResults(onResults);

function onResults(results) {
  canvas.width  = video.videoWidth  || canvas.clientWidth;
  canvas.height = video.videoHeight || canvas.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) {
    poseHint.style.display = 'block';
    return;
  }
  poseHint.style.display = 'none';

  const lm = results.poseLandmarks;

  // Draw skeleton
  drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: '#334155', lineWidth: 2 });
  drawLandmarks(ctx, lm, { color: '#3b82f6', lineWidth: 1, radius: 3 });

  if (!currentMovement) return;

  const mv = currentMovement;

  // ── Corps entier visible ? ──────────────────────────────────────────────
  const bodyOk = isFullBodyVisible(lm, mv);
  poseHint.style.display = bodyOk ? 'none' : 'block';
  poseHint.innerHTML = bodyOk
    ? mv.hint
    : '⚠ Corps non entier visible — reculez ou recadrez';

  const { primaryAngle, issues } = mv.analyse(lm, st.phase);

  // Ne compte les reps que si le corps est entier dans le cadre
  if (!mv.isIsometric) {
    if (bodyOk) {
      updatePhase(primaryAngle, mv.downAngle, mv.upAngle, issues);
    } else {
      // Affiche quand même la phase mais sans valider
      if (primaryAngle < mv.downAngle) statPhase.textContent = '▼ Bas (non compté)';
    }
  }

  statAngle.textContent = Math.round(primaryAngle) + '°';

  const score = calcScore(issues);
  updateScore(score);
  renderCorrections(issues);
  highlightJoints(lm, mv.id);
}

// ─── Phase & rep counting ─────────────────────────────────────────────────────

function updatePhase(angle, downThr, upThr, issues) {
  if (angle < downThr && st.phase !== 'down') {
    st.phase = 'down';
    st.phaseStart = performance.now();
    statPhase.textContent = '▼ Bas';
  } else if (angle > upThr && st.phase === 'down') {
    st.reps++;
    statReps.textContent = st.reps;
    if (st.phaseStart) {
      st.lastDuration = ((performance.now() - st.phaseStart) / 1000).toFixed(1);
      statSpeed.textContent = st.lastDuration + 's';
    }
    st.phase = 'up';
    statPhase.textContent = '▲ Haut';
    const hasError = issues.some(i => i.level === 'error');
    flashFeedback(hasError ? 'bad' : 'good', hasError ? `⚠ ${issues.filter(i=>i.level==='error').length} erreur(s)` : '✓ Bonne rep !');
  }
}

// ─── Score display ────────────────────────────────────────────────────────────

function updateScore(score) {
  scoreFill.style.width = score + '%';
  scoreValue.textContent = score + '%';
  if (score >= 80)      { scoreFill.style.background = 'var(--green)';  scoreValue.style.color = 'var(--green)'; }
  else if (score >= 50) { scoreFill.style.background = 'var(--yellow)'; scoreValue.style.color = 'var(--yellow)'; }
  else                  { scoreFill.style.background = 'var(--red)';    scoreValue.style.color = 'var(--red)'; }
}

// ─── Corrections list ─────────────────────────────────────────────────────────

function renderCorrections(issues) {
  if (!issues.length) return;
  corrList.innerHTML = '';
  issues.forEach(({ level, text }) => {
    const li = document.createElement('li');
    li.className = `c-${level}`;
    li.textContent = text;
    corrList.appendChild(li);
  });
}

// ─── Feedback badge ───────────────────────────────────────────────────────────

let fbTimeout = null;
function flashFeedback(type, text) {
  feedbackBadge.textContent = text;
  feedbackBadge.className = `show-${type === 'good' ? 'good' : 'bad'}`;
  clearTimeout(fbTimeout);
  fbTimeout = setTimeout(() => { feedbackBadge.className = ''; }, 2200);
}

// ─── Joint highlights ─────────────────────────────────────────────────────────

const JOINT_MAP = {
  squat:    [23,24,25,26,27,28],
  pushup:   [11,12,13,14,15,16],
  deadlift: [11,12,23,24,25,26,27,28],
  lunge:    [23,24,25,26,27,28],
  plank:    [11,12,23,24,27,28],
  ohsquat:  [23,24,25,26,27,28],
};

function highlightJoints(lm, mvId) {
  const joints = JOINT_MAP[mvId] || [];
  joints.forEach(idx => {
    const p = lm[idx];
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
  });
}

// ─── Camera ───────────────────────────────────────────────────────────────────

startBtn.addEventListener('click', async () => {
  if (!st.running) await startCamera();
  else stopCamera();
});

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 853 } },
      audio: false,
    });
    video.srcObject = stream;

    camera = new Camera(video, {
      onFrame: async () => { if (st.running) await pose.send({ image: video }); },
      width: 640, height: 853,
    });
    camera.start();

    st.running = true;
    startBtn.textContent = '⏹ Arrêter';
    startBtn.classList.add('is-stop');
    resetBtn.disabled = false;
    corrList.innerHTML = '<li class="c-info">Détection en cours…</li>';
  } catch (e) {
    alert('Impossible d\'accéder à la caméra : ' + e.message);
  }
}

function stopCamera() {
  if (camera)          { camera.stop(); camera = null; }
  if (video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  st.running = false;
  startBtn.textContent = '▶ Démarrer';
  startBtn.classList.remove('is-stop');
}

// ─── Reset ────────────────────────────────────────────────────────────────────

resetBtn.addEventListener('click', resetStats);

function resetStats() {
  Object.assign(st, { reps: 0, phase: 'up', phaseStart: null, lastDuration: null });
  statReps.textContent   = '0';
  statAngle.textContent  = '—';
  statPhase.textContent  = '—';
  statSpeed.textContent  = '—';
  scoreFill.style.width  = '0%';
  scoreValue.textContent = '—';
  corrList.innerHTML = '<li class="c-muted">Démarrez la caméra pour commencer l\'analyse.</li>';
}

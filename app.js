// ─── Helpers ────────────────────────────────────────────────────────────────

function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (mag === 0) return 0;
  return Math.acos(Math.min(Math.max(dot / mag, -1), 1)) * (180 / Math.PI);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  movement: 'squat',
  reps: 0,
  phase: 'up',        // 'up' | 'down'
  phaseStartTime: null,
  lastRepDuration: null,
  running: false,
  poseDetected: false,
};

// ─── DOM ─────────────────────────────────────────────────────────────────────

const video     = document.getElementById('video');
const canvas    = document.getElementById('canvas');
const ctx       = canvas.getContext('2d');
const startBtn  = document.getElementById('start-btn');
const resetBtn  = document.getElementById('reset-btn');
const repCount  = document.getElementById('rep-count');
const kneeAngle = document.getElementById('knee-angle');
const phaseLabel = document.getElementById('phase-label');
const repSpeed  = document.getElementById('rep-speed');
const issuesList = document.getElementById('issues-list');
const feedbackBadge = document.getElementById('feedback-badge');
const cameraHint = document.getElementById('camera-hint');

// ─── Movement selector ───────────────────────────────────────────────────────

document.querySelectorAll('.mv-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mv-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.movement = btn.dataset.movement;
    resetStats();
  });
});

// ─── Squat analyser ──────────────────────────────────────────────────────────

function analyseSquat(lm) {
  // MediaPipe landmarks indices
  // 23=left_hip 25=left_knee 27=left_ankle
  // 24=right_hip 26=right_knee 28=right_ankle
  // 11=left_shoulder 12=right_shoulder
  // 29=left_heel 30=right_heel 31=left_foot 32=right_foot

  const issues = [];
  const side = detectSide(lm); // 'left' | 'right' | 'front'

  let hip, knee, ankle, shoulder, heel, toe;

  if (side === 'left') {
    hip      = lm[23];
    knee     = lm[25];
    ankle    = lm[27];
    shoulder = lm[11];
    heel     = lm[29];
    toe      = lm[31];
  } else {
    hip      = lm[24];
    knee     = lm[26];
    ankle    = lm[28];
    shoulder = lm[12];
    heel     = lm[30];
    toe      = lm[32];
  }

  // Knee flexion angle (hip-knee-ankle)
  const kAngle = angleBetween(hip, knee, ankle);

  // Torso angle (vertical = 0°): shoulder vs hip
  const torsoAngle = Math.abs(
    Math.atan2(shoulder.y - hip.y, shoulder.x - hip.x) * (180 / Math.PI) + 90
  );

  // Knee-over-toe: knee x vs toe x (mirrored video — left appears right)
  const kneeOverToe = side === 'left'
    ? knee.x < toe.x   // in image coords (flipped), knee over toe when x is smaller
    : knee.x > toe.x;

  // Hip depth: hip y vs knee y (squat depth)
  const hipBelowKnee = hip.y > knee.y;

  // Phase detection
  const wasDown = state.phase === 'down';

  if (kAngle < 100) {
    if (state.phase !== 'down') {
      state.phase = 'down';
      state.phaseStartTime = performance.now();
    }
  } else if (kAngle > 155) {
    if (state.phase === 'down') {
      // Completed a rep
      state.reps++;
      repCount.textContent = state.reps;
      if (state.phaseStartTime) {
        state.lastRepDuration = ((performance.now() - state.phaseStartTime) / 1000).toFixed(1);
        repSpeed.textContent = state.lastRepDuration + 's';
      }
      state.phase = 'up';
      showFeedback(issues.length === 0 ? 'good' : 'bad',
        issues.length === 0 ? '✓ Bonne rep !' : `${issues.length} correction(s)`);
    }
  }

  phaseLabel.textContent = state.phase === 'down' ? '▼ Bas' : '▲ Haut';
  kneeAngle.textContent  = Math.round(kAngle) + '°';

  // --- Rule checks (only meaningful in bottom position) ---
  if (state.phase === 'down') {
    if (torsoAngle > 50) {
      issues.push({ level: 'warn', text: 'Dos trop penché en avant — engagez les abdos' });
    }
    if (kneeOverToe) {
      issues.push({ level: 'error', text: 'Genou dépasse les orteils — reculez les fesses' });
    }
    if (!hipBelowKnee && kAngle < 120) {
      issues.push({ level: 'warn', text: 'Profondeur insuffisante — descendez plus bas' });
    }
    if (issues.length === 0) {
      issues.push({ level: 'ok', text: 'Bonne position basse ✓' });
    }
  }

  return { kAngle, issues };
}

// ─── Push-up analyser ────────────────────────────────────────────────────────

function analysePushup(lm) {
  const issues = [];

  const lShoulder = lm[11];
  const lElbow    = lm[13];
  const lWrist    = lm[15];
  const rShoulder = lm[12];
  const rElbow    = lm[14];
  const rWrist    = lm[16];
  const lHip      = lm[23];
  const rHip      = lm[24];
  const lAnkle    = lm[27];

  const side = detectSide(lm);
  let shoulder, elbow, wrist, hip, ankle;

  if (side === 'left') {
    shoulder = lShoulder; elbow = lElbow; wrist = lWrist;
    hip = lHip; ankle = lm[27];
  } else {
    shoulder = rShoulder; elbow = rElbow; wrist = rWrist;
    hip = rHip; ankle = lm[28];
  }

  const eAngle = angleBetween(shoulder, elbow, wrist);

  // Hip sag
  const hipY = midpoint(lHip, rHip).y;
  const shoulderY = midpoint(lShoulder, rShoulder).y;
  const ankleY = ankle.y;
  const expectedHipY = (shoulderY + ankleY) / 2;
  const hipSag = hipY - expectedHipY;

  if (eAngle < 90) {
    if (state.phase !== 'down') {
      state.phase = 'down';
      state.phaseStartTime = performance.now();
    }
  } else if (eAngle > 155) {
    if (state.phase === 'down') {
      state.reps++;
      repCount.textContent = state.reps;
      if (state.phaseStartTime) {
        state.lastRepDuration = ((performance.now() - state.phaseStartTime) / 1000).toFixed(1);
        repSpeed.textContent = state.lastRepDuration + 's';
      }
      state.phase = 'up';
      showFeedback(issues.length === 0 ? 'good' : 'bad',
        issues.length === 0 ? '✓ Bonne rep !' : `${issues.length} correction(s)`);
    }
  }

  phaseLabel.textContent = state.phase === 'down' ? '▼ Bas' : '▲ Haut';
  kneeAngle.textContent  = Math.round(eAngle) + '°';

  if (state.phase === 'down') {
    if (hipSag > 0.05) {
      issues.push({ level: 'error', text: 'Hanches qui s\'affaissent — gainéz le core' });
    }
    if (hipSag < -0.05) {
      issues.push({ level: 'warn', text: 'Fesses trop hautes — corps doit être aligné' });
    }
    if (issues.length === 0) {
      issues.push({ level: 'ok', text: 'Gainage correct ✓' });
    }
  }

  return { kAngle: eAngle, issues };
}

// ─── Side detection ──────────────────────────────────────────────────────────

function detectSide(lm) {
  const lVis = lm[23].visibility + lm[25].visibility + lm[27].visibility;
  const rVis = lm[24].visibility + lm[26].visibility + lm[28].visibility;
  return lVis >= rVis ? 'left' : 'right';
}

// ─── Feedback badge ───────────────────────────────────────────────────────────

let feedbackTimeout = null;

function showFeedback(type, text) {
  feedbackBadge.textContent = text;
  feedbackBadge.className = `visible ${type}`;
  clearTimeout(feedbackTimeout);
  feedbackTimeout = setTimeout(() => {
    feedbackBadge.className = '';
  }, 2000);
}

// ─── Render issues ────────────────────────────────────────────────────────────

function renderIssues(issues) {
  if (issues.length === 0) return;
  issuesList.innerHTML = '';
  issues.forEach(({ level, text }) => {
    const li = document.createElement('li');
    li.className = `issue-${level}`;
    li.textContent = text;
    issuesList.appendChild(li);
  });
}

// ─── MediaPipe Pose ───────────────────────────────────────────────────────────

const pose = new Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
});

pose.onResults(onResults);

let camera = null;

function onResults(results) {
  canvas.width  = video.videoWidth  || canvas.clientWidth;
  canvas.height = video.videoHeight || canvas.clientHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) {
    state.poseDetected = false;
    cameraHint.style.display = 'block';
    return;
  }

  state.poseDetected = true;
  cameraHint.style.display = 'none';

  const lm = results.poseLandmarks;

  // Draw skeleton
  drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: '#334155', lineWidth: 2 });
  drawLandmarks(ctx, lm, { color: '#3b82f6', lineWidth: 1, radius: 4 });

  // Highlight key joints
  highlightJoints(lm);

  // Analyse
  let analysisResult;
  if (state.movement === 'squat') {
    analysisResult = analyseSquat(lm);
  } else {
    analysisResult = analysePushup(lm);
  }

  renderIssues(analysisResult.issues);
}

function highlightJoints(lm) {
  const joints = state.movement === 'squat'
    ? [23, 24, 25, 26, 27, 28]  // hips, knees, ankles
    : [11, 12, 13, 14, 15, 16]; // shoulders, elbows, wrists

  joints.forEach(idx => {
    const p = lm[idx];
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
  });
}

// ─── Camera control ───────────────────────────────────────────────────────────

startBtn.addEventListener('click', async () => {
  if (!state.running) {
    await startCamera();
  } else {
    stopCamera();
  }
});

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 853 } },
      audio: false,
    });
    video.srcObject = stream;

    camera = new Camera(video, {
      onFrame: async () => {
        if (state.running) await pose.send({ image: video });
      },
      width: 640,
      height: 853,
    });
    camera.start();

    state.running = true;
    startBtn.textContent = 'Arrêter';
    startBtn.classList.add('stop');
    resetBtn.disabled = false;
    issuesList.innerHTML = '<li class="placeholder">En attente de détection…</li>';
  } catch (err) {
    alert('Impossible d\'accéder à la caméra : ' + err.message);
  }
}

function stopCamera() {
  if (camera) { camera.stop(); camera = null; }
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.running = false;
  startBtn.textContent = 'Démarrer la caméra';
  startBtn.classList.remove('stop');
}

// ─── Reset ────────────────────────────────────────────────────────────────────

resetBtn.addEventListener('click', resetStats);

function resetStats() {
  state.reps = 0;
  state.phase = 'up';
  state.phaseStartTime = null;
  state.lastRepDuration = null;
  repCount.textContent   = '0';
  kneeAngle.textContent  = '—';
  phaseLabel.textContent = '—';
  repSpeed.textContent   = '—';
  issuesList.innerHTML = '<li class="placeholder">Démarrez pour voir les corrections.</li>';
}

// ─── Maths ────────────────────────────────────────────────────────────────────

function angle3(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (mag === 0) return 0;
  return Math.acos(Math.min(Math.max(dot / mag, -1), 1)) * (180 / Math.PI);
}

function verticalAngle(top, bottom) {
  // angle between the segment and vertical axis (0° = perfectly vertical)
  const dx = top.x - bottom.x;
  const dy = top.y - bottom.y;
  return Math.abs(Math.atan2(dx, -dy) * (180 / Math.PI));
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility, b.visibility) };
}

// Pick left/right side based on landmark visibility
function pickSide(lm, leftIdxs, rightIdxs) {
  const lv = leftIdxs.reduce((s, i) => s + (lm[i].visibility || 0), 0);
  const rv = rightIdxs.reduce((s, i) => s + (lm[i].visibility || 0), 0);
  return lv >= rv ? 'left' : 'right';
}

// ─── Result helpers ──────────────────────────────────────────────────────────

function ok(text)   { return { level: 'ok',    text }; }
function warn(text) { return { level: 'warn',  text }; }
function err(text)  { return { level: 'error', text }; }
function info(text) { return { level: 'info',  text }; }

// ─── Score: 0-100 from array of issues ───────────────────────────────────────

function calcScore(issues) {
  let s = 100;
  issues.forEach(({ level }) => {
    if (level === 'error') s -= 25;
    if (level === 'warn')  s -= 12;
  });
  return Math.max(0, Math.min(100, s));
}

// ══════════════════════════════════════════════════════════════════════════════
//  SQUAT
// ══════════════════════════════════════════════════════════════════════════════

const SQUAT = {
  id: 'squat',
  name: 'Squat',
  icon: '🦵',
  hint: 'Placez-vous de profil à ~2 m',
  angleLabel: 'Angle genou',
  // Phase thresholds
  downAngle: 110,   // knee angle below = "bottom"
  upAngle:   160,   // knee angle above = "top"

  analyse(lm, phase) {
    const side = pickSide(lm, [23,25,27], [24,26,28]);
    const hip    = side === 'left' ? lm[23] : lm[24];
    const knee   = side === 'left' ? lm[25] : lm[26];
    const ankle  = side === 'left' ? lm[27] : lm[28];
    const shoul  = side === 'left' ? lm[11] : lm[12];
    const toe    = side === 'left' ? lm[31] : lm[32];

    const kneeAng  = angle3(hip, knee, ankle);
    const torsoAng = verticalAngle(shoul, hip);   // 0° = vertical
    const kneeForward = side === 'left' ? (knee.x < toe.x) : (knee.x > toe.x); // image mirrored

    const issues = [];

    if (phase === 'down') {
      // Torso lean
      if (torsoAng > 55) issues.push(err('Dos trop penché — engagez les abdos et regardez devant'));
      else if (torsoAng > 40) issues.push(warn('Légèrement penché — essayez de garder le torse plus vertical'));
      else issues.push(ok('Torse bien vertical ✓'));

      // Knee over toe
      if (kneeForward) issues.push(err('Genou dépasse les orteils — reculez les fesses, poussez les genoux vers l\'extérieur'));
      else issues.push(ok('Genou dans l\'axe des orteils ✓'));

      // Depth: hip crease below knee
      if (hip.y < knee.y) issues.push(warn('Profondeur insuffisante — descendez jusqu\'à ce que la hanche passe sous le genou'));
      else issues.push(ok('Profondeur correcte ✓'));

      // Knee valgus: rough check via knee vs ankle x-alignment on front view
      // (limited without front camera — noted as tip)
      if (torsoAng < 30 && kneeAng < 90) issues.push(info('Conseil : vérifiez que vos genoux s\'ouvrent bien vers l\'extérieur'));
    }

    return { primaryAngle: kneeAng, issues };
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  POMPE (PUSH-UP)
// ══════════════════════════════════════════════════════════════════════════════

const PUSHUP = {
  id: 'pushup',
  name: 'Pompe',
  icon: '💪',
  hint: 'Placez-vous de profil à ~2 m',
  angleLabel: 'Angle coude',
  downAngle: 95,
  upAngle:   155,

  analyse(lm, phase) {
    const side = pickSide(lm, [11,13,15], [12,14,16]);
    const shoul = side === 'left' ? lm[11] : lm[12];
    const elbow = side === 'left' ? lm[13] : lm[14];
    const wrist = side === 'left' ? lm[15] : lm[16];
    const hip   = side === 'left' ? lm[23] : lm[24];
    const ankle = side === 'left' ? lm[27] : lm[28];

    const elbowAng = angle3(shoul, elbow, wrist);

    // Body alignment: shoulder-hip-ankle should be ~180°
    const bodyAng = angle3(shoul, hip, ankle);
    const hipSag  = bodyAng < 155;   // hips too low
    const hipHigh = bodyAng > 170 && hip.y < Math.min(shoul.y, ankle.y); // hips too high

    // Elbow flare: elbow should stay close to body (x-offset vs shoulder)
    const elbowFlare = Math.abs(elbow.x - shoul.x) > 0.08;

    const issues = [];

    if (phase === 'down') {
      // Depth
      if (elbowAng > 115) issues.push(warn('Pas assez bas — descendez jusqu\'à ce que les coudes soient à 90°'));
      else issues.push(ok('Amplitude correcte ✓'));

      // Body line
      if (hipSag)  issues.push(err('Hanches qui s\'affaissent — contractez le gainage et les fessiers'));
      else if (hipHigh) issues.push(warn('Fesses trop hautes — corps doit former une ligne droite'));
      else issues.push(ok('Alignement corpo correct ✓'));

      // Elbow flare
      if (elbowFlare) issues.push(warn('Coudes trop écartés — gardez-les à ~45° du corps'));
      else issues.push(ok('Placement des coudes correct ✓'));
    }

    if (phase === 'up') {
      if (elbowAng < 140) issues.push(warn('Extension incomplète — poussez jusqu\'au bout en haut'));
    }

    return { primaryAngle: elbowAng, issues };
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  SOULEVÉ DE TERRE (DEADLIFT)
// ══════════════════════════════════════════════════════════════════════════════

const DEADLIFT = {
  id: 'deadlift',
  name: 'Soulevé de terre',
  icon: '🏋️',
  hint: 'Placez-vous de profil à ~2 m',
  angleLabel: 'Angle hanche',
  downAngle: 80,   // hip angle (torso bent forward)
  upAngle:   155,  // fully standing

  analyse(lm, phase) {
    const side = pickSide(lm, [23,25,27], [24,26,28]);
    const shoul = side === 'left' ? lm[11] : lm[12];
    const hip   = side === 'left' ? lm[23] : lm[24];
    const knee  = side === 'left' ? lm[25] : lm[26];
    const ankle = side === 'left' ? lm[27] : lm[28];
    const ear   = side === 'left' ? lm[7]  : lm[8];

    const hipAng   = angle3(shoul, hip, knee);     // trunk angle
    const kneeAng  = angle3(hip, knee, ankle);
    const torsoAng = verticalAngle(shoul, hip);    // back inclination
    // Neck/head alignment with spine
    const neckAng  = verticalAngle(ear, shoul);

    const issues = [];

    if (phase === 'down') {
      // Back flatness
      if (torsoAng > 50) issues.push(err('Dos arrondi — gardez la colonne neutre, poitrine haute'));
      else if (torsoAng > 35) issues.push(warn('Légère rondeur du dos — concentrez-vous sur la poitrine haute'));
      else issues.push(ok('Dos bien plat ✓'));

      // Knee bend at start
      if (kneeAng > 155) issues.push(warn('Jambes trop tendues — fléchissez légèrement les genoux'));
      else issues.push(ok('Flexion genou correcte ✓'));

      // Head neutral
      if (neckAng > 25) issues.push(warn('Tête trop relevée ou trop baissée — regard légèrement devant'));
      else issues.push(ok('Position de la tête neutre ✓'));
    }

    if (phase === 'up') {
      // Lock-out: fully extended hips and knees
      if (hipAng < 155) issues.push(warn('Extension des hanches incomplète — poussez les hanches vers l\'avant en haut'));
      else issues.push(ok('Verrouillage final correct ✓'));
    }

    return { primaryAngle: hipAng, issues };
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  FENTE AVANT (LUNGE)
// ══════════════════════════════════════════════════════════════════════════════

const LUNGE = {
  id: 'lunge',
  name: 'Fente avant',
  icon: '🚶',
  hint: 'Placez-vous de profil à ~2 m',
  angleLabel: 'Angle genou',
  downAngle: 100,
  upAngle:   155,

  analyse(lm, phase) {
    // Use front knee (the more bent one in bottom position)
    const lKnee = lm[25]; const rKnee = lm[26];
    const lHip  = lm[23]; const rHip  = lm[24];
    const lAnk  = lm[27]; const rAnk  = lm[28];
    const lShoul = lm[11]; const rShoul = lm[12];
    const lToe  = lm[31]; const rToe  = lm[32];

    const lAng = angle3(lHip, lKnee, lAnk);
    const rAng = angle3(rHip, rKnee, rAnk);

    // Front knee = most bent
    const isFrontLeft = lAng <= rAng;
    const frontKnee   = isFrontLeft ? lKnee : rKnee;
    const frontHip    = isFrontLeft ? lHip  : rHip;
    const frontAnk    = isFrontLeft ? lAnk  : rAnk;
    const frontToe    = isFrontLeft ? lToe  : rToe;
    const backKnee    = isFrontLeft ? rKnee : lKnee;
    const backAnk     = isFrontLeft ? rAnk  : lAnk;
    const shoul       = mid(lShoul, rShoul);

    const frontKneeAng = Math.min(lAng, rAng);
    const torsoAng     = verticalAngle(shoul, mid(lHip, rHip));
    const kneeOverToe  = isFrontLeft ? (frontKnee.x < frontToe.x) : (frontKnee.x > frontToe.x);
    const backKneeHigh = backKnee.y > backAnk.y - 0.05; // back knee near floor

    const issues = [];

    if (phase === 'down') {
      // Front knee over toe
      if (kneeOverToe) issues.push(err('Genou avant dépasse les orteils — reculez le pied avant ou raccourcissez l\'enjambée'));
      else issues.push(ok('Genou avant dans l\'axe ✓'));

      // Torso upright
      if (torsoAng > 15) issues.push(warn('Torse penché en avant — gardez le dos bien droit'));
      else issues.push(ok('Torse vertical ✓'));

      // Back knee depth
      if (!backKneeHigh) issues.push(warn('Genou arrière pas assez bas — descendez jusqu\'à ~5 cm du sol'));
      else issues.push(ok('Profondeur de fente correcte ✓'));

      // Front knee angle
      if (frontKneeAng > 120) issues.push(warn('Fente pas assez profonde — descendez davantage'));
    }

    return { primaryAngle: frontKneeAng, issues };
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  PLANCHE (PLANK)
// ══════════════════════════════════════════════════════════════════════════════

const PLANK = {
  id: 'plank',
  name: 'Planche',
  icon: '📐',
  hint: 'Placez-vous de profil à ~2 m',
  angleLabel: 'Alignement',
  downAngle: 999,  // no rep counting for plank
  upAngle:   999,
  isIsometric: true,

  analyse(lm, phase) {
    const shoul = mid(lm[11], lm[12]);
    const hip   = mid(lm[23], lm[24]);
    const ankle = mid(lm[27], lm[28]);
    const ear   = mid(lm[7],  lm[8]);

    const bodyAng  = angle3(shoul, hip, ankle);   // should be ~180°
    const hipSag   = bodyAng < 155;
    const hipHigh  = hip.y < shoul.y - 0.03 && hip.y < ankle.y - 0.03;
    const neckAng  = verticalAngle(ear, shoul);
    const deviation = Math.abs(180 - bodyAng);    // 0 = perfect

    const issues = [];

    // Hip alignment
    if (hipSag)  issues.push(err('Hanches affaissées — contractez fessiers et abdos'));
    else if (hipHigh) issues.push(warn('Hanches trop hautes — baissez le bassin'));
    else issues.push(ok('Alignement dos-hanche-cheville parfait ✓'));

    // Head/neck
    if (neckAng > 20) issues.push(warn('Tête non neutre — regard vers le sol, cou dans l\'axe de la colonne'));
    else issues.push(ok('Position de la tête neutre ✓'));

    // Shoulder position
    const shoulderOverWrist = Math.abs(lm[11].x - lm[15].x) > 0.1 || Math.abs(lm[12].x - lm[16].x) > 0.1;
    if (shoulderOverWrist) issues.push(warn('Épaules pas dans l\'axe des poignets — repositionnez-vous'));

    return { primaryAngle: Math.round(bodyAng), issues };
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  SQUAT BULGARE (Bulgarian Split Squat)
// ══════════════════════════════════════════════════════════════════════════════

const OHSQUAT = {
  id: 'ohsquat',
  name: 'Squat bulgare',
  icon: '🙌',
  hint: 'Placez-vous de profil, pied arrière élevé',
  angleLabel: 'Angle genou',
  downAngle: 100,
  upAngle:   155,

  analyse(lm, phase) {
    const lKnee = lm[25]; const rKnee = lm[26];
    const lHip  = lm[23]; const rHip  = lm[24];
    const lAnk  = lm[27]; const rAnk  = lm[28];
    const lShoul = lm[11]; const rShoul = lm[12];
    const lToe  = lm[31]; const rToe  = lm[32];

    const lAng = angle3(lHip, lKnee, lAnk);
    const rAng = angle3(rHip, rKnee, rAnk);
    const isFrontLeft = lAng <= rAng;

    const frontKnee = isFrontLeft ? lKnee : rKnee;
    const frontHip  = isFrontLeft ? lHip  : rHip;
    const frontAnk  = isFrontLeft ? lAnk  : rAnk;
    const frontToe  = isFrontLeft ? lToe  : rToe;
    const shoul     = mid(lShoul, rShoul);
    const hipMid    = mid(lHip, rHip);

    const frontKneeAng = Math.min(lAng, rAng);
    const torsoAng     = verticalAngle(shoul, hipMid);
    const kneeOverToe  = isFrontLeft ? (frontKnee.x < frontToe.x) : (frontKnee.x > frontToe.x);

    const issues = [];

    if (phase === 'down') {
      if (kneeOverToe) issues.push(err('Genou avant dépasse les orteils — avancez le pied avant'));
      else issues.push(ok('Genou avant bien positionné ✓'));

      if (torsoAng > 20) issues.push(warn('Torse penché — gardez la colonne droite'));
      else issues.push(ok('Torse vertical ✓'));

      if (frontKneeAng > 120) issues.push(warn('Pas assez profond — descendez davantage'));
      else issues.push(ok('Profondeur de fente correcte ✓'));

      issues.push(info('Conseil : concentrez-vous sur le genou arrière qui descend droit vers le sol'));
    }

    return { primaryAngle: frontKneeAng, issues };
  }
};

// ─── Registry ────────────────────────────────────────────────────────────────

const MOVEMENTS = { squat: SQUAT, pushup: PUSHUP, deadlift: DEADLIFT, lunge: LUNGE, plank: PLANK, ohsquat: OHSQUAT };

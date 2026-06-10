const MAX_CIRCUITS = 5;
const EPS = 1e-7;
const TERMINAL_PAD_RADIUS = 3;
const defaultColors = ["#0891b2", "#22c55e", "#d946ef", "#f59e0b", "#6366f1"];

const state = {
  partWidth: 100,
  partHeight: 100,
  fovX: 25,
  fovY: 25,
  fovWidth: 50,
  fovHeight: 50,
  circuitCount: 2,
  snapToGrid: true,
  shareTerminals: false,
  activeTerminal: "0:p1",
  autoFitSummary: "",
  circuits: Array.from({ length: MAX_CIRCUITS }, (_, i) => ({
    color: defaultColors[i],
    pitch: 5,
    topReturnClearance: 2,
    bottomReturnClearance: 2,
    leftClearance: 0,
    rightClearance: 0,
    minWallDistance: 2,
    minDistanceToOtherWires: 1.5,
    wireVisualThickness: 1,
    p1: { x: 6 + i * 8, y: 6 + i * 8 },
    p2: { x: 94 - i * 8, y: 94 - i * 8 }
  })),
  results: []
};

const dom = {
  svg: document.getElementById("drawing"),
  controls: document.getElementById("circuitControls"),
  template: document.getElementById("circuitTemplate"),
  activeTerminal: document.getElementById("activeTerminal"),
  validationList: document.getElementById("validationList"),
  geometryInspector: document.getElementById("geometryInspector"),
  lengthResults: document.getElementById("lengthResults"),
  statusPill: document.getElementById("statusPill"),
  canvasMessage: document.getElementById("canvasMessage"),
  autoFitSummary: document.getElementById("autoFitSummary")
};

let dragTarget = null;

function readGlobalInputs() {
  for (const key of ["partWidth", "partHeight", "fovX", "fovY", "fovWidth", "fovHeight"]) {
    state[key] = numberValue(document.getElementById(key), state[key]);
  }
  state.circuitCount = Number(document.getElementById("circuitCount").value);
  state.snapToGrid = document.getElementById("snapToGrid").checked;
  state.shareTerminals = document.getElementById("shareTerminals").checked;
  state.activeTerminal = dom.activeTerminal.value || state.activeTerminal;
  document.getElementById("circuitCountValue").textContent = state.circuitCount;
  if (state.shareTerminals) synchronizeSharedTerminals(0, "both");
}

function numberValue(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function writeGlobalInputs() {
  for (const key of ["partWidth", "partHeight", "fovX", "fovY", "fovWidth", "fovHeight"]) {
    document.getElementById(key).value = round(state[key]);
  }
  document.getElementById("circuitCount").value = state.circuitCount;
  document.getElementById("snapToGrid").checked = state.snapToGrid;
  document.getElementById("shareTerminals").checked = state.shareTerminals;
  document.getElementById("circuitCountValue").textContent = state.circuitCount;
}

function buildCircuitControls() {
  dom.controls.innerHTML = "";
  dom.activeTerminal.innerHTML = "";
  if (state.shareTerminals) {
    dom.activeTerminal.add(new Option("Shared P1", "0:p1"));
    dom.activeTerminal.add(new Option("Shared P2", "0:p2"));
  } else {
    for (let i = 0; i < state.circuitCount; i++) {
      dom.activeTerminal.add(new Option(`Circuit ${i + 1} P1`, `${i}:p1`));
      dom.activeTerminal.add(new Option(`Circuit ${i + 1} P2`, `${i}:p2`));
    }
  }

  for (let i = 0; i < state.circuitCount; i++) {
    const card = dom.template.content.firstElementChild.cloneNode(true);
    card.dataset.index = String(i);
    card.querySelector("summary strong").textContent = `Circuit ${i + 1}`;
    card.querySelector("summary small").textContent = state.shareTerminals ? "shared P1/P2" : "independent wire";
    card.querySelector(".swatch").style.background = state.circuits[i].color;
    for (const input of card.querySelectorAll("input[data-key]")) {
      const key = input.dataset.key;
      if (key === "p1x") input.value = round(state.circuits[i].p1.x);
      else if (key === "p1y") input.value = round(state.circuits[i].p1.y);
      else if (key === "p2x") input.value = round(state.circuits[i].p2.x);
      else if (key === "p2y") input.value = round(state.circuits[i].p2.y);
      else input.value = state.circuits[i][key];
      if (state.shareTerminals && i > 0 && key.startsWith("p")) input.disabled = true;
      input.addEventListener("input", () => {
        readCircuitInput(i, input);
        state.autoFitSummary = "";
        regenerate();
      });
    }
    dom.controls.append(card);
  }

  if (![...dom.activeTerminal.options].some(o => o.value === state.activeTerminal)) state.activeTerminal = "0:p1";
  dom.activeTerminal.value = state.activeTerminal;
}

function readCircuitInput(i, input) {
  const circuit = state.circuits[i];
  const key = input.dataset.key;
  if (key === "color") circuit.color = input.value;
  else if (key === "p1x") circuit.p1.x = numberValue(input, circuit.p1.x);
  else if (key === "p1y") circuit.p1.y = numberValue(input, circuit.p1.y);
  else if (key === "p2x") circuit.p2.x = numberValue(input, circuit.p2.x);
  else if (key === "p2y") circuit.p2.y = numberValue(input, circuit.p2.y);
  else circuit[key] = numberValue(input, circuit[key]);
  if (state.shareTerminals && (key.startsWith("p1") || key.startsWith("p2"))) synchronizeSharedTerminals(i, key.startsWith("p1") ? "p1" : "p2");
  const card = dom.controls.querySelector(`[data-index="${i}"]`);
  if (card) card.querySelector(".swatch").style.background = circuit.color;
}

function synchronizeSharedTerminals(sourceIndex, which) {
  const source = state.circuits[sourceIndex] || state.circuits[0];
  for (let i = 0; i < state.circuitCount; i++) {
    if (which === "both" || which === "p1") state.circuits[i].p1 = { ...source.p1 };
    if (which === "both" || which === "p2") state.circuits[i].p2 = { ...source.p2 };
  }
}

function partRect() { return { xMin: 0, yMin: 0, xMax: state.partWidth, yMax: state.partHeight }; }
function fovRect() { return { xMin: state.fovX, yMin: state.fovY, xMax: state.fovX + state.fovWidth, yMax: state.fovY + state.fovHeight }; }
function usablePart(c) { return { xMin: c.minWallDistance, yMin: c.minWallDistance, xMax: state.partWidth - c.minWallDistance, yMax: state.partHeight - c.minWallDistance }; }

function regenerate() {
  readGlobalInputs();
  state.results = generateAllCircuits();
  renderControlsOnlyValues();
  renderSvg();
  renderValidation();
  renderLengthResults();
  renderInspector();
  renderAutoFitSummary();
}

function renderControlsOnlyValues() {
  for (let i = 0; i < state.circuitCount; i++) {
    const card = dom.controls.querySelector(`[data-index="${i}"]`);
    if (!card) continue;
    card.querySelector("[data-key='p1x']").value = round(state.circuits[i].p1.x);
    card.querySelector("[data-key='p1y']").value = round(state.circuits[i].p1.y);
    card.querySelector("[data-key='p2x']").value = round(state.circuits[i].p2.x);
    card.querySelector("[data-key='p2y']").value = round(state.circuits[i].p2.y);
  }
}

function generateAllCircuits() {
  const results = [];
  const occupiedSegments = [];
  for (let i = 0; i < state.circuitCount; i++) {
    const result = generateCircuit(i, occupiedSegments);
    results.push(result);
    if (result.valid) occupiedSegments.push(...result.segments.map(s => ({ ...s, circuitIndex: i })));
  }
  return results;
}

function generateCircuit(index, obstacles) {
  const config = state.circuits[index];
  const fov = fovRect();
  const usable = usablePart(config);
  const separation = wireSeparation(config);
  const verticalOffsets = index === 0 ? [0] : [index * separation, (index + 1) * separation, (index - 0.5) * separation];
  const laneRanges = candidateLaneRanges(config, index, separation, fov);
  const errors = [];

  for (const offset of verticalOffsets) {
    for (const range of laneRanges) {
      const rails = {
        topReturnY: round(fov.yMax + config.topReturnClearance + offset),
        bottomReturnY: round(fov.yMin - config.bottomReturnClearance - offset),
        laneMin: round(range.laneMin),
        laneMax: round(range.laneMax),
        offset
      };
      const attempt = buildCandidate(config, index, rails, usable, fov, obstacles);
      if (attempt.valid) return attempt;
      errors.push(...attempt.errors);
    }
  }

  return invalidResult(index, config, uniqueErrors(errors).at(0) || "Circuit cannot be generated without overlapping another circuit or leaving the part boundary.");
}

function candidateLaneRanges(config, index, separation, fov) {
  const fullMin = fov.xMin - config.leftClearance;
  const fullMax = fov.xMax + config.rightClearance;
  const ranges = [];
  if (state.circuitCount > 1) {
    const total = fullMax - fullMin;
    const bandWidth = (total - (state.circuitCount - 1) * separation) / state.circuitCount;
    if (bandWidth >= config.pitch) {
      const start = fullMin + index * (bandWidth + separation);
      ranges.push({ laneMin: start, laneMax: start + bandWidth, mode: "partition" });
    }
  }
  const fallbackSigns = index === 0 ? [0] : [-1, 1, 0];
  for (const sign of fallbackSigns) {
    const offset = index * separation;
    ranges.push({ laneMin: fullMin + sign * offset, laneMax: fullMax + sign * offset, mode: "nested" });
  }
  return ranges;
}

function buildCandidate(config, index, rails, usable, fov, obstacles) {
  const checks = [];
  const errors = [];
  const partOk = usable.xMin <= usable.xMax && usable.yMin <= usable.yMax;
  addCheck(checks, partOk, "Usable part boundary exists", `${rectLabel(usable)}`);
  if (!partOk) errors.push("Minimum wall distance is too large for the part.");

  const railOk = rails.topReturnY <= usable.yMax + EPS && rails.bottomReturnY >= usable.yMin - EPS;
  addCheck(checks, railOk, "Top and bottom return rails are inside usable part", `top=${round(rails.topReturnY)}, bottom=${round(rails.bottomReturnY)}`);
  if (!railOk) errors.push("Not enough clearance between FoV and part boundary for top/bottom return path.");

  const lanes = generateLanes(rails.laneMin, rails.laneMax, config.pitch, usable);
  const laneOk = lanes.length >= 2;
  addCheck(checks, laneOk, "At least two vertical lanes are available", `${lanes.length} lane(s)`);
  if (!laneOk) errors.push("Not enough horizontal space to generate at least two vertical lanes.");
  if (errors.length) return invalidResult(index, config, errors[0], checks, rails, lanes);

  const p1 = terminalForRouting(config.p1, config.pitch);
  const p2 = terminalForRouting(config.p2, config.pitch);
  const p1Ok = validateTerminalPosition(p1, usable);
  const p2Ok = validateTerminalPosition(p2, usable);
  addCheck(checks, p1Ok, "P1 is inside usable part", pointLabel(p1));
  addCheck(checks, p2Ok, "P2 is inside usable part", pointLabel(p2));
  if (!p1Ok || !p2Ok) return invalidResult(index, config, "P1 and P2 terminals must be inside the usable part boundary.", checks, rails, lanes);

  const baseBody = generateSerpentineBody(lanes, rails.bottomReturnY, rails.topReturnY);
  const sharedPads = sharedTerminalPads(config);
  const routedOptions = [baseBody, [...baseBody].reverse()].map(body => buildRoutedCircuitBody({ body, p1, p2, rails, fov, usable, obstacles, config, index, sharedPads }));
  routedOptions.sort((a, b) => Number(b.routeValid) - Number(a.routeValid) || a.length - b.length);
  const routed = routedOptions[0];
  addCheck(checks, routed.entry.valid, "P1 connection route is valid", routed.entry.message);
  addCheck(checks, routed.exit.valid, "P2 connection route is valid", routed.exit.message);
  if (!routed.routeValid) return invalidResult(index, config, routed.entry.valid ? routed.exit.message : routed.entry.message, checks, rails, lanes);

  const points = routed.points;
  const segments = pointsToSegments(points);
  runGeometryChecks(checks, points, segments, usable, fov, config, obstacles, sharedPads);
  const valid = checks.every(c => c.pass);
  const message = valid ? "Circuit generated successfully." : firstFailure(checks) || "Circuit cannot be generated without overlapping another circuit or leaving the part boundary.";
  if (!valid && obstacles.length) return invalidResult(index, config, message, checks, rails, lanes);
  return { valid, index, color: config.color, config: cloneConfig(config), points: valid ? points : [], segments: valid ? segments : [], lanes, rails, checks, length: valid ? calculateWireLength(points) : 0, message, errors: valid ? [] : [message] };
}

function buildRoutedCircuitBody({ body, p1, p2, rails, fov, usable, obstacles, config, index, sharedPads }) {
  const bodySegments = pointsToSegments(body);
  const entry = routeTerminalConnection({ from: p1, to: body[0], rails, fov, usable, obstacles, bodySegments, config, index, terminalKey: "p1", sharedPads });
  const exit = routeTerminalConnection({ from: body[body.length - 1], to: p2, rails, fov, usable, obstacles, bodySegments, config, index, terminalKey: "p2", sharedPads });
  const routeValid = entry.valid && exit.valid;
  const points = routeValid ? simplifyPoints([...entry.points, ...body.slice(1), ...exit.points.slice(1)]) : [];
  return { entry, exit, routeValid, points, length: routeValid ? calculateWireLength(points) : Number.POSITIVE_INFINITY };
}

function invalidResult(index, config, message, checks = [], rails = null, lanes = []) {
  if (!checks.some(c => !c.pass)) addCheck(checks, false, "Circuit generation", message);
  return { valid: false, index, color: config.color, config: cloneConfig(config), points: [], segments: [], lanes, rails, checks, length: 0, message, errors: [message] };
}

function generateLanes(minX, maxX, pitch, usable) {
  if (!(pitch > 0)) return [];
  const lanes = [];
  for (let x = minX, guard = 0; x <= maxX + EPS && guard < 2000; x += pitch, guard++) {
    const rounded = round(x);
    if (rounded >= usable.xMin - EPS && rounded <= usable.xMax + EPS) lanes.push(rounded);
  }
  return lanes;
}

function generateSerpentineBody(lanes, bottomY, topY) {
  const points = [{ x: lanes[0], y: bottomY }, { x: lanes[0], y: topY }];
  for (let i = 1; i < lanes.length; i++) {
    const currentRail = i % 2 === 1 ? topY : bottomY;
    const oppositeRail = i % 2 === 1 ? bottomY : topY;
    points.push({ x: lanes[i], y: currentRail }, { x: lanes[i], y: oppositeRail });
  }
  return simplifyPoints(points);
}

function routeTerminalConnection({ from, to, rails, fov, usable, obstacles, bodySegments, config, index, terminalKey, sharedPads }) {
  const candidates = terminalRouteCandidates(from, to, rails, usable, config, index);
  const validRoutes = [];
  const allowedTouch = [from, to];
  const forbiddenBody = bodySegments.filter(s => !pointOnSegment(from, s) && !pointOnSegment(to, s));
  for (const raw of candidates) {
    const points = simplifyPoints(raw);
    const segments = pointsToSegments(points);
    const routeChecks = [
      segments.length > 0,
      segments.every(s => isHorizontal(s) || isVertical(s)),
      points.every(p => pointInside(p, usable)),
      segments.filter(isHorizontal).every(s => horizontalSafe(s, fov)),
      segments.every(s => forbiddenBody.every(b => !segmentsConflict(s, b, config.minDistanceToOtherWires, [], allowedTouch))),
      segments.every(s => obstacles.every(o => !segmentsConflict(s, o, config.minDistanceToOtherWires, sharedPads, allowedTouch)))
    ];
    if (routeChecks.every(Boolean)) validRoutes.push({ points, length: calculateWireLength(points) });
  }
  validRoutes.sort((a, b) => a.length - b.length || a.points.length - b.points.length);
  if (validRoutes.length) return { valid: true, points: validRoutes[0].points, message: `${terminalKey.toUpperCase()} routed with ${validRoutes[0].points.length} point(s).` };
  return { valid: false, points: [], message: `${terminalKey.toUpperCase()} cannot be routed to the serpentine body without crossing the FoV, leaving the usable part, or colliding with another wire.` };
}

function terminalRouteCandidates(from, to, rails, usable, config, index) {
  const sep = wireSeparation(config);
  const side = from.x <= to.x ? -1 : 1;
  const breakoutCandidates = [
    clamp(from.x + side * (index + 1) * sep, usable.xMin, usable.xMax),
    clamp(to.x - side * (index + 1) * sep, usable.xMin, usable.xMax)
  ];
  const outerTopY = round(clamp(usable.yMin + (index + 1) * sep, usable.yMin, usable.yMax));
  const outerBottomY = round(clamp(usable.yMax - (index + 1) * sep, usable.yMin, usable.yMax));
  const railsByDistance = [rails.topReturnY, rails.bottomReturnY, outerTopY, outerBottomY]
    .filter((value, i, arr) => arr.findIndex(v => Math.abs(v - value) < EPS) === i)
    .sort((a, b) => Math.abs(a - from.y) - Math.abs(b - from.y));
  const candidates = [
    [from, { x: from.x, y: to.y }, to],
    [from, { x: to.x, y: from.y }, to]
  ];
  for (const railY of railsByDistance) candidates.push([from, { x: from.x, y: railY }, { x: to.x, y: railY }, to]);
  for (const bx of breakoutCandidates) {
    for (const railY of railsByDistance) candidates.push([from, { x: bx, y: from.y }, { x: bx, y: railY }, { x: to.x, y: railY }, to]);
  }
  return candidates;
}

function terminalForRouting(point, pitch) {
  if (!state.snapToGrid || !(pitch > 0)) return { x: round(point.x), y: round(point.y) };
  return { x: round(Math.round(point.x / pitch) * pitch), y: round(Math.round(point.y / pitch) * pitch) };
}

function validateTerminalPosition(point, usable) {
  return pointInside(point, usable);
}

function runGeometryChecks(checks, points, segments, usable, fov, config, obstacles, sharedPads) {
  const orthogonal = segments.every(s => isHorizontal(s) || isVertical(s));
  addCheck(checks, orthogonal, "Every segment is horizontal or vertical", orthogonal ? `${segments.length} segment(s)` : "Invalid segment detected: non-orthogonal segment.");
  const horizontalClear = segments.filter(isHorizontal).every(s => horizontalSafe(s, fov));
  addCheck(checks, horizontalClear, "Horizontal segments avoid the FoV interior", "Vertical segments may pass through the FoV.");
  const notOnBoundary = segments.filter(isHorizontal).every(s => Math.abs(s.a.y - fov.yMin) > EPS && Math.abs(s.a.y - fov.yMax) > EPS);
  addCheck(checks, notOnBoundary, "No horizontal segment lies on FoV top or bottom boundary", `FoV y=${round(fov.yMin)}..${round(fov.yMax)}`);
  const boundary = points.every(p => pointInside(p, usable));
  addCheck(checks, boundary, "Every generated point remains inside usable part", `${points.length} point(s)`);
  const selfClear = segments.every((a, i) => segments.every((b, j) => i >= j || adjacentSegments(i, j) || !segmentsConflict(a, b, config.minDistanceToOtherWires, [], [])));
  addCheck(checks, selfClear, "Non-adjacent segments in this circuit do not overlap or cross", "Adjacent segments may meet at shared endpoints.");
  const obstacleClear = segments.every(a => obstacles.every(b => !segmentsConflict(a, b, config.minDistanceToOtherWires, sharedPads, [])));
  addCheck(checks, obstacleClear, state.shareTerminals ? "Circuit is separated from other circuits outside shared terminal pads" : "Circuit is separated from previously generated circuits", `minimum ${round(config.minDistanceToOtherWires)} mm`);
}

function addCheck(checks, pass, title, detail) { checks.push({ pass: Boolean(pass), title, detail }); }
function firstFailure(checks) { return checks.find(c => !c.pass)?.detail?.startsWith("Invalid segment") ? "Invalid segment detected: non-orthogonal segment." : checks.find(c => !c.pass)?.title; }
function uniqueErrors(errors) { return [...new Set(errors.filter(Boolean))]; }
function cloneConfig(c) { return JSON.parse(JSON.stringify(c)); }
function round(n) { return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000; }
function pointLabel(p) { return `(${round(p.x)}, ${round(p.y)})`; }
function rectLabel(r) { return `x=${round(r.xMin)}..${round(r.xMax)}, y=${round(r.yMin)}..${round(r.yMax)}`; }
function pointInside(p, r) { return p.x >= r.xMin - EPS && p.x <= r.xMax + EPS && p.y >= r.yMin - EPS && p.y <= r.yMax + EPS; }
function rangesOverlap(a1, a2, b1, b2) { return Math.max(Math.min(a1,a2), Math.min(b1,b2)) <= Math.min(Math.max(a1,a2), Math.max(b1,b2)) + EPS; }
function isHorizontal(s) { return Math.abs(s.a.y - s.b.y) < EPS; }
function isVertical(s) { return Math.abs(s.a.x - s.b.x) < EPS; }
function adjacentSegments(i, j) { return Math.abs(i - j) === 1; }
function wireSeparation(config) { return round(config.minDistanceToOtherWires + config.wireVisualThickness); }

function horizontalSafe(s, fov) {
  if (!isHorizontal(s)) return true;
  const y = s.a.y;
  const overlapsFovX = rangesOverlap(s.a.x, s.b.x, fov.xMin, fov.xMax);
  const inFovY = y >= fov.yMin - EPS && y <= fov.yMax + EPS;
  return !(inFovY && overlapsFovX);
}

function pointsToSegments(points) {
  return points.slice(0, -1).map((p, i) => ({ a: p, b: points[i + 1] })).filter(s => Math.abs(s.a.x - s.b.x) > EPS || Math.abs(s.a.y - s.b.y) > EPS);
}

function simplifyPoints(points) {
  const compact = [];
  for (const p of points) {
    const q = { x: round(p.x), y: round(p.y) };
    const last = compact.at(-1);
    if (!last || Math.abs(last.x - q.x) > EPS || Math.abs(last.y - q.y) > EPS) compact.push(q);
  }
  const simplified = [];
  for (const p of compact) {
    simplified.push(p);
    while (simplified.length >= 3) {
      const a = simplified.at(-3), b = simplified.at(-2), c = simplified.at(-1);
      if ((Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS) || (Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS)) simplified.splice(simplified.length - 2, 1);
      else break;
    }
  }
  return simplified;
}

function calculateWireLength(points) {
  const segments = pointsToSegments(points);
  if (segments.some(s => !isHorizontal(s) && !isVertical(s))) return NaN;
  return round(segments.reduce((sum, s) => sum + Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y), 0));
}

function segmentsConflict(a, b, clearance, sharedPads, allowedTouchPoints) {
  if (!segmentsCollide(a, b, clearance)) return false;
  if (allowedTouchPoints.some(p => collisionOnlyAtPoint(a, b, p))) return false;
  if (sharedPads.some(pad => collisionRegionInsidePad(a, b, pad, TERMINAL_PAD_RADIUS))) return false;
  return true;
}

function segmentsCollide(a, b, clearance) {
  return segmentDistance(a, b) < clearance - EPS || segmentsIntersect(a, b);
}

function collisionOnlyAtPoint(a, b, p) {
  if (!pointOnSegment(p, a) || !pointOnSegment(p, b)) return false;
  if (isHorizontal(a) && isHorizontal(b)) return false;
  if (isVertical(a) && isVertical(b)) return false;
  return true;
}

function collisionRegionInsidePad(a, b, pad, radius) {
  if (!segmentsCollide(a, b, 0)) {
    return pointInside(a.a, padRect(pad, radius)) && pointInside(a.b, padRect(pad, radius)) && pointInside(b.a, padRect(pad, radius)) && pointInside(b.b, padRect(pad, radius));
  }
  if (isHorizontal(a) && isHorizontal(b)) {
    if (Math.abs(a.a.y - b.a.y) > EPS) return false;
    const y = a.a.y;
    const x1 = Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x));
    const x2 = Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x));
    return pointInside({ x: x1, y }, padRect(pad, radius)) && pointInside({ x: x2, y }, padRect(pad, radius));
  }
  if (isVertical(a) && isVertical(b)) {
    if (Math.abs(a.a.x - b.a.x) > EPS) return false;
    const x = a.a.x;
    const y1 = Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y));
    const y2 = Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y));
    return pointInside({ x, y: y1 }, padRect(pad, radius)) && pointInside({ x, y: y2 }, padRect(pad, radius));
  }
  const h = isHorizontal(a) ? a : b;
  const v = isVertical(a) ? a : b;
  return pointInside({ x: v.a.x, y: h.a.y }, padRect(pad, radius));
}

function padRect(p, r) { return { xMin: p.x - r, xMax: p.x + r, yMin: p.y - r, yMax: p.y + r }; }
function sharedTerminalPads(config) { return state.shareTerminals ? [config.p1, config.p2] : []; }

function pointOnSegment(p, s) {
  if (isHorizontal(s)) return Math.abs(p.y - s.a.y) < EPS && p.x >= Math.min(s.a.x, s.b.x) - EPS && p.x <= Math.max(s.a.x, s.b.x) + EPS;
  if (isVertical(s)) return Math.abs(p.x - s.a.x) < EPS && p.y >= Math.min(s.a.y, s.b.y) - EPS && p.y <= Math.max(s.a.y, s.b.y) + EPS;
  return false;
}

function segmentsIntersect(a, b) {
  if (isHorizontal(a) && isHorizontal(b)) return Math.abs(a.a.y - b.a.y) < EPS && rangesOverlap(a.a.x, a.b.x, b.a.x, b.b.x);
  if (isVertical(a) && isVertical(b)) return Math.abs(a.a.x - b.a.x) < EPS && rangesOverlap(a.a.y, a.b.y, b.a.y, b.b.y);
  const h = isHorizontal(a) ? a : b;
  const v = isVertical(a) ? a : b;
  return v.a.x >= Math.min(h.a.x, h.b.x) - EPS && v.a.x <= Math.max(h.a.x, h.b.x) + EPS && h.a.y >= Math.min(v.a.y, v.b.y) - EPS && h.a.y <= Math.max(v.a.y, v.b.y) + EPS;
}

function segmentDistance(a, b) {
  if (segmentsIntersect(a, b)) return 0;
  return Math.min(pointToSegmentDistance(a.a, b), pointToSegmentDistance(a.b, b), pointToSegmentDistance(b.a, a), pointToSegmentDistance(b.b, a));
}

function pointToSegmentDistance(p, s) {
  if (isVertical(s)) {
    const y = clamp(p.y, Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y));
    return Math.hypot(p.x - s.a.x, p.y - y);
  }
  const x = clamp(p.x, Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x));
  return Math.hypot(p.x - x, p.y - s.a.y);
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function snapPointInside(point, pitch, usable) {
  const p = terminalForRouting(point, pitch);
  return { x: round(clamp(p.x, usable.xMin, usable.xMax)), y: round(clamp(p.y, usable.yMin, usable.yMax)) };
}

function autoFitLayout() {
  readGlobalInputs();
  const changes = [];
  const active = state.circuits.slice(0, state.circuitCount);
  const maxWall = Math.max(...active.map(c => c.minWallDistance));
  const maxTop = Math.max(...active.map(c => c.topReturnClearance));
  const maxBottom = Math.max(...active.map(c => c.bottomReturnClearance));
  const maxLeft = Math.max(...active.map(c => c.leftClearance));
  const maxRight = Math.max(...active.map(c => c.rightClearance));
  const maxOffset = Math.max(0, ...active.map(c => wireSeparation(c))) * Math.max(0, state.circuitCount - 1);
  const maxWire = Math.max(...active.map(c => c.wireVisualThickness));

  for (const c of active) {
    const minimumPitch = round(c.minDistanceToOtherWires + c.wireVisualThickness);
    if (c.pitch < minimumPitch) {
      changes.push(`Circuit pitch increased from ${round(c.pitch)} mm to ${minimumPitch} mm.`);
      c.pitch = minimumPitch;
    }
  }

  if (state.fovWidth <= 0 || state.fovHeight <= 0) {
    state.autoFitSummary = "Auto-fit failed because the FoV width and height must be positive.";
    regenerate();
    return;
  }

  const requiredFovX = round(maxWall + maxLeft + maxOffset + maxWire);
  if (state.fovX < requiredFovX) {
    changes.push(`FoV X moved from ${round(state.fovX)} mm to ${requiredFovX} mm to create left-side circuit offset space.`);
    state.fovX = requiredFovX;
  }
  const requiredFovY = round(maxWall + maxBottom + maxOffset + maxWire);
  if (state.fovY < requiredFovY) {
    changes.push(`FoV Y moved from ${round(state.fovY)} mm to ${requiredFovY} mm to fit bottom return rails.`);
    state.fovY = requiredFovY;
  }

  const requiredWidth = round(state.fovX + state.fovWidth + maxRight + maxOffset + maxWall + maxWire);
  if (state.partWidth < requiredWidth) {
    changes.push(`Part width increased from ${round(state.partWidth)} mm to ${requiredWidth} mm.`);
    state.partWidth = requiredWidth;
  }
  const requiredHeight = round(state.fovY + state.fovHeight + maxTop + maxOffset + maxWall + maxWire);
  if (state.partHeight < requiredHeight) {
    changes.push(`Part height increased from ${round(state.partHeight)} mm to ${requiredHeight} mm.`);
    state.partHeight = requiredHeight;
  }

  for (let i = 0; i < state.circuitCount; i++) {
    const c = state.circuits[i];
    const usable = usablePart(c);
    c.p1 = snapPointInside(c.p1, c.pitch, usable);
    c.p2 = snapPointInside(c.p2, c.pitch, usable);
  }
  if (state.shareTerminals) synchronizeSharedTerminals(0, "both");

  writeGlobalInputs();
  buildCircuitControls();
  state.results = generateAllCircuits();
  const valid = state.results.filter(r => r.valid).length;
  if (!changes.length && valid === state.circuitCount) changes.push("No parameter changes were required; all circuits already pass validation.");
  if (valid === state.circuitCount) state.autoFitSummary = `Auto-fit completed:\n* ${changes.join("\n* ")}\n* All ${valid} circuit(s) regenerated successfully.`;
  else state.autoFitSummary = `Auto-fit attempted these changes:\n* ${changes.join("\n* ") || "No deterministic resize was available."}\n* ${state.circuitCount - valid} circuit(s) still need manual routing or terminal changes.`;
  renderControlsOnlyValues();
  renderSvg();
  renderValidation();
  renderLengthResults();
  renderInspector();
  renderAutoFitSummary();
}

function renderSvg() {
  const margin = Math.max(10, Math.max(state.partWidth, state.partHeight) * 0.08);
  const vb = `${-margin} ${-margin} ${state.partWidth + margin * 2} ${state.partHeight + margin * 2}`;
  dom.svg.setAttribute("viewBox", vb);
  dom.svg.innerHTML = "";
  const defs = svgEl("defs");
  const pattern = svgEl("pattern", { id: "minorGrid", width: 5, height: 5, patternUnits: "userSpaceOnUse" });
  pattern.append(svgEl("path", { d: "M 5 0 L 0 0 0 5", fill: "none", class: "grid-line" }));
  defs.append(pattern);
  dom.svg.append(defs);
  dom.svg.append(svgEl("rect", { x: -margin, y: -margin, width: state.partWidth + margin * 2, height: state.partHeight + margin * 2, fill: "url(#minorGrid)" }));
  dom.svg.append(svgEl("rect", { x: 0, y: 0, width: state.partWidth, height: state.partHeight, fill: "white", stroke: "#020617", "stroke-width": 0.8, rx: 0 }));
  dom.svg.append(svgEl("rect", { x: state.fovX, y: state.fovY, width: state.fovWidth, height: state.fovHeight, fill: "rgba(239,68,68,0.035)", stroke: "#ef4444", "stroke-width": 0.7, "stroke-dasharray": "2 1" }));
  dom.svg.append(textEl(state.fovX + 1, state.fovY - 1.5, "FoV", "#ef4444"));

  for (const result of state.results) {
    if (result.valid) {
      dom.svg.append(svgEl("polyline", { points: result.points.map(p => `${p.x},${p.y}`).join(" "), fill: "none", stroke: result.color, "stroke-width": result.config.wireVisualThickness, "stroke-linejoin": "miter", "stroke-linecap": "butt" }));
      for (const x of result.lanes) dom.svg.append(svgEl("line", { x1: x, y1: result.rails.bottomReturnY, x2: x, y2: result.rails.topReturnY, stroke: result.color, "stroke-width": 0.15, opacity: 0.28 }));
    }
  }
  if (state.shareTerminals) drawSharedTerminals();
  else {
    for (const result of state.results) {
      drawTerminal(result.index, "p1", state.circuits[result.index].p1, result.color, `P1 C${result.index + 1}`);
      drawTerminal(result.index, "p2", state.circuits[result.index].p2, result.color, `P2 C${result.index + 1}`);
    }
  }

  const failures = state.results.filter(r => !r.valid);
  dom.canvasMessage.hidden = failures.length === 0;
  dom.canvasMessage.textContent = failures.map(r => `Circuit ${r.index + 1}: ${r.message}`).join(" ");
  dom.statusPill.textContent = failures.length ? `${failures.length} circuit issue${failures.length > 1 ? "s" : ""}` : "All checks passing";
  dom.statusPill.classList.toggle("error", failures.length > 0);
}

function drawSharedTerminals() {
  const label = Array.from({ length: state.circuitCount }, (_, i) => `C${i + 1}`).join("+");
  drawTerminal(0, "p1", state.circuits[0].p1, "#111827", `P1 ${label}`, true);
  drawTerminal(0, "p2", state.circuits[0].p2, "#111827", `P2 ${label}`, true);
}

function drawTerminal(index, key, point, color, label, shared = false) {
  const active = state.activeTerminal === `${index}:${key}` || (shared && state.activeTerminal.endsWith(`:${key}`));
  const group = svgEl("g", { class: `terminal ${active ? "active" : ""} ${shared ? "shared" : ""}`, "data-index": index, "data-key": key });
  group.append(svgEl("circle", { cx: point.x, cy: point.y, r: shared ? 2.6 : 1.8, fill: key === "p1" ? color : "white", stroke: color, "stroke-width": shared ? 1.2 : 0.8 }));
  if (shared) group.append(svgEl("circle", { cx: point.x, cy: point.y, r: TERMINAL_PAD_RADIUS, fill: "none", stroke: color, "stroke-width": 0.25, "stroke-dasharray": "1 1", opacity: 0.65 }));
  group.append(textEl(point.x + 2.4, point.y - 2.2, label, color));
  dom.svg.append(group);
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
function textEl(x, y, text, fill) { const t = svgEl("text", { x, y, fill, class: "svg-label" }); t.textContent = text; return t; }

function renderValidation() {
  dom.validationList.innerHTML = "";
  for (const result of state.results) {
    const wrapper = document.createElement("div");
    wrapper.className = "check-list";
    const heading = document.createElement("h3");
    heading.textContent = `Circuit ${result.index + 1} — ${result.valid ? `${round(result.length)} mm` : result.message}`;
    heading.style.color = result.valid ? "var(--ok)" : "var(--danger)";
    dom.validationList.append(heading, wrapper);
    for (const check of result.checks) {
      const row = document.createElement("div");
      row.className = `check ${check.pass ? "pass" : "fail"}`;
      row.innerHTML = `<div class="icon">${check.pass ? "✓" : "✕"}</div><div><b>${escapeHtml(check.title)}</b><span>${escapeHtml(check.detail || "")}</span></div>`;
      wrapper.append(row);
    }
  }
}

function renderLengthResults() {
  const valid = state.results.filter(r => r.valid);
  const invalid = state.results.length - valid.length;
  const total = round(valid.reduce((sum, r) => sum + r.length, 0));
  dom.lengthResults.innerHTML = `<p class="length-summary">${valid.length} valid circuit${valid.length === 1 ? "" : "s"}, ${invalid} invalid circuit${invalid === 1 ? "" : "s"}, total valid wire length: <strong>${total.toFixed(3)} mm</strong> (${(total / 1000).toFixed(4)} m).</p>`;
  for (const result of state.results) {
    const item = document.createElement("div");
    item.className = `length-card ${result.valid ? "valid" : "invalid"}`;
    const segmentCount = result.valid ? result.segments.length : 0;
    item.innerHTML = result.valid
      ? `<h3><span class="swatch" style="background:${result.color}"></span>Circuit ${result.index + 1}</h3><dl><dt>Status</dt><dd>Valid</dd><dt>Length</dt><dd>${result.length.toFixed(3)} mm</dd><dt>Length</dt><dd>${(result.length / 1000).toFixed(4)} m</dd><dt>Points</dt><dd>${result.points.length}</dd><dt>Segments</dt><dd>${segmentCount}</dd></dl>`
      : `<h3><span class="swatch" style="background:${result.color}"></span>Circuit ${result.index + 1}</h3><dl><dt>Status</dt><dd>Invalid</dd><dt>Reason</dt><dd>${escapeHtml(result.message)}</dd></dl>`;
    dom.lengthResults.append(item);
  }
}

function renderInspector() {
  dom.geometryInspector.innerHTML = "";
  for (const result of state.results) {
    const section = document.createElement("section");
    section.className = "inspector-circuit";
    section.innerHTML = `<h3><span class="swatch" style="background:${result.color}"></span>Circuit ${result.index + 1} ${result.valid ? `· ${result.points.length} points · ${round(result.length)} mm` : "· no valid path"}</h3>`;
    if (result.valid) {
      const table = document.createElement("table");
      table.className = "points-table";
      table.innerHTML = "<thead><tr><th>#</th><th>X mm</th><th>Y mm</th></tr></thead>";
      const tbody = document.createElement("tbody");
      result.points.forEach((p, i) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>P${i}</td><td>${round(p.x).toFixed(3)}</td><td>${round(p.y).toFixed(3)}</td>`;
        tbody.append(row);
      });
      table.append(tbody);
      section.append(table);
    } else {
      const p = document.createElement("p");
      p.textContent = result.message;
      section.append(p);
    }
    dom.geometryInspector.append(section);
  }
}

function renderAutoFitSummary() {
  dom.autoFitSummary.hidden = !state.autoFitSummary;
  dom.autoFitSummary.innerHTML = state.autoFitSummary ? escapeHtml(state.autoFitSummary).replaceAll("\n", "<br>") : "";
}

function escapeHtml(value) { return String(value).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])); }

function svgPointFromEvent(event) {
  const pt = dom.svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const result = pt.matrixTransform(dom.svg.getScreenCTM().inverse());
  return { x: round(result.x), y: round(result.y) };
}

function moveTerminal(index, key, point) {
  const c = state.circuits[index];
  const usable = usablePart(c);
  const next = snapPointInside({ x: clamp(point.x, usable.xMin, usable.xMax), y: clamp(point.y, usable.yMin, usable.yMax) }, c.pitch, usable);
  if (state.shareTerminals) {
    state.circuits[0][key] = next;
    synchronizeSharedTerminals(0, key);
    state.activeTerminal = `0:${key}`;
  } else {
    c[key] = next;
    state.activeTerminal = `${index}:${key}`;
  }
  state.autoFitSummary = "";
  dom.activeTerminal.value = state.activeTerminal;
  regenerate();
}

dom.svg.addEventListener("pointerdown", event => {
  const terminal = event.target.closest?.(".terminal");
  if (terminal) {
    dragTarget = { index: Number(terminal.dataset.index), key: terminal.dataset.key };
    dom.svg.setPointerCapture(event.pointerId);
    moveTerminal(dragTarget.index, dragTarget.key, svgPointFromEvent(event));
  } else {
    const [index, key] = state.activeTerminal.split(":");
    moveTerminal(Number(index), key, svgPointFromEvent(event));
  }
});
dom.svg.addEventListener("pointermove", event => { if (dragTarget) moveTerminal(dragTarget.index, dragTarget.key, svgPointFromEvent(event)); });
dom.svg.addEventListener("pointerup", event => { dragTarget = null; try { dom.svg.releasePointerCapture(event.pointerId); } catch {} });
dom.svg.addEventListener("pointerleave", () => { dragTarget = null; });

for (const key of ["partWidth", "partHeight", "fovX", "fovY", "fovWidth", "fovHeight", "snapToGrid"]) {
  document.getElementById(key).addEventListener("input", () => { state.autoFitSummary = ""; regenerate(); });
}
document.getElementById("shareTerminals").addEventListener("input", () => { readGlobalInputs(); buildCircuitControls(); state.autoFitSummary = ""; regenerate(); });
document.getElementById("circuitCount").addEventListener("input", () => { readGlobalInputs(); buildCircuitControls(); state.autoFitSummary = ""; regenerate(); });
dom.activeTerminal.addEventListener("change", () => { state.activeTerminal = dom.activeTerminal.value; renderSvg(); });
document.getElementById("regenerateLayout").addEventListener("click", () => { state.autoFitSummary = ""; regenerate(); });
document.getElementById("autoFitLayout").addEventListener("click", autoFitLayout);
document.getElementById("exportSvg").addEventListener("click", exportSvg);
document.getElementById("exportJson").addEventListener("click", exportJson);

function exportSvg() {
  const clone = dom.svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  downloadFile("serpentine-circuit-layout.svg", new XMLSerializer().serializeToString(clone), "image/svg+xml");
}

function exportJson() {
  const payload = {
    units: "millimeters",
    generatedAt: new Date().toISOString(),
    part: partRect(),
    fov: fovRect(),
    snapToGrid: state.snapToGrid,
    shareTerminals: state.shareTerminals,
    terminalPadRadiusMm: TERMINAL_PAD_RADIUS,
    autoFitSummary: state.autoFitSummary,
    circuits: state.results.map(r => ({ index: r.index + 1, valid: r.valid, color: r.color, parameters: r.config, rails: r.rails, lanes: r.lanes, points: r.points, validation: r.checks, lengthMm: r.length, lengthM: r.valid ? round(r.length / 1000) : null, message: r.message }))
  };
  downloadFile("serpentine-circuit-layout.json", JSON.stringify(payload, null, 2), "application/json");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

writeGlobalInputs();
buildCircuitControls();
regenerate();

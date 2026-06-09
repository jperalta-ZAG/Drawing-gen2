const MAX_CIRCUITS = 5;
const EPS = 1e-7;
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
  activeTerminal: "0:p1",
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
  statusPill: document.getElementById("statusPill"),
  canvasMessage: document.getElementById("canvasMessage")
};

let dragTarget = null;

function readGlobalInputs() {
  for (const key of ["partWidth", "partHeight", "fovX", "fovY", "fovWidth", "fovHeight"]) {
    state[key] = numberValue(document.getElementById(key), state[key]);
  }
  state.circuitCount = Number(document.getElementById("circuitCount").value);
  state.snapToGrid = document.getElementById("snapToGrid").checked;
  state.activeTerminal = dom.activeTerminal.value || state.activeTerminal;
  document.getElementById("circuitCountValue").textContent = state.circuitCount;
}

function numberValue(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function writeGlobalInputs() {
  for (const key of ["partWidth", "partHeight", "fovX", "fovY", "fovWidth", "fovHeight"]) {
    document.getElementById(key).value = state[key];
  }
  document.getElementById("circuitCount").value = state.circuitCount;
  document.getElementById("snapToGrid").checked = state.snapToGrid;
  document.getElementById("circuitCountValue").textContent = state.circuitCount;
}

function buildCircuitControls() {
  dom.controls.innerHTML = "";
  dom.activeTerminal.innerHTML = "";
  for (let i = 0; i < state.circuitCount; i++) {
    const optionP1 = new Option(`Circuit ${i + 1} P1`, `${i}:p1`);
    const optionP2 = new Option(`Circuit ${i + 1} P2`, `${i}:p2`);
    dom.activeTerminal.add(optionP1);
    dom.activeTerminal.add(optionP2);

    const card = dom.template.content.firstElementChild.cloneNode(true);
    card.dataset.index = String(i);
    card.querySelector("summary strong").textContent = `Circuit ${i + 1}`;
    card.querySelector("summary small").textContent = "independent wire";
    card.querySelector(".swatch").style.background = state.circuits[i].color;
    for (const input of card.querySelectorAll("input[data-key]")) {
      const key = input.dataset.key;
      if (key === "p1x") input.value = round(state.circuits[i].p1.x);
      else if (key === "p1y") input.value = round(state.circuits[i].p1.y);
      else if (key === "p2x") input.value = round(state.circuits[i].p2.x);
      else if (key === "p2y") input.value = round(state.circuits[i].p2.y);
      else input.value = state.circuits[i][key];
      input.addEventListener("input", () => {
        readCircuitInput(i, input);
        regenerate();
      });
    }
    dom.controls.append(card);
  }
  if (![...dom.activeTerminal.options].some(o => o.value === state.activeTerminal)) {
    state.activeTerminal = "0:p1";
  }
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
  const card = dom.controls.querySelector(`[data-index="${i}"]`);
  if (card) card.querySelector(".swatch").style.background = circuit.color;
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
  renderInspector();
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
  const separation = config.minDistanceToOtherWires + config.wireVisualThickness;
  const verticalOffsets = index === 0 ? [0] : [index * separation, (index + 1) * separation, (index - 0.5) * separation];
  const lateralSigns = index === 0 ? [0] : [-1, 1, 0];
  const errors = [];

  for (const offset of verticalOffsets) {
    for (const sign of lateralSigns) {
      const topReturnY = fov.yMax + config.topReturnClearance + offset;
      const bottomReturnY = fov.yMin - config.bottomReturnClearance - offset;
      const laneMin = fov.xMin - config.leftClearance + sign * offset;
      const laneMax = fov.xMax + config.rightClearance + sign * offset;
      const attempt = buildCandidate(config, index, { topReturnY, bottomReturnY, laneMin, laneMax }, usable, fov, obstacles);
      if (attempt.valid) return attempt;
      errors.push(...attempt.errors);
    }
  }

  return invalidResult(index, config, uniqueErrors(errors).at(0) || "Circuit cannot be generated without overlapping another circuit or leaving the part boundary.");
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

  let body = generateBody(lanes, rails.bottomReturnY, rails.topReturnY);
  const p1 = snapPoint(config.p1, config.pitch, usable);
  const p2 = snapPoint(config.p2, config.pitch, usable);
  config.p1 = p1;
  config.p2 = p2;

  const p1Ok = pointInside(p1, usable);
  const p2Ok = pointInside(p2, usable);
  addCheck(checks, p1Ok, "P1 is inside usable part", pointLabel(p1));
  addCheck(checks, p2Ok, "P2 is inside usable part", pointLabel(p2));
  if (!p1Ok || !p2Ok) return invalidResult(index, config, "P1 and P2 terminals must be inside the usable part boundary.", checks, rails, lanes);

  const entry = manhattanConnector(p1, body[0], rails, fov);
  const exit = manhattanConnector(body[body.length - 1], p2, rails, fov);
  const points = simplifyPoints([...entry, ...body.slice(1), ...exit.slice(1)]);
  const segments = pointsToSegments(points);

  runGeometryChecks(checks, points, segments, usable, fov, config, obstacles);
  const valid = checks.every(c => c.pass);
  const message = valid ? "Circuit generated successfully." : firstFailure(checks) || "Circuit cannot be generated without overlapping another circuit or leaving the part boundary.";
  if (!valid && obstacles.length) return invalidResult(index, config, "Circuit cannot be generated without overlapping another circuit or leaving the part boundary.", checks, rails, lanes);
  return { valid, index, color: config.color, config: cloneConfig(config), points: valid ? points : [], segments: valid ? segments : [], lanes, rails, checks, length: valid ? polylineLength(points) : 0, message };
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

function generateBody(lanes, bottomY, topY) {
  const points = [{ x: lanes[0], y: bottomY }, { x: lanes[0], y: topY }];
  for (let i = 1; i < lanes.length; i++) {
    const currentRail = i % 2 === 1 ? topY : bottomY;
    const oppositeRail = i % 2 === 1 ? bottomY : topY;
    points.push({ x: lanes[i], y: currentRail }, { x: lanes[i], y: oppositeRail });
  }
  return simplifyPoints(points);
}

function manhattanConnector(from, to, rails, fov) {
  const direct = simplifyPoints([from, { x: to.x, y: from.y }, to]);
  if (pointsToSegments(direct).every(s => horizontalSafe(s, fov))) return direct;
  const railsByDistance = [rails.topReturnY, rails.bottomReturnY].sort((a, b) => Math.abs(a - from.y) - Math.abs(b - from.y));
  for (const railY of railsByDistance) {
    const routed = simplifyPoints([from, { x: from.x, y: railY }, { x: to.x, y: railY }, to]);
    if (pointsToSegments(routed).every(s => horizontalSafe(s, fov))) return routed;
  }
  return direct;
}

function runGeometryChecks(checks, points, segments, usable, fov, config, obstacles) {
  const orthogonal = segments.every(s => isHorizontal(s) || isVertical(s));
  addCheck(checks, orthogonal, "Every segment is horizontal or vertical", `${segments.length} segment(s)`);
  const horizontalClear = segments.filter(isHorizontal).every(s => horizontalSafe(s, fov));
  addCheck(checks, horizontalClear, "Horizontal segments avoid the FoV interior", "Vertical segments may pass through the FoV.");
  const notOnBoundary = segments.filter(isHorizontal).every(s => Math.abs(s.a.y - fov.yMin) > EPS && Math.abs(s.a.y - fov.yMax) > EPS);
  addCheck(checks, notOnBoundary, "No horizontal segment lies on FoV top or bottom boundary", `FoV y=${round(fov.yMin)}..${round(fov.yMax)}`);
  const boundary = points.every(p => pointInside(p, usable));
  addCheck(checks, boundary, "Every generated point remains inside usable part", `${points.length} point(s)`);
  const selfClear = segments.every((a, i) => segments.every((b, j) => i >= j || adjacentSegments(i, j) || !segmentsCollide(a, b, config.minDistanceToOtherWires)));
  addCheck(checks, selfClear, "Non-adjacent segments in this circuit do not overlap or cross", "Adjacent segments may meet at shared endpoints.");
  const obstacleClear = segments.every(a => obstacles.every(b => !segmentsCollide(a, b, config.minDistanceToOtherWires)));
  addCheck(checks, obstacleClear, "Circuit is separated from previously generated circuits", `minimum ${round(config.minDistanceToOtherWires)} mm`);
}

function addCheck(checks, pass, title, detail) { checks.push({ pass: Boolean(pass), title, detail }); }
function firstFailure(checks) { return checks.find(c => !c.pass)?.title; }
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
      if ((Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS) || (Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS)) {
        simplified.splice(simplified.length - 2, 1);
      } else break;
    }
  }
  return simplified;
}

function polylineLength(points) {
  return round(pointsToSegments(points).reduce((sum, s) => sum + Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y), 0));
}

function segmentsCollide(a, b, clearance) {
  return segmentDistance(a, b) < clearance - EPS || segmentsIntersect(a, b);
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

function snapPoint(point, pitch, usable) {
  if (!state.snapToGrid || !(pitch > 0)) return { x: round(point.x), y: round(point.y) };
  return { x: round(clamp(Math.round(point.x / pitch) * pitch, usable.xMin, usable.xMax)), y: round(clamp(Math.round(point.y / pitch) * pitch, usable.yMin, usable.yMax)) };
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
    drawTerminal(result.index, "p1", state.circuits[result.index].p1, result.color);
    drawTerminal(result.index, "p2", state.circuits[result.index].p2, result.color);
  }

  const failures = state.results.filter(r => !r.valid);
  dom.canvasMessage.hidden = failures.length === 0;
  dom.canvasMessage.textContent = failures.map(r => `Circuit ${r.index + 1}: ${r.message}`).join(" ");
  dom.statusPill.textContent = failures.length ? `${failures.length} circuit issue${failures.length > 1 ? "s" : ""}` : "All checks passing";
  dom.statusPill.classList.toggle("error", failures.length > 0);
}

function drawTerminal(index, key, point, color) {
  const active = state.activeTerminal === `${index}:${key}`;
  const group = svgEl("g", { class: `terminal ${active ? "active" : ""}`, "data-index": index, "data-key": key });
  group.append(svgEl("circle", { cx: point.x, cy: point.y, r: 1.8, fill: key === "p1" ? color : "white", stroke: color, "stroke-width": 0.8 }));
  group.append(textEl(point.x + 2.2, point.y - 2.2, `${key.toUpperCase()} C${index + 1}`, color));
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
  c[key] = snapPoint({ x: clamp(point.x, usable.xMin, usable.xMax), y: clamp(point.y, usable.yMin, usable.yMax) }, c.pitch, usable);
  state.activeTerminal = `${index}:${key}`;
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
  document.getElementById(key).addEventListener("input", regenerate);
}
document.getElementById("circuitCount").addEventListener("input", () => { readGlobalInputs(); buildCircuitControls(); regenerate(); });
dom.activeTerminal.addEventListener("change", () => { state.activeTerminal = dom.activeTerminal.value; renderSvg(); });
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
    circuits: state.results.map(r => ({ index: r.index + 1, valid: r.valid, color: r.color, parameters: r.config, rails: r.rails, lanes: r.lanes, points: r.points, validation: r.checks, lengthMm: r.length, message: r.message }))
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

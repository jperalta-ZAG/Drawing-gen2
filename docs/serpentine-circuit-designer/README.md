# Orthogonal Serpentine Copper Circuit Designer

A static browser-based engineering layout tool for designing orthogonal serpentine copper-wire circuits inside a rectangular automotive part and around a Field of View (FoV) area.

The app is intentionally built with vanilla HTML, CSS, and JavaScript so it can run directly from GitHub Pages with no backend, no build step, and no user installation.

## What the tool does

- Draws the black rectangular part boundary in millimeters.
- Draws the dashed red FoV rectangle.
- Generates one to five independent colored serpentine copper-wire circuits.
- Uses vertical wire legs that may pass through the FoV.
- Routes all horizontal return segments on safe rails above or below the FoV, offset by the configured top and bottom clearances.
- Lets engineers place P1 and P2 terminals anywhere inside the usable part boundary; the router then attempts a valid Manhattan connection.
- Supports independent terminals or a shared-terminal mode where all circuits intentionally share common P1/P2 nodes.
- Provides an **Auto-fit layout** action that deterministically expands or repositions the design envelope when the selected circuit count needs more clearance.
- Regenerates the layout automatically after parameter changes, and also includes a manual **Regenerate** button.
- Validates orthogonality, FoV avoidance, part-boundary clearance, and wire-to-wire separation.
- Shows a dedicated **Circuit length results** panel with each wire length in millimeters/meters, point count, segment count, status, and the total valid wire length.
- Exports the drawing as SVG and exports all parameters, generated points, validations, and circuit lengths as JSON.
- Displays every generated polyline point in millimeters for inspection.

## Running from GitHub Pages

After GitHub Pages is enabled, open the repository's Pages URL in a browser:

```text
https://<your-github-username>.github.io/Drawing-gen2/
```

The `/docs/index.html` page redirects to the app folder, and the direct app URL is:

```text
https://<your-github-username>.github.io/Drawing-gen2/serpentine-circuit-designer/
```

No local server or installation is required for end users. The app is served from the repository `/docs/serpentine-circuit-designer` subfolder after `/docs` is selected for GitHub Pages.

## Enable GitHub Pages

1. Push this repository to GitHub.
2. In GitHub, open **Settings** for the repository.
3. Select **Pages** in the left navigation.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Select the branch that contains these files, for example `main`.
6. Select the `/docs` folder as the publishing folder.
7. Save the settings.
8. Wait for GitHub to publish the site, then open the URL shown in the Pages settings.

## Local development preview

The app can be opened directly by double-clicking `docs/serpentine-circuit-designer/index.html`. If you prefer a local static preview server while editing, run:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/docs/serpentine-circuit-designer/
```

This local preview is optional and is not required for normal use on GitHub Pages.

## New workflow controls

### Free P1/P2 terminal placement

Choose an active terminal in the sidebar and click the SVG canvas, or drag a visible P1/P2 handle. Terminals are no longer assumed to be on opposite sides of the part. For example, P1 and P2 may both be placed on the left side near each other. If the connection cannot be routed without violating FoV, boundary, or wire-spacing rules, the validation panel explains the route failure while the terminal location remains under engineer control.

### Shared terminals between circuits

Enable **Share terminals between circuits** in the Global controls panel when multiple circuits should use common P1/P2 electrical nodes.

When enabled:

- All active circuits use the same P1 coordinate and the same P2 coordinate.
- Dragging shared P1 or shared P2 updates the terminals for every circuit.
- The SVG displays one shared marker per terminal with labels such as `P1 C1+C2`.
- Circuits may touch only inside the dashed shared terminal pad area; outside that pad they must separate and pass the configured minimum wire-to-wire distance.

Disable the option to return to independent per-circuit P1/P2 terminals. Independent labels identify each circuit, such as `P1 C1` and `P2 C2`.

### Auto-fit layout

Click **Auto-fit layout** when validation reports that a circuit cannot fit. The app deterministically calculates the clearance needed for the selected circuit count, pitch, wire thickness, wall distance, and wire-to-wire spacing. It may:

- Increase part width and/or part height.
- Move the FoV minimally to create bottom or left-side return/lane offset clearance.
- Increase right lane clearance when the selected circuit count needs more global pitch-grid lanes.
- Increase pitch to at least the configured wire spacing plus visual wire thickness.
- Clamp terminals back into the resized usable part.

After auto-fit, the layout regenerates and the sidebar shows a summary of every change. Auto-fit never silences validation; the resulting geometry must still pass the same checks.

### Circuit length results

The **Circuit length results** panel is visible below the drawing canvas. It shows:

- Valid/invalid status per circuit.
- Wire length in millimeters and meters for each valid circuit.
- Point count and segment count.
- Failure reason for invalid circuits.
- Total combined length for all valid circuits.

Lengths are computed from the generated orthogonal polyline using Manhattan distance:

```text
length = sum(abs(x2 - x1) + abs(y2 - y1))
```

## Manual geometry test

Use the following parameter values to verify the required reference behavior:

| Parameter | Value |
| --- | ---: |
| Part width | `100` mm |
| Part height | `100` mm |
| FoV X | `25` mm |
| FoV Y | `25` mm |
| FoV width | `50` mm |
| FoV height | `50` mm |
| Pitch | `5` mm |
| Top return clearance | `2` mm |
| Bottom return clearance | `2` mm |
| Left clearance | `0` mm |
| Right clearance | `0` mm |
| Minimum wall distance | `2` mm |

Expected results:

- FoV spans `x = 25..75` and `y = 25..75`.
- Top return rail is `77` mm.
- Bottom return rail is `23` mm.
- Horizontal turns are drawn at `y = 77` and `y = 23`.
- No horizontal turn is drawn on `y = 75` or `y = 25`.
- Vertical lanes may appear at `x = 25, 30, 35, ... 75`.
- Validation should show that all segments are orthogonal, horizontal segments avoid the FoV, and generated points stay inside the usable part.

For multiple circuits, the generator first splits one shared pitch grid into contiguous lane blocks. For example, with `pitch = 5` and two circuits, Circuit 1 can use `25, 30, 35, ...` while Circuit 2 continues at `55, 60, 65, ...`; the final spacing between neighboring vertical wires remains 5 mm across all circuits.

The point-by-point inspector can be used to confirm that the generated body follows the expected sequence, such as:

```text
(25,23) -> (25,77) -> (30,77) -> (30,23) -> (35,23) -> (35,77) ...
```

## Acceptance-test checklist

1. **P2 near P1:** Select `Circuit 1 P2`, click or drag it near `P1 C1` on the left side, and confirm that the terminal remains there. The app should either draw a valid route or display a route-specific validation message.
2. **Shared terminals:** Set the circuit count to `2`, enable **Share terminals between circuits**, then drag P1 or P2. Both circuits should use the same shared marker and separate outside the terminal pad.
3. **Independent terminals:** Disable **Share terminals between circuits**. Circuit 1 and Circuit 2 should again show independent draggable P1/P2 labels.
4. **Auto-fit layout:** Reduce part size or increase circuit count until a circuit fails, then click **Auto-fit layout**. Review the auto-fit summary and validation results.
5. **Length results:** Generate at least one valid circuit and read the length in the **Circuit length results** panel.

## Files

- `docs/index.html` — GitHub Pages landing page that redirects to the app.
- `docs/.nojekyll` — Keeps GitHub Pages from applying Jekyll processing.
- `docs/serpentine-circuit-designer/index.html` — static page markup and UI controls.
- `docs/serpentine-circuit-designer/style.css` — responsive modern sidebar, canvas, validation, length-results, and inspector styling.
- `docs/serpentine-circuit-designer/app.js` — client-side computational geometry, SVG rendering, terminal dragging, shared terminal pads, auto-fit, validation, and exports.

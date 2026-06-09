# Orthogonal Serpentine Copper Circuit Designer

A static browser-based engineering layout tool for designing orthogonal serpentine copper-wire circuits inside a rectangular automotive part and around a Field of View (FoV) area.

The app is intentionally built with vanilla HTML, CSS, and JavaScript so it can run directly from GitHub Pages with no backend, no build step, and no user installation.

## What the tool does

- Draws the black rectangular part boundary in millimeters.
- Draws the dashed red FoV rectangle.
- Generates one to five independent colored serpentine copper-wire circuits.
- Uses vertical wire legs that may pass through the FoV.
- Routes all horizontal return segments on safe rails above or below the FoV, offset by the configured top and bottom clearances.
- Provides draggable/click-placeable P1 and P2 terminals for every circuit.
- Regenerates the layout automatically after parameter changes.
- Validates orthogonality, FoV avoidance, part-boundary clearance, and wire-to-wire separation.
- Exports the drawing as SVG and exports all parameters, generated points, validations, and circuit lengths as JSON.
- Displays every generated polyline point in millimeters for inspection.

## Running from GitHub Pages

After GitHub Pages is enabled, open the repository's Pages URL in a browser:

```text
https://<your-github-username>.github.io/Drawing-gen2/
```

No local server or installation is required for end users. The page is a static website served from the repository root.

## Enable GitHub Pages

1. Push this repository to GitHub.
2. In GitHub, open **Settings** for the repository.
3. Select **Pages** in the left navigation.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Select the branch that contains these files, for example `main`.
6. Select the root folder `/` as the publishing folder.
7. Save the settings.
8. Wait for GitHub to publish the site, then open the URL shown in the Pages settings.

## Local development preview

The app can be opened directly by double-clicking `index.html`. If you prefer a local static preview server while editing, run:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

This local preview is optional and is not required for normal use on GitHub Pages.

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

The point-by-point inspector can be used to confirm that the generated body follows the expected sequence, such as:

```text
(25,23) -> (25,77) -> (30,77) -> (30,23) -> (35,23) -> (35,77) ...
```

## Files

- `index.html` — static page markup and UI controls.
- `style.css` — responsive modern sidebar, canvas, validation, and inspector styling.
- `app.js` — client-side computational geometry, SVG rendering, terminal dragging, validation, and exports.

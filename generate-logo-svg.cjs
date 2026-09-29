const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

function generateLogoSvg() {
  // Canvas 512 x 512, Center at (256, 256)
  // Let's set dimensions precisely matching the reference:
  // D = 142 (half-length between end-cap centers)
  // R = 54 (radius of centerline)
  // W = 38 (stroke width)
  // Gap G = 10 (total white cutout width = W + 2*G = 58)
  const D = 140;
  const R = 54;
  const W = 38;
  const maskW = W + 20; // 58px

  // Semicircle arc length along the path:
  // In local frame:
  // Semicircle right at (+D, 0): from (+D, -R) to (+D, +R) via (+D + R, 0)
  // Semicircle left at (-D, 0): from (-D, +R) to (-D, -R) via (-D - R, 0)
  const loopPath = `M ${-D} ${-R} L ${D} ${-R} A ${R} ${R} 0 0 1 ${D} ${R} L ${-D} ${R} A ${R} ${R} 0 0 1 ${-D} ${-R} Z`;

  // An overpass centered at local point (px, py) with direction along X axis:
  // Length = 70px (from px - 35 to px + 35)
  const overpass = (px, py) => `M ${px - 38} ${py} L ${px + 38} ${py}`;

  // Loop A (rotated +45 deg):
  // Lobe at Top-Left is (-D, 0), Lobe at Bottom-Right is (+D, 0).
  // Crossings on Loop A:
  // Top: at (-R, -R) -> Loop A is OVER here!
  // Bottom: at (R, R) -> Loop A is OVER here!
  // Right: at (R, -R) -> Loop B is OVER here.
  // Left: at (-R, R) -> Loop B is OVER here.

  // Loop B (rotated -45 deg):
  // Lobe at Top-Right is (+D, 0), Lobe at Bottom-Left is (-D, 0).
  // Crossings on Loop B:
  // Right: at (R, R) -> Loop B is OVER here!
  // Left: at (-R, -R) -> Loop B is OVER here!
  // Top: at (R, -R) -> Loop A is OVER.
  // Bottom: at (-R, R) -> Loop A is OVER.

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <!-- Pure White Background -->
  <rect width="512" height="512" fill="#ffffff" />
  
  <g transform="translate(256, 256)">
    <!-- 1. Base Loop B (drawn first) -->
    <g transform="rotate(-45)">
      <path d="${loopPath}" fill="none" stroke="#000000" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- 2. Base Loop A (drawn second) -->
    <g transform="rotate(45)">
      <path d="${loopPath}" fill="none" stroke="#000000" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- 3. Overpasses for Loop B (at Right and Left): -->
    <g transform="rotate(-45)">
      <!-- Right Overpass: at local (R, R) -->
      <path d="${overpass(R, R)}" fill="none" stroke="#ffffff" stroke-width="${maskW}" stroke-linecap="butt" />
      <path d="${overpass(R, R)}" fill="none" stroke="#000000" stroke-width="${W}" stroke-linecap="butt" />

      <!-- Left Overpass: at local (-R, -R) -->
      <path d="${overpass(-R, -R)}" fill="none" stroke="#ffffff" stroke-width="${maskW}" stroke-linecap="butt" />
      <path d="${overpass(-R, -R)}" fill="none" stroke="#000000" stroke-width="${W}" stroke-linecap="butt" />
    </g>

    <!-- 4. Overpasses for Loop A (at Top and Bottom): -->
    <g transform="rotate(45)">
      <!-- Top Overpass: at local (-R, -R) -->
      <path d="${overpass(-R, -R)}" fill="none" stroke="#ffffff" stroke-width="${maskW}" stroke-linecap="butt" />
      <path d="${overpass(-R, -R)}" fill="none" stroke="#000000" stroke-width="${W}" stroke-linecap="butt" />

      <!-- Bottom Overpass: at local (R, R) -->
      <path d="${overpass(R, R)}" fill="none" stroke="#ffffff" stroke-width="${maskW}" stroke-linecap="butt" />
      <path d="${overpass(R, R)}" fill="none" stroke="#000000" stroke-width="${W}" stroke-linecap="butt" />
    </g>
  </g>
</svg>`;

  return svg;
}

const svg = generateLogoSvg();
fs.writeFileSync(path.join(__dirname, 'test-logo.svg'), svg);
console.log('test-logo.svg updated');

sharp(Buffer.from(svg))
  .resize(512, 512)
  .png()
  .toFile(path.join(__dirname, 'test-logo.png'))
  .then(() => console.log('test-logo.png updated successfully'))
  .catch(console.error);

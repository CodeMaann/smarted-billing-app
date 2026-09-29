const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

function getLogoSvg({ transparent = false } = {}) {
  const D = 145;
  const R = 42;
  const W = 40;
  const maskW = W + 16; // 56px white gap (8px gap on each side)

  const loopPath = `M ${-D} ${-R} L ${D} ${-R} A ${R} ${R} 0 0 1 ${D} ${R} L ${-D} ${R} A ${R} ${R} 0 0 1 ${-D} ${-R} Z`;
  const overpass = (px, py) => `M ${px - 34} ${py} L ${px + 34} ${py}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  ${transparent ? '' : '<rect width="512" height="512" fill="#ffffff" />'}
  
  <g transform="translate(256, 256)">
    <!-- 1. Base Loop B (rotated -45 deg: lobes at Top-Right & Bottom-Left) -->
    <g transform="rotate(-45)">
      <path d="${loopPath}" fill="none" stroke="#000000" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- 2. Base Loop A (rotated 45 deg: lobes at Top-Left & Bottom-Right) -->
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
}

async function run() {
  const svgWhiteBg = getLogoSvg({ transparent: false });
  const publicDir = path.join(__dirname, 'public');

  // Save the main app-logo.svg
  fs.writeFileSync(path.join(publicDir, 'app-logo.svg'), svgWhiteBg);
  console.log('Saved public/app-logo.svg');

  const svgBuffer = Buffer.from(svgWhiteBg);

  // 1. High resolution standard logo
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'app-logo.png'));
  console.log('Generated app-logo.png (512x512)');

  // 2. PWA Standard 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // 3. PWA Standard 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // 4. Apple Touch Icon 180x180
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 5. Maskable icon: Needs safe padding (80% scale on 512 canvas with white background)
  const innerLogo = await sharp(svgBuffer)
    .resize(410, 410)
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{ input: innerLogo, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Generated pwa-maskable-512x512.png');

  // 6. Favicon 32x32 and 16x16
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  
  await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(path.join(publicDir, 'favicon-16x16.png'));
  
  // Also create favicon.ico
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));
  console.log('Generated favicons');

  // Also copy to dist folder if dist exists
  const distDir = path.join(__dirname, 'dist');
  if (fs.existsSync(distDir)) {
    fs.copyFileSync(path.join(publicDir, 'app-logo.svg'), path.join(distDir, 'app-logo.svg'));
    fs.copyFileSync(path.join(publicDir, 'app-logo.png'), path.join(distDir, 'app-logo.png'));
    fs.copyFileSync(path.join(publicDir, 'pwa-512x512.png'), path.join(distDir, 'pwa-512x512.png'));
    fs.copyFileSync(path.join(publicDir, 'pwa-192x192.png'), path.join(distDir, 'pwa-192x192.png'));
    fs.copyFileSync(path.join(publicDir, 'apple-touch-icon.png'), path.join(distDir, 'apple-touch-icon.png'));
    fs.copyFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), path.join(distDir, 'pwa-maskable-512x512.png'));
    fs.copyFileSync(path.join(publicDir, 'favicon-32x32.png'), path.join(distDir, 'favicon-32x32.png'));
    fs.copyFileSync(path.join(publicDir, 'favicon-16x16.png'), path.join(distDir, 'favicon-16x16.png'));
    fs.copyFileSync(path.join(publicDir, 'favicon.ico'), path.join(distDir, 'favicon.ico'));
    console.log('Synced to dist');
  }

  console.log('All icons and brand assets generated successfully!');
}

run().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

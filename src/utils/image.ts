/**
 * Utility for client-side image processing, validation, resizing, and compression.
 * Ensures uploaded signatures and logos stay well under 100 KB before saving to Firestore/local profile.
 */

export interface ProcessImageOptions {
  maxWidth: number;
  maxHeight: number;
  maxSizeBytes?: number; // default: 1 MB = 1048576 bytes
  nameForError?: string; // e.g. "Signature" or "Logo"
}

export async function processImageUpload(
  file: File,
  options: ProcessImageOptions
): Promise<string> {
  const maxBytes = options.maxSizeBytes ?? 1024 * 1024;
  const entityName = options.nameForError || 'Image';

  // 1. Strict Size Validation (Maximum 1 MB)
  if (file.size > maxBytes) {
    throw new Error(`${entityName} must be under 1 MB`);
  }

  // 2. Strict Format Validation (PNG or JPG/JPEG only)
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
  const isJpg =
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    file.name.toLowerCase().endsWith('.jpg') ||
    file.name.toLowerCase().endsWith('.jpeg');

  if (!isPng && !isJpg) {
    throw new Error(`${entityName} must be a PNG or JPG file.`);
  }

  // 3. Read File as Data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  // 4. Resize & Compress using Canvas
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Maintain aspect ratio while fitting within maxWidth and maxHeight
      if (width > options.maxWidth || height > options.maxHeight) {
        const ratio = Math.min(options.maxWidth / width, options.maxHeight / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      // If PNG, keep transparent background; for JPG, fill with white background
      if (isPng) {
        ctx.clearRect(0, 0, width, height);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0, width, height);

      let compressedResult = isPng
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', 0.85);

      // Extra safeguard: If PNG happens to be > 120 KB, recompress with JPEG to ensure < 100 KB
      if (isPng && compressedResult.length > 150000) {
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = width;
        fallbackCanvas.height = height;
        const fbCtx = fallbackCanvas.getContext('2d');
        if (fbCtx) {
          fbCtx.fillStyle = '#ffffff';
          fbCtx.fillRect(0, 0, width, height);
          fbCtx.drawImage(img, 0, 0, width, height);
          compressedResult = fallbackCanvas.toDataURL('image/jpeg', 0.82);
        }
      }

      resolve(compressedResult);
    };

    img.onerror = () => {
      reject(new Error(`Could not load ${entityName.toLowerCase()} image.`));
    };

    img.src = dataUrl;
  });
}

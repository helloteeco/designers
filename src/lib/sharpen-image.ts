/**
 * Client-side image sharpening using canvas convolution.
 * Applies an unsharp-mask style kernel to enhance edges and text legibility
 * in floor plan images without altering colors or content.
 */

/**
 * Sharpen an image blob/file and return a new data URL with enhanced clarity.
 * Uses a 3×3 sharpening convolution kernel.
 *
 * @param file - The image File or Blob to sharpen
 * @param strength - Sharpening strength (0.5 = subtle, 1.0 = moderate, 2.0 = strong). Default 1.0
 * @returns Promise<string> - data URL of the sharpened image
 */
export async function sharpenImage(
  file: File | Blob,
  strength: number = 1.0
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Draw original
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  const src = imageData.data;

  // Create output buffer
  const output = new Uint8ClampedArray(src.length);

  // 3×3 sharpening kernel (unsharp mask style)
  // Center weight = 1 + 4*strength, neighbors = -strength
  const center = 1 + 4 * strength;
  const edge = -strength;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        // Apply kernel to R, G, B channels (skip alpha)
        const val =
          src[idx + c] * center +
          src[((y - 1) * width + x) * 4 + c] * edge +
          src[((y + 1) * width + x) * 4 + c] * edge +
          src[(y * width + (x - 1)) * 4 + c] * edge +
          src[(y * width + (x + 1)) * 4 + c] * edge;

        output[idx + c] = Math.max(0, Math.min(255, Math.round(val)));
      }
      // Preserve alpha
      output[idx + 3] = src[idx + 3];
    }
  }

  // Copy edge pixels unchanged
  for (let x = 0; x < width; x++) {
    const topIdx = x * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    for (let c = 0; c < 4; c++) {
      output[topIdx + c] = src[topIdx + c];
      output[botIdx + c] = src[botIdx + c];
    }
  }
  for (let y = 0; y < height; y++) {
    const leftIdx = (y * width) * 4;
    const rightIdx = (y * width + (width - 1)) * 4;
    for (let c = 0; c < 4; c++) {
      output[leftIdx + c] = src[leftIdx + c];
      output[rightIdx + c] = src[rightIdx + c];
    }
  }

  // Apply contrast boost for text readability (subtle)
  const contrastFactor = 1.1; // 10% contrast increase
  const mid = 128;
  for (let i = 0; i < output.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const val = (output[i + c] - mid) * contrastFactor + mid;
      output[i + c] = Math.max(0, Math.min(255, Math.round(val)));
    }
  }

  const outData = new ImageData(output, width, height);
  ctx.putImageData(outData, 0, 0);

  // Return as high-quality PNG for floor plans (preserves text sharpness)
  return canvas.toDataURL("image/png");
}

/**
 * Check if an image appears blurry using Laplacian variance.
 * Returns true if the image likely needs sharpening.
 */
export function isLikelyBlurry(imageData: ImageData): boolean {
  const { data, width, height } = imageData;

  // Convert to grayscale and compute Laplacian variance
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      // Grayscale value
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      // Laplacian (4-connected)
      const topGray = 0.299 * data[((y - 1) * width + x) * 4] + 0.587 * data[((y - 1) * width + x) * 4 + 1] + 0.114 * data[((y - 1) * width + x) * 4 + 2];
      const botGray = 0.299 * data[((y + 1) * width + x) * 4] + 0.587 * data[((y + 1) * width + x) * 4 + 1] + 0.114 * data[((y + 1) * width + x) * 4 + 2];
      const leftGray = 0.299 * data[(y * width + (x - 1)) * 4] + 0.587 * data[(y * width + (x - 1)) * 4 + 1] + 0.114 * data[(y * width + (x - 1)) * 4 + 2];
      const rightGray = 0.299 * data[(y * width + (x + 1)) * 4] + 0.587 * data[(y * width + (x + 1)) * 4 + 1] + 0.114 * data[(y * width + (x + 1)) * 4 + 2];

      const laplacian = topGray + botGray + leftGray + rightGray - 4 * gray;
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  // Threshold: images with Laplacian variance < 500 are likely blurry
  // Floor plans with clear text typically have variance > 1000
  return variance < 500;
}

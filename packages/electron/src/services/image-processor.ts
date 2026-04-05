import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const TEMU_MIN_SIZE = 800;
const TEMU_MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB

export interface ProcessedImage {
  outputPath: string;
  width: number;
  height: number;
  fileSize: number;
}

/**
 * Remove background from an image using @imgly/background-removal-node
 * Loaded dynamically to avoid bundling issues
 */
export async function removeBackground(inputPath: string, outputPath: string): Promise<string> {
  // Dynamic import to avoid loading heavy ONNX model on startup
  const { removeBackground: removeBg } = await import('@imgly/background-removal-node');

  const inputBuffer = fs.readFileSync(inputPath);
  const blob = new Blob([inputBuffer]);
  const result = await removeBg(blob);

  const arrayBuffer = await result.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * Validate and optimize image for Temu requirements
 * - Min size: 800x800
 * - Max file size: 3MB
 * - Format: JPG or PNG
 */
export async function optimizeForTemu(
  inputPath: string,
  outputPath: string,
  format: 'jpg' | 'png' = 'jpg',
  quality = 85
): Promise<ProcessedImage> {
  let image = sharp(inputPath);
  const metadata = await image.metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // Resize if too small
  if (width < TEMU_MIN_SIZE || height < TEMU_MIN_SIZE) {
    const scale = Math.max(TEMU_MIN_SIZE / width, TEMU_MIN_SIZE / height);
    image = image.resize(Math.ceil(width * scale), Math.ceil(height * scale), {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });
  }

  // Convert to target format
  if (format === 'jpg') {
    image = image.jpeg({ quality });
  } else {
    image = image.png({ compressionLevel: 6 });
  }

  let buffer = await image.toBuffer();

  // If file is too large, reduce quality progressively
  if (format === 'jpg') {
    let currentQuality = quality;
    while (buffer.length > TEMU_MAX_FILE_SIZE && currentQuality > 30) {
      currentQuality -= 10;
      buffer = await sharp(inputPath)
        .jpeg({ quality: currentQuality })
        .toBuffer();
    }
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, buffer);

  const finalMetadata = await sharp(buffer).metadata();

  return {
    outputPath,
    width: finalMetadata.width || 0,
    height: finalMetadata.height || 0,
    fileSize: buffer.length,
  };
}

/**
 * Download image from URL to local path
 */
export async function downloadImage(url: string, outputPath: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

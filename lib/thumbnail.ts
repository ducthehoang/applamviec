export interface ExtractedMediaMeta {
  thumbnailBlob: Blob | null;
  thumbnailDataUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

/**
 * Tạo ảnh thu nhỏ WebP siêu nhẹ (< 50KB) ngay trên trình duyệt cho cả Ảnh và Video.
 * Giúp lưu vào Supabase Storage 1GB được hơn 20.000 file mà mở folder nhanh tức thì.
 */
export async function generateMediaThumbnail(
  file: File,
  maxDimension = 480
): Promise<ExtractedMediaMeta> {
  if (file.type.startsWith("image/")) {
    return extractImageMeta(file, maxDimension);
  }
  if (file.type.startsWith("video/")) {
    return extractVideoMeta(file, maxDimension);
  }
  return {
    thumbnailBlob: null,
    thumbnailDataUrl: null,
    width: null,
    height: null,
    durationSec: null,
  };
}

async function extractImageMeta(
  file: File,
  maxDim: number
): Promise<ExtractedMediaMeta> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const { targetW, targetH } = scaleDimensions(width, height, maxDim);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve({
          thumbnailBlob: null,
          thumbnailDataUrl: null,
          width,
          height,
          durationSec: null,
        });
        return;
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL("image/webp", 0.72);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          resolve({
            thumbnailBlob: blob,
            thumbnailDataUrl: dataUrl,
            width,
            height,
            durationSec: null,
          });
        },
        "image/webp",
        0.72
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        thumbnailBlob: null,
        thumbnailDataUrl: null,
        width: null,
        height: null,
        durationSec: null,
      });
    };
    img.src = objectUrl;
  });
}

async function extractVideoMeta(
  file: File,
  maxDim: number
): Promise<ExtractedMediaMeta> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    video.onloadedmetadata = () => {
      const seekTime = Math.min(1.0, Math.max(0.1, (video.duration || 1) * 0.1));
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      const width = video.videoWidth || null;
      const height = video.videoHeight || null;
      const durationSec = Number.isFinite(video.duration) ? video.duration : null;

      if (!width || !height) {
        cleanup();
        resolve({
          thumbnailBlob: null,
          thumbnailDataUrl: null,
          width,
          height,
          durationSec,
        });
        return;
      }

      const { targetW, targetH } = scaleDimensions(width, height, maxDim);
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        resolve({
          thumbnailBlob: null,
          thumbnailDataUrl: null,
          width,
          height,
          durationSec,
        });
        return;
      }

      ctx.drawImage(video, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL("image/webp", 0.7);
      canvas.toBlob(
        (blob) => {
          cleanup();
          resolve({
            thumbnailBlob: blob,
            thumbnailDataUrl: dataUrl,
            width,
            height,
            durationSec,
          });
        },
        "image/webp",
        0.7
      );
    };

    video.onerror = () => {
      cleanup();
      resolve({
        thumbnailBlob: null,
        thumbnailDataUrl: null,
        width: null,
        height: null,
        durationSec: null,
      });
    };

    video.src = objectUrl;
  });
}

function scaleDimensions(width: number, height: number, maxDim: number) {
  if (width <= maxDim && height <= maxDim) {
    return { targetW: width, targetH: height };
  }
  const ratio = width / height;
  if (width >= height) {
    return { targetW: maxDim, targetH: Math.max(1, Math.round(maxDim / ratio)) };
  }
  return { targetW: Math.max(1, Math.round(maxDim * ratio)), targetH: maxDim };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

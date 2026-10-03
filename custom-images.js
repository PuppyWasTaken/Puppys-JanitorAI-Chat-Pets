(() => {
  const maxFileBytes = 5 * 1024 * 1024;
  const maxDimension = 4096;
  function validateFile(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
    if (!file.size || file.size > maxFileBytes) throw new Error('Each image must be nonempty and no larger than 5 MB.');
  }
  async function decode(src) {
    const image = new Image();
    image.src = src;
    try { await image.decode(); }
    catch { throw new Error('This image could not be opened. Try a different file.'); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > maxDimension || image.naturalHeight > maxDimension) {
      throw new Error('Image dimensions must be between 1 and 4096 pixels on each side.');
    }
    return image;
  }
  async function readFile(file) {
    validateFile(file);
    const url = URL.createObjectURL(file);
    try {
      const image = await decode(url);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      // Re-encode static raster pixels; never persist executable formats or remote URLs.
      return { src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
    } finally { URL.revokeObjectURL(url); }
  }
  async function normalizeFrames(frames) {
    const images = await Promise.all(frames.map(decode));
    const width = Math.max(...images.map(image => image.naturalWidth));
    const height = Math.max(...images.map(image => image.naturalHeight));
    const scale = Math.min(1, 512 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    return images.map(image => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      context.drawImage(image, (canvas.width - w) / 2, canvas.height - h, w, h);
      return canvas.toDataURL('image/png');
    });
  }
  const api = { validateFile, readFile, normalizeFrames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.ChatBarPetImages = api;
})();

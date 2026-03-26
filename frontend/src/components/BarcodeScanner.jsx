import React, { useCallback, useEffect, useRef, useState } from 'react';

const WANTED_FORMATS = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'data_matrix', 'aztec', 'pdf417'];

/**
 * Preprocess an image file for OCR:
 *   1. Upscale so the longest side is at least 2000px (Tesseract needs large text)
 *   2. Convert to grayscale
 *   3. Stretch contrast (normalize to full 0-255 range)
 *   4. Binarize using Otsu's method (pure black/white — eliminates background noise)
 *
 * Returns a Blob (PNG) of the processed image.
 */
async function preprocessForOcr(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      // Scale up if image is small — Tesseract accuracy improves a lot above ~150 DPI equivalent
      const TARGET = 2000;
      const scale = img.width < TARGET && img.height < TARGET
        ? TARGET / Math.max(img.width, img.height)
        : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;

      // Pass 1: convert to grayscale, find min/max for contrast stretch
      const gray = new Uint8Array(w * h);
      let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) {
        const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        gray[i >> 2] = g;
        if (g < lo) lo = g;
        if (g > hi) hi = g;
      }

      // Pass 2: contrast stretch then build histogram for Otsu threshold
      const range = hi - lo || 1;
      const hist = new Array(256).fill(0);
      const stretched = new Uint8Array(w * h);
      for (let i = 0; i < gray.length; i++) {
        const s = Math.round(((gray[i] - lo) / range) * 255);
        stretched[i] = s;
        hist[s]++;
      }

      // Otsu's threshold
      const total = w * h;
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * hist[t];
      let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const v = wB * wF * (mB - mF) ** 2;
        if (v > maxVar) { maxVar = v; threshold = t; }
      }

      // Pass 3: write binarized (black text on white) back to imageData
      for (let i = 0; i < d.length; i += 4) {
        const v = stretched[i >> 2] < threshold ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // fallback to original
    img.src = url;
  });
}

/**
 * BarcodeScanner
 *
 * Props:
 *   onScan(code: string)          — called when a barcode/QR is decoded
 *   onTextFound(lines: string[])  — called with OCR text lines from an uploaded photo
 *   onError(msg: string)          — optional, called on unrecoverable camera errors
 *
 * When camera is unavailable (HTTP, permission denied) shows a photo-upload UI.
 * Uploaded photos are decoded for barcodes first; OCR runs in parallel and the
 * extracted text is passed to onTextFound regardless of whether a barcode was found.
 */
export default function BarcodeScanner({ onScan, onTextFound, onError }) {
  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const controlsRef = useRef(null);
  const rafRef      = useRef(null);
  const firedRef    = useRef(false);
  const fileRef     = useRef(null);

  const [ready, setReady]           = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [uploadState, setUploadState] = useState(null); // null | 'decoding' | 'ocr' | 'error'
  const [uploadError, setUploadError] = useState(null);

  const hasCameraApi = !!navigator.mediaDevices?.getUserMedia;

  const stop = useCallback(() => {
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (controlsRef.current) { try { controlsRef.current.stop(); } catch {} controlsRef.current = null; }
    if (streamRef.current)   { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const handleResult = useCallback((rawValue) => {
    if (firedRef.current) return;
    firedRef.current = true;
    stop();
    onScan(rawValue);
  }, [onScan, stop]);

  // ── live camera ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!hasCameraApi) return;
    let cancelled = false;

    async function start() {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err.name === 'NotAllowedError'
          ? 'Camera permission denied.'
          : `Camera unavailable: ${err.message}`;
        setCameraError(msg);
        onError?.(msg);
        return;
      }

      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }
      if (!cancelled) setReady(true);

      if ('BarcodeDetector' in window) {
        let detector = null;
        try {
          const supported = await BarcodeDetector.getSupportedFormats?.() ?? [];
          const formats = supported.length ? WANTED_FORMATS.filter((f) => supported.includes(f)) : WANTED_FORMATS;
          detector = new BarcodeDetector({ formats: formats.length ? formats : ['qr_code'] });
        } catch {}
        if (detector) {
          const tick = async () => {
            if (cancelled || firedRef.current) return;
            const vid = videoRef.current;
            if (vid && vid.readyState >= vid.HAVE_ENOUGH_DATA) {
              try { const codes = await detector.detect(vid); if (codes.length > 0) { handleResult(codes[0].rawValue); return; } } catch {}
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoElement(videoRef.current, (result) => {
          if (result && !cancelled) handleResult(result.getText());
        });
        controlsRef.current = reader;
      } catch (err) {
        if (!cancelled) { const msg = `Scanner failed: ${err.message}`; setCameraError(msg); onError?.(msg); }
      }
    }

    start();
    return () => { cancelled = true; stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── image upload: barcode + OCR ────────────────────────────────────────────

  async function decodeFromFile(file) {
    setUploadError(null);
    setUploadState('decoding');

    let barcodeFound = false;

    // ── 1. Try barcode decode ────────────────────────────────────────────────
    try {
      if ('BarcodeDetector' in window) {
        const bitmap = await createImageBitmap(file);
        try {
          const supported = await BarcodeDetector.getSupportedFormats?.() ?? [];
          const formats = supported.length ? WANTED_FORMATS.filter((f) => supported.includes(f)) : WANTED_FORMATS;
          const detector = new BarcodeDetector({ formats: formats.length ? formats : ['qr_code'] });
          const codes = await detector.detect(bitmap);
          if (codes.length > 0) { barcodeFound = true; handleResult(codes[0].rawValue); }
        } catch {}
      }

      if (!barcodeFound) {
        try {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.src = url;
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
          try {
            const result = await new BrowserMultiFormatReader().decodeFromImageElement(img);
            URL.revokeObjectURL(url);
            barcodeFound = true;
            handleResult(result.getText());
          } catch { URL.revokeObjectURL(url); }
        } catch {}
      }
    } catch {}

    // ── 2. OCR — always run so text data is available ────────────────────────
    setUploadState('ocr');
    try {
      const { createWorker } = await import('tesseract.js');

      // Pre-process: upscale + grayscale + binarize for much better label OCR
      const processed = await preprocessForOcr(file);

      const worker = await createWorker('eng', 1, { logger: () => {} });
      // PSM 11 = sparse text (best for hardware labels with mixed layouts)
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      const { data } = await worker.recognize(processed);
      await worker.terminate();

      const lines = (data.lines || [])
        .filter((l) => {
          const t = l.text.trim();
          if (l.confidence < 55) return false;
          if (t.length < 3) return false;
          const alnum = t.replace(/[^a-zA-Z0-9]/g, '');
          if (alnum.length < 2) return false;
          const garbage = t.replace(/[a-zA-Z0-9 \-./(),:]/g, '').length;
          if (garbage / t.length > 0.35) return false;
          return true;
        })
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10)
        .map((l) => l.text.trim());

      const seen = new Set();
      const unique = lines.filter((t) => {
        const key = t.toLowerCase().replace(/\s+/g, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (unique.length > 0) {
        onTextFound?.(unique);
      } else if (!barcodeFound) {
        setUploadError('No readable text found. Try a closer, well-lit shot with the label flat and in focus.');
      }
    } catch (err) {
      if (!barcodeFound) {
        setUploadError(`Could not process image: ${err.message}`);
      }
    } finally {
      setUploadState(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) decodeFromFile(file);
  }

  const uploadLabel = uploadState === 'decoding' ? 'Reading barcode…'
                    : uploadState === 'ocr'      ? 'Extracting text…'
                    : null;

  const uploadButton = (label, small = false) => (
    <label className={`btn btn-${small ? 'secondary scanner-upload-btn-sm' : 'primary scanner-upload-btn'}`}>
      {uploadLabel || label}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={!!uploadState}
        style={{ display: 'none' }}
      />
    </label>
  );

  // ── render ─────────────────────────────────────────────────────────────────

  const showUploadOnly = !hasCameraApi || cameraError;

  if (showUploadOnly) {
    const reason = !hasCameraApi
      ? (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'
          ? 'Live camera requires HTTPS.'
          : 'Live camera not available in this browser.')
      : cameraError;
    return (
      <div className="scanner-upload-only">
        <div className="scanner-upload-icon">&#128247;</div>
        <div className="scanner-upload-reason">{reason}</div>
        <p className="scanner-upload-hint">
          Take or choose a photo — barcodes will be decoded and any text extracted automatically.
        </p>
        {uploadButton('Choose Photo')}
        {uploadError && <div className="scanner-upload-error">{uploadError}</div>}
      </div>
    );
  }

  return (
    <div className="scanner-wrapper">
      <video ref={videoRef} className="scanner-video" muted playsInline autoPlay />
      <div className="scanner-overlay">
        <div className="scanner-target">
          <span className="scanner-corner tl" /><span className="scanner-corner tr" />
          <span className="scanner-corner bl" /><span className="scanner-corner br" />
          <div className="scanner-laser" />
        </div>
        <div className="scanner-hint">
          {ready ? 'Center the barcode in the frame' : 'Starting camera…'}
        </div>
      </div>
      <div className="scanner-upload-alt">
        {uploadButton('&#128247; Upload photo instead', true)}
        {uploadError && <div className="scanner-upload-error">{uploadError}</div>}
      </div>
    </div>
  );
}

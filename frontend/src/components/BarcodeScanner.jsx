import React, { useCallback, useEffect, useRef, useState } from 'react';

const WANTED_FORMATS = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'data_matrix', 'aztec', 'pdf417'];

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
      const { recognize } = await import('tesseract.js');
      const { data } = await recognize(file, 'eng', { logger: () => {} });

      // Collect meaningful lines: length ≥ 3, not pure whitespace/punctuation
      const lines = (data.lines || [])
        .map((l) => l.text.trim())
        .filter((t) => t.length >= 3 && /[a-zA-Z0-9]/.test(t));

      if (lines.length > 0) {
        onTextFound?.(lines);
      } else if (!barcodeFound) {
        setUploadError('No barcode or readable text found. Try a clearer, closer shot.');
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

import React, { useCallback, useEffect, useRef, useState } from 'react';

const WANTED_FORMATS = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'data_matrix', 'aztec', 'pdf417'];

/**
 * BarcodeScanner
 *
 * Renders a live camera viewfinder and calls onScan(rawValue) once a barcode
 * is detected. Falls back to an image-upload button when the live camera is
 * unavailable (HTTP without HTTPS, permission denied, etc.).
 *
 * Props:
 *   onScan(code: string) — called with the decoded value
 *   onError(msg: string) — optional, called on unrecoverable camera errors
 */
export default function BarcodeScanner({ onScan, onError }) {
  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const controlsRef = useRef(null);
  const rafRef      = useRef(null);
  const firedRef    = useRef(false);
  const fileRef     = useRef(null);

  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);   // non-fatal: show upload fallback
  const [uploadError, setUploadError] = useState(null);   // "no barcode found in photo"
  const [decoding, setDecoding] = useState(false);

  const hasCameraApi = !!navigator.mediaDevices?.getUserMedia;

  // Stop live camera — safe to call multiple times
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
    if (!hasCameraApi) return; // skip — will show upload UI

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

      // Path A: native BarcodeDetector
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
              try {
                const codes = await detector.detect(vid);
                if (codes.length > 0) { handleResult(codes[0].rawValue); return; }
              } catch {}
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      // Path B: ZXing fallback
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoElement(videoRef.current, (result) => {
          if (result && !cancelled) handleResult(result.getText());
        });
        controlsRef.current = reader;
      } catch (err) {
        if (!cancelled) {
          const msg = `Scanner failed to initialise: ${err.message}`;
          setCameraError(msg);
          onError?.(msg);
        }
      }
    }

    start();
    return () => { cancelled = true; stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── image upload decode ─────────────────────────────────────────────────────

  async function decodeFromFile(file) {
    setUploadError(null);
    setDecoding(true);
    try {
      // Path A: native BarcodeDetector on an ImageBitmap
      if ('BarcodeDetector' in window) {
        const bitmap = await createImageBitmap(file);
        try {
          const supported = await BarcodeDetector.getSupportedFormats?.() ?? [];
          const formats = supported.length ? WANTED_FORMATS.filter((f) => supported.includes(f)) : WANTED_FORMATS;
          const detector = new BarcodeDetector({ formats: formats.length ? formats : ['qr_code'] });
          const codes = await detector.detect(bitmap);
          if (codes.length > 0) { handleResult(codes[0].rawValue); return; }
        } catch {}
      }

      // Path B: ZXing on an img element
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      try {
        const reader = new BrowserMultiFormatReader();
        const result = await reader.decodeFromImageElement(img);
        URL.revokeObjectURL(url);
        handleResult(result.getText());
      } catch {
        URL.revokeObjectURL(url);
        setUploadError('No barcode found in that photo. Try a clearer, closer shot.');
      }
    } catch (err) {
      setUploadError(`Could not read image: ${err.message}`);
    } finally {
      setDecoding(false);
      // Reset file input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) decodeFromFile(file);
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const showUploadFallback = !hasCameraApi || cameraError;

  // No camera API at all — show only upload UI
  if (showUploadFallback) {
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
          Take a photo of the barcode or QR code with your camera app, then upload it below.
        </p>
        <label className="btn btn-primary scanner-upload-btn">
          {decoding ? 'Reading barcode…' : 'Choose Photo'}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={decoding}
            style={{ display: 'none' }}
          />
        </label>
        {uploadError && <div className="scanner-upload-error">{uploadError}</div>}
      </div>
    );
  }

  // Live camera view + upload as secondary option
  return (
    <div className="scanner-wrapper">
      <video ref={videoRef} className="scanner-video" muted playsInline autoPlay />
      <div className="scanner-overlay">
        <div className="scanner-target">
          <span className="scanner-corner tl" />
          <span className="scanner-corner tr" />
          <span className="scanner-corner bl" />
          <span className="scanner-corner br" />
          <div className="scanner-laser" />
        </div>
        <div className="scanner-hint">
          {ready ? 'Center the barcode in the frame' : 'Starting camera…'}
        </div>
      </div>

      {/* Upload option shown below the viewfinder as an alternative */}
      <div className="scanner-upload-alt">
        <label className="btn btn-secondary scanner-upload-btn-sm">
          {decoding ? 'Reading…' : '&#128247; Upload photo instead'}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={decoding}
            style={{ display: 'none' }}
          />
        </label>
        {uploadError && <div className="scanner-upload-error">{uploadError}</div>}
      </div>
    </div>
  );
}

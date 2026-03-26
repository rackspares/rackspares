import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * BarcodeScanner
 *
 * Renders a live camera viewfinder and calls onScan(rawValue) once a barcode
 * is detected. Stops the camera automatically after the first successful scan.
 *
 * Strategy:
 *   1. If the browser has native BarcodeDetector (Chrome/Android) use it via
 *      requestAnimationFrame so no extra bundle is loaded.
 *   2. Otherwise lazy-import @zxing/browser as a fallback (iOS Safari, Firefox).
 *
 * Props:
 *   onScan(code: string) — called with the decoded value
 *   onError(msg: string) — optional, called on unrecoverable camera errors
 */
export default function BarcodeScanner({ onScan, onError }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);   // MediaStream — always stopped on unmount
  const controlsRef = useRef(null); // ZXing IScannerControls
  const rafRef    = useRef(null);   // rAF handle for native path
  const firedRef  = useRef(false);  // prevents double-fire

  const [ready, setReady] = useState(false);
  const [permError, setPermError] = useState(null);

  // Stop everything — safe to call multiple times
  const stop = useCallback(() => {
    if (rafRef.current)    { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (controlsRef.current) { try { controlsRef.current.stop(); } catch {} controlsRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleResult = useCallback((rawValue) => {
    if (firedRef.current) return;
    firedRef.current = true;
    stop();
    onScan(rawValue);
  }, [onScan, stop]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // ── check secure context ─────────────────────────────────────────────────
      if (!navigator.mediaDevices?.getUserMedia) {
        const isHttp = location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
        const msg = isHttp
          ? 'Camera access requires HTTPS. Please open this page over a secure connection.'
          : 'Camera API not available in this browser.';
        setPermError(msg);
        onError?.(msg);
        return;
      }

      // ── request camera ──────────────────────────────────────────────────────
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access and reload.'
          : `Camera unavailable: ${err.message}`;
        setPermError(msg);
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

      // ── choose decode strategy ──────────────────────────────────────────────
      if ('BarcodeDetector' in window) {
        // Path A: native BarcodeDetector (Chrome 83+ / Android WebView)
        let detector;
        try {
          const supported = await BarcodeDetector.getSupportedFormats?.() ?? [];
          const wanted = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'data_matrix', 'aztec', 'pdf417'];
          const formats = supported.length
            ? wanted.filter((f) => supported.includes(f))
            : wanted;
          detector = new BarcodeDetector({ formats: formats.length ? formats : ['qr_code'] });
        } catch {
          // BarcodeDetector constructor failed — fall through to ZXing below
          detector = null;
        }

        if (detector) {
          const tick = async () => {
            if (cancelled || firedRef.current) return;
            const vid = videoRef.current;
            if (vid && vid.readyState >= vid.HAVE_ENOUGH_DATA) {
              try {
                const codes = await detector.detect(vid);
                if (codes.length > 0) { handleResult(codes[0].rawValue); return; }
              } catch { /* frame decode error — skip */ }
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      // Path B: ZXing lazy fallback (iOS Safari, Firefox, older browsers)
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        // decodeFromVideoElement continuously decodes from the already-playing video
        reader.decodeFromVideoElement(videoRef.current, (result, err) => {
          if (result && !cancelled) handleResult(result.getText());
        });
        controlsRef.current = reader; // reader.reset() will stop it
      } catch (err) {
        if (!cancelled) {
          const msg = `Scanner failed to initialise: ${err.message}`;
          setPermError(msg);
          onError?.(msg);
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── render ──────────────────────────────────────────────────────────────────
  if (permError) {
    return (
      <div className="scanner-error">
        <div className="scanner-error-icon">⚠</div>
        <div className="scanner-error-msg">{permError}</div>
      </div>
    );
  }

  return (
    <div className="scanner-wrapper">
      <video
        ref={videoRef}
        className="scanner-video"
        muted
        playsInline
        autoPlay
      />
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
    </div>
  );
}

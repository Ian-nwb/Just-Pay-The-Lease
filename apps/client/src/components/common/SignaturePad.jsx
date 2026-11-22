import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Upload } from 'lucide-react';

const WIDTH = 600;
const HEIGHT = 200;
const MAX_UPLOAD = 2 * 1024 * 1024;

/**
 * Draw or upload a signature. Calls onChange(pngDataUrl | '') whenever the
 * signature changes. The output is always a transparent PNG, ink only.
 */
export const SignaturePad = ({ onChange = () => {} }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [mode, setMode] = useState('draw');
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState('');

  const ctx = () => canvasRef.current?.getContext('2d');

  const reset = () => {
    const c = ctx();
    if (!c) return;
    c.clearRect(0, 0, WIDTH, HEIGHT);
    setHasInk(false);
    setError('');
    onChange('');
  };

  useEffect(() => { reset(); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * WIDTH, y: ((e.clientY - r.top) / r.height) * HEIGHT, p: e.pressure || 0.5 };
  };

  const down = (e) => {
    if (mode !== 'draw') return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };

  const move = (e) => {
    if (!drawing.current) return;
    const c = ctx();
    const p = point(e);
    c.strokeStyle = '#0F172A';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = 2.2 + p.p * 1.6;
    c.beginPath();
    c.moveTo(last.current.x, last.current.y);
    c.lineTo(p.x, p.y);
    c.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk || ctx()) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const upload = (file) => {
    setError('');
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError('Use a PNG, JPG or WebP image.'); return; }
    if (file.size > MAX_UPLOAD) { setError('Image must be 2 MB or smaller.'); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = ctx();
      c.clearRect(0, 0, WIDTH, HEIGHT);
      const scale = Math.min(WIDTH / img.width, HEIGHT / img.height) * 0.92;
      const w = img.width * scale;
      const h = img.height * scale;
      c.drawImage(img, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
      // Make near-white paper transparent so only the ink is stamped.
      const data = c.getImageData(0, 0, WIDTH, HEIGHT);
      for (let i = 0; i < data.data.length; i += 4) {
        const [r, g, b] = [data.data[i], data.data[i + 1], data.data[i + 2]];
        if (r > 225 && g > 225 && b > 225) data.data[i + 3] = 0;
      }
      c.putImageData(data, 0, 0);
      URL.revokeObjectURL(url);
      setHasInk(true);
      onChange(canvasRef.current.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError('That image could not be read.'); };
    img.src = url;
  };

  return (
    <div className="space-y-2">
      <div role="tablist" aria-label="Signature method" className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-xs">
        {[['draw', 'Draw', PenLine], ['upload', 'Upload image', Upload]].map(([key, label, Icon]) => (
          <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => setMode(key)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${mode === key ? 'bg-brand text-brand-ink' : 'text-ink-muted hover:text-ink'}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label={mode === 'draw' ? 'Signature drawing area' : 'Uploaded signature preview'}
          className={`block w-full touch-none rounded-lg border border-line-strong bg-white ${mode === 'draw' ? 'cursor-crosshair' : ''}`}
          style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        />
        {!hasInk && mode === 'draw' && (
          <span className="pointer-events-none absolute inset-x-0 bottom-6 mx-6 border-b border-dashed border-line-strong pb-1 text-center text-xs text-ink-muted">Sign here</span>
        )}
        {mode === 'upload' && !hasInk && (
          <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 text-xs text-ink-muted">
            <Upload size={18} />
            Choose a signature image (PNG, JPG or WebP)
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        )}
      </div>

      <div className="flex items-center justify-between">
        {error ? <p role="alert" className="text-xs text-danger-ink">{error}</p> : <p className="text-xs text-ink-muted">{mode === 'draw' ? 'Use your mouse, finger or stylus.' : 'A white background is removed automatically.'}</p>}
        <button type="button" onClick={reset} disabled={!hasInk} className="btn btn-ghost btn-sm"><Eraser size={13} /> Clear</button>
      </div>
    </div>
  );
};

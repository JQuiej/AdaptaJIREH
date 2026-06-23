'use client';

// Marca de la app: logo del Liceo JIREH + nombre AdaptaJIREH.
// El logo debe estar en /public/logo-jireh.png
export default function Brand() {
  return (
    <span className="marca-wrap">
      <img src="/logo-jireh.png" alt="Logo Liceo JIREH" className="marca-logo" />
      <span className="marca">AdaptaJIREH</span>
    </span>
  );
}

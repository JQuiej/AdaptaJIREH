'use client';
import { useRef, useState, useLayoutEffect } from 'react';

/**
 * MathField — área de texto con una paleta de símbolos matemáticos.
 *
 * Pensado para facilitar la escritura de ecuaciones algebraicas (potencias,
 * raíces, fracciones, operadores, comparaciones y letras griegas) sin depender
 * del teclado. Inserta caracteres Unicode en la posición del cursor, por lo que
 * el texto resultante se muestra y evalúa igual que cualquier otro (no requiere
 * renderizado especial ni cambios en el evaluador de IA).
 *
 * Props:
 *   value        string  — contenido controlado
 *   onChange     (nuevoValor: string) => void
 *   rows         number  — filas del textarea (por defecto 3)
 *   placeholder  string
 *   disabled     boolean
 *   className    string  — clase del textarea (por defecto 'campo')
 */

// s(label, aria, ins?, back?) — 'ins' es lo que se inserta (por defecto label),
// 'back' cuántos caracteres retroceder el cursor tras insertar (para dejarlo
// dentro de unos paréntesis, p. ej. √() ).
const s = (label, aria, ins = label, back = 0) => ({ label, aria, ins, back });

const GRUPOS = [
  {
    titulo: 'Potencias',
    simbolos: [
      s('x²', 'x al cuadrado', '²'),
      s('x³', 'x al cubo', '³'),
      s('x⁴', 'x a la cuarta', '⁴'),
      s('xⁿ', 'x a la n', 'ⁿ'),
    ],
  },
  {
    titulo: 'Subíndices',
    simbolos: [
      s('x₁', 'x sub 1', '₁'),
      s('x₂', 'x sub 2', '₂'),
      s('xₙ', 'x sub n', 'ₙ'),
    ],
  },
  {
    titulo: 'Raíces y agrupación',
    simbolos: [
      s('√', 'raíz cuadrada', '√()', 1),
      s('∛', 'raíz cúbica', '∛()', 1),
      s('( )', 'paréntesis', '()', 1),
      s('/', 'fracción (dividido)', '/'),
    ],
  },
  {
    titulo: 'Operadores',
    simbolos: [
      s('×', 'por (multiplicación)'),
      s('÷', 'entre (división)'),
      s('·', 'punto (multiplicación)'),
      s('±', 'más menos'),
    ],
  },
  {
    titulo: 'Comparación',
    simbolos: [
      s('≤', 'menor o igual'),
      s('≥', 'mayor o igual'),
      s('≠', 'distinto de'),
      s('≈', 'aproximadamente igual'),
    ],
  },
  {
    titulo: 'Símbolos',
    simbolos: [
      s('π', 'pi'),
      s('θ', 'theta'),
      s('α', 'alfa'),
      s('Δ', 'delta'),
      s('∞', 'infinito'),
      s('∑', 'sumatoria'),
      s('°', 'grados'),
    ],
  },
];

export default function MathField({
  value = '',
  onChange,
  rows = 3,
  placeholder,
  disabled = false,
  className = 'campo',
}) {
  const ref = useRef(null);
  const cursorRef = useRef(null); // posición donde dejar el cursor tras insertar
  const [abierta, setAbierta] = useState(false); // paleta colapsada por defecto

  // Tras insertar un símbolo, restaurar el foco y la posición del cursor.
  useLayoutEffect(() => {
    if (cursorRef.current != null && ref.current) {
      const pos = cursorRef.current;
      ref.current.focus();
      ref.current.setSelectionRange(pos, pos);
      cursorRef.current = null;
    }
  });

  function insertar(texto, back = 0) {
    const el = ref.current;
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    const nuevo = value.slice(0, start) + texto + value.slice(end);
    cursorRef.current = start + texto.length - back;
    onChange?.(nuevo);
  }

  return (
    <div className="mathfield">
      <button
        type="button"
        className="mathfield-toggle"
        onClick={() => setAbierta((v) => !v)}
        disabled={disabled}
        aria-expanded={abierta}
        title={abierta ? 'Ocultar símbolos matemáticos' : 'Mostrar símbolos matemáticos'}
      >
        <span className={`mathfield-chevron ${abierta ? 'abierto' : ''}`} aria-hidden="true">▸</span>
        {abierta ? 'Ocultar símbolos' : 'Símbolos matemáticos (x², √, ÷, ≤...)'}
      </button>

      {abierta && (
        <div className="mathfield-barra" role="toolbar" aria-label="Símbolos matemáticos">
          {GRUPOS.map((g) => (
            <div key={g.titulo} className="mathfield-grupo" title={g.titulo}>
              {g.simbolos.map((sim) => (
                <button
                  key={sim.label}
                  type="button"
                  className="mathfield-boton"
                  onClick={() => insertar(sim.ins, sim.back)}
                  disabled={disabled}
                  title={sim.aria}
                  aria-label={sim.aria}
                  tabIndex={-1}
                >
                  {sim.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        className={className}
        rows={rows}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

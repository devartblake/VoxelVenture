// Library warnings that are known and harmless, kept out of the console so a real warning stands out:
//   - "THREE.Clock: This module has been deprecated": React Three Fiber creates its clock the old way (three r183 deprecated it); a fix has to come from that library
//   - "transformedNormalView is deprecated" and the missing "uv2" attribute: Pascal's materials, which draw fine
// Everything else is passed through. Add ?warnings=1 to the address to see them all again.
const KNOWN = [/THREE\.Clock: This module has been deprecated/i, /Clock: This module has been deprecated/i, /"transformedNormalView" is deprecated/i, /Vertex attribute "uv2" not found/i];

let installed = false;
export function quietKnownWarnings() {
  if (installed || typeof window === 'undefined' || typeof console === 'undefined') return;
  if (new URLSearchParams(window.location.search).get('warnings')) return;
  installed = true;
  const warn = console.warn.bind(console);
  console.warn = (...args) => {
    const text = String(args[0] ?? '');
    if (KNOWN.some((re) => re.test(text))) return;
    warn(...args);
  };
}

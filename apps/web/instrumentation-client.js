// Runs in the browser before the app starts (Next.js instrumentation-client).
//
// A page opened before a deploy asks for the old build's chunks when it loads a part later (opening a building, the editor). The deploy keeps
// those for a while (deploy/production.sh carry_static), but a tab left open longer gets a ChunkLoadError: reload it once, onto the new build.
// At most once a minute, so a chunk that is really missing does not reload the page forever.
const isChunkError = (e) => e?.name === 'ChunkLoadError' || /Failed to load chunk|Loading chunk [\w-]+ failed/.test(String(e?.message ?? ''));

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem('vv-chunk-reload')) || 0;
    if (Date.now() - last < 60000) return;
    sessionStorage.setItem('vv-chunk-reload', String(Date.now()));
  } catch {
    return; // no session storage: no way to tell a second reload from the first, so leave the page as it is
  }
  window.location.reload();
}

window.addEventListener('error', (e) => isChunkError(e.error) && reloadOnce());
window.addEventListener('unhandledrejection', (e) => isChunkError(e.reason) && reloadOnce());

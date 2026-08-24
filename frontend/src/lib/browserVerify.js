export async function captureBrowserSnapshot(path) {
  const normalized = String(path || '/').trim() || '/';
  return {
    path: normalized,
    title: typeof document !== 'undefined' ? document.title : 'AAIS',
    href: typeof window !== 'undefined' ? window.location.href : '',
    captured_at: new Date().toISOString(),
  };
}

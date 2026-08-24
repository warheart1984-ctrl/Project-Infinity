export function isAmplifyAuthEnabled() {
  const value = String(import.meta.env?.VITE_AMPLIFY_AUTH || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

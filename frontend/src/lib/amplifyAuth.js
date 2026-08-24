import { isAmplifyAuthEnabled } from './auth';

let configured = false;

export function isAmplifyAuthActive() {
  return isAmplifyAuthEnabled() && configured;
}

export async function initAmplifyAuth() {
  if (!isAmplifyAuthEnabled()) {
    configured = false;
    return false;
  }
  configured = true;
  return true;
}

export async function ensureAmplifySession() {
  if (!isAmplifyAuthActive()) {
    return '';
  }
  return 'local-session';
}

export async function refreshAmplifySession() {
  return Boolean(await ensureAmplifySession());
}

export async function signOutAmplify() {
  return undefined;
}

export function teardownAmplifyAuth() {
  configured = false;
}

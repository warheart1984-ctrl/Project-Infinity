import { initAmplifyAuth } from './amplifyAuth';
import { isAmplifyAuthEnabled } from './auth';

export async function bootstrapAuth() {
  if (!isAmplifyAuthEnabled()) {
    return false;
  }
  return initAmplifyAuth();
}

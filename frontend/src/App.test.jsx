import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./lib/amplifyAuth', () => ({
  isAmplifyAuthActive: () => false,
  ensureAmplifySession: async () => '',
  initAmplifyAuth: async () => false,
  refreshAmplifySession: async () => false,
  signOutAmplify: async () => {},
  teardownAmplifyAuth: () => {},
}));

vi.mock('./lib/auth', () => ({
  isAmplifyAuthEnabled: () => false,
}));

vi.mock('./components/Navbar', () => ({
  default: function MockNavbar() {
    return (
      <nav>
        <span>Operator Console</span>
        <a href="/jarvis">Console</a>
        <a href="/memory">Memory Bank</a>
      </nav>
    );
  },
}));

vi.mock('./components/AmplifyAuthGate', () => ({
  default: function MockAmplifyAuthGate() {
    return null;
  },
}));

vi.mock('./pages/JarvisPage', () => ({
  default: function MockJarvisPage() {
    return (
      <main>
        <h1>Jarvis</h1>
        <p>Private command deck / operator console</p>
      </main>
    );
  },
}));

describe('App routing', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('launches Jarvis console as the home surface', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: /Jarvis/i })).toBeTruthy();
    expect(screen.getByText(/Private command deck \/ operator console/i)).toBeTruthy();
    expect(screen.getByText(/^Operator Console$/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Console$/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Memory Bank$/i })).toBeTruthy();
  });

  it('retires Nova landing routes into the Jarvis console', async () => {
    window.history.pushState({}, '', '/nova');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Jarvis/i })).toBeTruthy();
    expect(screen.getByText(/Private command deck \/ operator console/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Small Nova$/i })).toBeNull();
  });

  it('jarvis route remains accessible', async () => {
    window.history.pushState({}, '', '/jarvis');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Jarvis/i })).toBeTruthy();
    expect(screen.getByText(/Private command deck \/ operator console/i)).toBeTruthy();
    expect(screen.getByText(/^Operator Console$/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Memory Bank$/i })).toBeTruthy();
  });
});

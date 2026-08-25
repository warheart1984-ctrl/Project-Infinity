import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EnergyFlow from './EnergyFlow';

describe('EnergyFlow', () => {
  it('returns null when disabled', () => {
    const { container } = render(
      <EnergyFlow enabled={false} animation="full" />,
    );
    expect(container.querySelector('[data-testid="sovereign-energy-flow"]')).toBeNull();
  });

  it('renders svg fallback nodes when enabled', () => {
    render(
      <EnergyFlow
        enabled
        animation="reduced"
        lanePlan={[
          { provider: 'aais', allowed: true },
          { provider: 'crm', allowed: false, reason_code: 'policy' },
        ]}
      />,
    );
    expect(screen.getByTestId('sovereign-energy-flow')).toBeTruthy();
    expect(screen.getByText(/aais/i)).toBeTruthy();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('App', () => {
  it('renders the application heading', async () => {
    render(<App />);

    // Anonymous bootstrap hits refresh (401 with no cookie) before the login
    // page appears, so the heading only exists after the round trip.
    expect(await screen.findByRole('heading', { name: 'Log in to Testopia' })).toBeInTheDocument();
  });
});

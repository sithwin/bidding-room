import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('renders children', () => {
    render(<AppShell><p>page content</p></AppShell>);
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('applies canvas background by default', () => {
    const { container } = render(<AppShell><span>x</span></AppShell>);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('bg-canvas');
    expect(wrapper.className).not.toContain('theme-live');
  });

  it('applies theme-live class when isLive is true', () => {
    const { container } = render(<AppShell isLive><span>live</span></AppShell>);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('theme-live');
    expect(wrapper.className).not.toContain('bg-canvas');
  });

  it('does not apply theme-live class when isLive is false', () => {
    const { container } = render(<AppShell isLive={false}><span>x</span></AppShell>);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).not.toContain('theme-live');
  });
});

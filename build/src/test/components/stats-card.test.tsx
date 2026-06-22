import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsCard } from '@/components/cards/stats-card';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, whileHover: _wh, ...props }: React.HTMLAttributes<HTMLDivElement> & { whileHover?: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe('StatsCard', () => {
  it('renders the title prop', () => {
    render(<StatsCard title="Total Employees" value="142" trend="+5%" />);
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
  });

  it('renders the value prop', () => {
    render(<StatsCard title="Headcount" value="98" trend="+2%" />);
    expect(screen.getByText('98')).toBeInTheDocument();
  });

  it('renders the trend prop', () => {
    render(<StatsCard title="Attendance" value="95%" trend="+1.2%" />);
    expect(screen.getByText('+1.2%')).toBeInTheDocument();
  });

  it('renders all three props together without crashing', () => {
    render(<StatsCard title="Payroll" value="$50,000" trend="+3%" />);
    expect(screen.getByText('Payroll')).toBeInTheDocument();
    expect(screen.getByText('$50,000')).toBeInTheDocument();
    expect(screen.getByText('+3%')).toBeInTheDocument();
  });
});

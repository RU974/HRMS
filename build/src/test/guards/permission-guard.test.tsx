import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PermissionGuard } from '@/app/guards/permission-guard';
import type { AuthUser } from '@/store/auth-store';

// Mutable state so individual tests can swap the current user
const authState: { user: AuthUser | null } = { user: null };

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: (s: { user: AuthUser | null }) => unknown) => selector(authState),
}));

function makeUser(perms: string[], roleName?: string): AuthUser {
  return {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    permissions: perms.map((p) => ({ id: p, key: p })),
    roles: roleName ? [{ id: '1', name: roleName, permissions: [] }] : [],
  };
}

function renderGuard(
  permissions: string[],
  opts: { user?: AuthUser | null; requireAll?: boolean } = {},
) {
  authState.user = opts.user !== undefined ? opts.user : makeUser(permissions);
  return render(
    <MemoryRouter>
      <PermissionGuard permissions={permissions} requireAll={opts.requireAll}>
        <div data-testid="protected">Protected Content</div>
      </PermissionGuard>
    </MemoryRouter>,
  );
}

describe('PermissionGuard', () => {
  beforeEach(() => {
    authState.user = null;
  });

  it('renders children when user has the required permission', () => {
    renderGuard(['employees.view'], { user: makeUser(['employees.view']) });
    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('renders fallback when user lacks all required permissions', () => {
    renderGuard(['payroll.edit'], { user: makeUser(['employees.view']) });
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByText('Access restricted')).toBeInTheDocument();
  });

  it('renders children when user has ANY of multiple permissions (default OR logic)', () => {
    renderGuard(['payroll.edit', 'employees.view'], { user: makeUser(['employees.view']) });
    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('renders fallback when requireAll is true and user only has some permissions', () => {
    renderGuard(['payroll.edit', 'employees.view'], {
      user: makeUser(['employees.view']),
      requireAll: true,
    });
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('Super Admin always sees children regardless of permission list', () => {
    renderGuard(['some.restricted.permission'], { user: makeUser([], 'Super Admin') });
    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('renders fallback when user is null', () => {
    renderGuard(['employees.view'], { user: null });
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });
});

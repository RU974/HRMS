import { describe, it, expect } from 'vitest';
import { normalizeRoleKey, getUserRoleKeys } from '@/config/rbac';
import type { AuthUser } from '@/store/auth-store';

function makeUser(roleNames: string[]): AuthUser {
  return {
    id: 1,
    name: 'Test',
    email: 'test@example.com',
    roles: roleNames.map((name, i) => ({ id: String(i + 1), name, permissions: [] })),
  };
}

describe('normalizeRoleKey', () => {
  it('converts "Super Admin" to "super_admin"', () => {
    expect(normalizeRoleKey('Super Admin')).toBe('super_admin');
  });

  it('converts "HR Manager" to "hr_manager"', () => {
    expect(normalizeRoleKey('HR Manager')).toBe('hr_manager');
  });

  it('leaves an already-normalized key unchanged', () => {
    expect(normalizeRoleKey('company_admin')).toBe('company_admin');
  });

  it('is case-insensitive — "SUPER ADMIN" normalizes to "super_admin"', () => {
    expect(normalizeRoleKey('SUPER ADMIN')).toBe('super_admin');
  });

  it('converts "IT Support" to "it_support"', () => {
    expect(normalizeRoleKey('IT Support')).toBe('it_support');
  });
});

describe('getUserRoleKeys', () => {
  it('returns empty array for null user', () => {
    expect(getUserRoleKeys(null)).toEqual([]);
  });

  it('returns empty array for undefined user', () => {
    expect(getUserRoleKeys(undefined)).toEqual([]);
  });

  it('returns correct normalized keys for user with roles', () => {
    const user = makeUser(['HR Manager', 'Company Admin']);
    expect(getUserRoleKeys(user)).toEqual(['hr_manager', 'company_admin']);
  });

  it('returns empty array for user with no roles', () => {
    const user = makeUser([]);
    expect(getUserRoleKeys(user)).toEqual([]);
  });

  it('normalizes mixed-case role names consistently', () => {
    const user = makeUser(['Payroll Manager']);
    expect(getUserRoleKeys(user)).toEqual(['payroll_manager']);
  });
});

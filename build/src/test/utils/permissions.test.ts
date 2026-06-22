import { describe, it, expect } from 'vitest';
import { normalizePermissionKey, hasPermission } from '@/utils/permissions';
import type { AuthUser } from '@/store/auth-store';

function makeUser(perms: string[], roleName?: string): AuthUser {
  return {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    permissions: perms.map((p) => ({ id: p, key: p })),
    roles: roleName ? [{ id: '1', name: roleName, permissions: [] }] : [],
  };
}

describe('normalizePermissionKey', () => {
  it('converts colon separator to dot', () => {
    expect(normalizePermissionKey('employees:view')).toBe('employees.view');
  });

  it('leaves dot separator unchanged', () => {
    expect(normalizePermissionKey('employees.view')).toBe('employees.view');
  });

  it('handles object with key field in colon format', () => {
    expect(normalizePermissionKey({ key: 'payroll:edit' })).toBe('payroll.edit');
  });

  it('lowercases the result', () => {
    expect(normalizePermissionKey('Employees:View')).toBe('employees.view');
  });

  it('handles object with module and action fields', () => {
    expect(normalizePermissionKey({ module: 'payroll', action: 'view' })).toBe('payroll.view');
  });
});

describe('hasPermission', () => {
  it('returns true when user has the matching permission', () => {
    const user = makeUser(['employees.view']);
    expect(hasPermission(user, 'employees:view')).toBe(true);
  });

  it('returns false when user lacks the permission', () => {
    const user = makeUser(['employees.view']);
    expect(hasPermission(user, 'payroll:view')).toBe(false);
  });

  it('returns true for Super Admin regardless of permissions array', () => {
    const user = makeUser([], 'Super Admin');
    expect(hasPermission(user, 'any:permission')).toBe(true);
  });

  it('normalizes colon-format permission string before checking', () => {
    const user = makeUser(['payroll.edit']);
    expect(hasPermission(user, 'payroll:edit')).toBe(true);
  });

  it('returns false for null user', () => {
    expect(hasPermission(null, 'employees:view')).toBe(false);
  });

  it('returns true when user has wildcard permission', () => {
    const user = makeUser(['*.*']);
    expect(hasPermission(user, 'any:permission')).toBe(true);
  });
});

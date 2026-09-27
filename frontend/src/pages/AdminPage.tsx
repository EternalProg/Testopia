import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { userRoles, type UserRole } from '@testopia/shared';

import { adminApi, AdminApiError } from '../admin/api.js';
import type { ApiUser } from '../admin/types.js';
import { useAuthStore } from '../auth/store.js';
import { Alert } from '../components/Alert.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import {
  Eyebrow,
  btnSecondaryClass,
  cardClass,
  dangerLinkClass,
  fieldClass,
  h1Class,
  h2Class,
  inputClass,
} from '../components/ui.js';
import { TestApiError, testsApi } from '../tests/api.js';
import type { TestListItem } from '../tests/types.js';

type SectionState = 'loading' | 'ready' | 'error';

function roleChangeMessage(reason: unknown): string {
  if (reason instanceof AdminApiError) {
    return reason.payload.message ?? 'This role could not be changed.';
  }
  return 'This role could not be changed.';
}

function deleteMessage(reason: unknown): string {
  if (reason instanceof TestApiError) {
    if (reason.status === 409) return 'Cannot delete a test with attempts.';
    return reason.payload.message ?? 'This test could not be deleted.';
  }
  return 'This test could not be deleted.';
}

export function AdminPage() {
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [tests, setTests] = useState<TestListItem[]>([]);
  const [userState, setUserState] = useState<SectionState>('loading');
  const [testState, setTestState] = useState<SectionState>('loading');
  const [usersError, setUsersError] = useState<string | null>(null);
  const [testsError, setTestsError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<TestListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  function loadUsers() {
    let active = true;
    setUserState('loading');
    void adminApi
      .listUsers()
      .then((loaded) => {
        if (!active) return;
        setUsers(loaded);
        setUsersError(null);
        setUserState('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setUsersError(
          reason instanceof AdminApiError && reason.status === 403
            ? 'Only admins can manage users.'
            : 'Users could not be loaded.',
        );
        setUserState('error');
      });
    return () => {
      active = false;
    };
  }

  useEffect(() => loadUsers(), []);

  useEffect(() => {
    let active = true;
    setTestState('loading');
    void testsApi
      .list('all')
      .then((data) => {
        if (!active) return;
        setTests(Array.isArray(data) ? data : data.items);
        setTestsError(null);
        setTestState('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setTestsError(
          reason instanceof TestApiError && reason.status === 403
            ? 'Only admins can manage tests.'
            : 'Tests could not be loaded.',
        );
        setTestState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  async function changeRole(id: number, role: UserRole) {
    setRoleId(id);
    setRoleError(null);
    try {
      await adminApi.setRole(id, role);
      // Refetch so the rendered table always mirrors the server, which also
      // keeps a failed change from leaving an optimistic value behind.
      loadUsers();
    } catch (reason) {
      setRoleError(roleChangeMessage(reason));
    } finally {
      setRoleId(null);
    }
  }

  async function removeTest() {
    if (!deleting || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await testsApi.delete(deleting.id);
      setTests((current) => current.filter((test) => test.id !== deleting.id));
      setDeleting(null);
    } catch (reason) {
      setDeleteError(deleteMessage(reason));
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <TestLayout
      modal={
        deleting ? (
          <ConfirmDialog
            title="Delete test"
            description={`Delete "${deleting.title}"? This cannot be undone.`}
            confirmLabel={deletePending ? 'Deleting...' : 'Delete test'}
            cancelLabel="Keep test"
            busy={deletePending}
            onConfirm={() => void removeTest()}
            onCancel={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
          />
        ) : undefined
      }
    >
      <Eyebrow>Administration</Eyebrow>
      <h1 className={h1Class}>Admin</h1>

      <section className={`${cardClass} p-[26px]`}>
        <h2 className={h2Class}>Users</h2>
        {userState === 'loading' && <LoadingState text="Loading users..." />}
        {userState === 'error' && <Alert variant="error">{usersError}</Alert>}
        {userState === 'ready' && (
          <>
            {roleError && <Alert variant="error">{roleError}</Alert>}
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[0.78rem] uppercase tracking-[0.09em] text-faint">
                  <th scope="col" className="py-2 pr-3 font-bold">
                    Id
                  </th>
                  <th scope="col" className="py-2 pr-3 font-bold">
                    Email
                  </th>
                  <th scope="col" className="py-2 pr-3 font-bold">
                    Username
                  </th>
                  <th scope="col" className="py-2 pr-3 font-bold">
                    Role
                  </th>
                  <th scope="col" className="py-2 font-bold">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const own = row.id === currentUser?.id;
                  return (
                    <tr key={row.id} className="border-b border-line last:border-b-0">
                      <td className="py-2 pr-3 text-[0.9rem] text-ink">{row.id}</td>
                      <td className="py-2 pr-3 text-[0.9rem] text-ink">{row.email}</td>
                      <td className="py-2 pr-3 text-[0.9rem] text-ink">{row.username}</td>
                      <td className="py-2 pr-3">
                        <label className={fieldClass}>
                          <span className="sr-only">{`Role for ${row.username}`}</span>
                          <select
                            aria-label={`Role for ${row.username}`}
                            className={`${inputClass} max-w-[160px] py-1.5`}
                            value={row.role}
                            disabled={own || roleId === row.id}
                            onChange={(event) =>
                              void changeRole(row.id, event.target.value as UserRole)
                            }
                          >
                            {userRoles.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </label>
                      </td>
                      <td className="py-2 text-[0.9rem] text-muted">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mb-0 mt-3 text-[0.83rem] text-muted">
              Your own row is locked: an admin cannot change their own role.
            </p>
          </>
        )}
      </section>

      <section className={`${cardClass} mt-7 p-[26px]`}>
        <h2 className={h2Class}>Tests</h2>
        {testState === 'loading' && <LoadingState text="Loading tests..." />}
        {testState === 'error' && <Alert variant="error">{testsError}</Alert>}
        {testState === 'ready' &&
          (tests.length === 0 ? (
            <EmptyState text="No tests yet." role="status" />
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {tests.map((test) => (
                <li
                  key={test.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-5 py-[18px]"
                >
                  <div>
                    <Link to={`/tests/${test.id}`} className="font-semibold text-ink">
                      {test.title}
                    </Link>
                    <p className="mb-0 text-[0.85rem] text-faint">
                      #{test.id} · {test.isPublished ? 'Published' : 'Draft'}
                    </p>
                  </div>
                  <button
                    className={dangerLinkClass}
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleting(test);
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ))}
        {deleteError && <Alert variant="error">{deleteError}</Alert>}
        {testState === 'ready' && tests.length > 0 && (
          <p className="mb-0 mt-3 text-[0.83rem] text-muted">
            Deleting a test is refused once it has attempts.
          </p>
        )}
      </section>

      <p className="mt-6">
        <Link to="/dashboard" className={btnSecondaryClass}>
          Back to dashboard
        </Link>
      </p>
    </TestLayout>
  );
}

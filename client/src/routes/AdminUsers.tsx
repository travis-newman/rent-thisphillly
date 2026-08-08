import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type AccountStatus, type AdminUser, type Role } from "../lib/api";

const ROLES: Role[] = ["admin", "client", "user"];
const STATUSES: AccountStatus[] = ["active", "suspended"];

function UserRow({ user, onSaved }: { user: AdminUser; onSaved: (user: AdminUser) => void }) {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = role !== user.role || status !== user.status;

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const res = await api.updateUser(user._id, { role, status });
      onSaved(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <tr>
      <td>{user.email}</td>
      <td>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button onClick={handleSave} disabled={!isDirty || isSaving}>
          Save
        </button>
        {error && <span role="alert"> {error}</span>}
      </td>
    </tr>
  );
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listUsers()
      .then((res) => setUsers(res.users))
      .catch(() => setError("Failed to load users."))
      .finally(() => setIsLoading(false));
  }, []);

  function handleSaved(updated: AdminUser) {
    setUsers((prev) => prev.map((u) => (u._id === updated._id ? updated : u)));
  }

  return (
    <div>
      <h1>Manage users</h1>
      <p>
        <Link to="/buildings">Buildings</Link>
      </p>

      {isLoading && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}

      {!isLoading && !error && (
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow key={user._id} user={user} onSaved={handleSaved} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

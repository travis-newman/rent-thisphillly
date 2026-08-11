import { Button, Select, Table } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type AccountStatus, type AdminUser, type Role } from "../lib/api";

const ROLES: Role[] = ["admin", "client", "user"];
const STATUSES: AccountStatus[] = ["active", "suspended"];
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: r }));
const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: s }));

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
    <Table.Tr>
      <Table.Td>{user.email}</Table.Td>
      <Table.Td>
        <Select
          data={ROLE_OPTIONS}
          value={role}
          onChange={(value) => setRole((value as Role) ?? user.role)}
          allowDeselect={false}
        />
      </Table.Td>
      <Table.Td>
        <Select
          data={STATUS_OPTIONS}
          value={status}
          onChange={(value) => setStatus((value as AccountStatus) ?? user.status)}
          allowDeselect={false}
        />
      </Table.Td>
      <Table.Td>
        <Button size="xs" onClick={handleSave} disabled={!isDirty} loading={isSaving}>
          Save
        </Button>
        {error && <span role="alert"> {error}</span>}
      </Table.Td>
    </Table.Tr>
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
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => (
              <UserRow key={user._id} user={user} onSaved={handleSaved} />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </div>
  );
}

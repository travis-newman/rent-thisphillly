import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        Welcome, {user?.email} ({user?.role}).
      </p>
      <p>
        <Link to="/buildings">Buildings</Link>
        {user?.role === "admin" && (
          <>
            {" · "}
            <Link to="/admin/users">Manage users</Link>
            {" · "}
            <Link to="/admin/regions">Manage regions</Link>
          </>
        )}
      </p>
      <button onClick={handleLogout}>Log out</button>
    </div>
  );
}

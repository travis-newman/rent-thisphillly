import { useNavigate } from "react-router-dom";
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
      <p>Welcome, {user?.email}.</p>
      <button onClick={handleLogout}>Log out</button>
    </div>
  );
}

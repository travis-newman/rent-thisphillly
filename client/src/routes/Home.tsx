import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function Home() {
  const { user } = useAuth();

  return (
    <div>
      <h1>Base App</h1>
      {user ? (
        <p>
          Signed in as {user.email}. Go to your <Link to="/dashboard">dashboard</Link>.
        </p>
      ) : (
        <p>
          <Link to="/login">Log in</Link> or <Link to="/register">create an account</Link>.
        </p>
      )}
    </div>
  );
}

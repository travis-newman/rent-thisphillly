import { Navigate, Outlet } from "react-router-dom";
import type { Role } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

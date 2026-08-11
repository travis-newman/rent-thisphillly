import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireRole } from "./components/RequireRole";
import { AuthProvider } from "./lib/auth-context";
import { AdminRegions } from "./routes/AdminRegions";
import { AdminUsers } from "./routes/AdminUsers";
import { BuildingDetail } from "./routes/BuildingDetail";
import { Buildings } from "./routes/Buildings";
import { BuildingsMap } from "./routes/BuildingsMap";
import { Dashboard } from "./routes/Dashboard";
import { ForgotPassword } from "./routes/ForgotPassword";
import { Home } from "./routes/Home";
import { Login } from "./routes/Login";
import { NeighborhoodDetail } from "./routes/NeighborhoodDetail";
import { Register } from "./routes/Register";
import { RegionDetail } from "./routes/RegionDetail";
import { Regions } from "./routes/Regions";
import { ResetPassword } from "./routes/ResetPassword";
import { VerifyEmail } from "./routes/VerifyEmail";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/buildings" element={<Buildings />} />
          <Route path="/buildings/:id" element={<BuildingDetail />} />
          <Route path="/map" element={<BuildingsMap />} />
          <Route path="/regions" element={<Regions />} />
          <Route path="/regions/:id" element={<RegionDetail />} />
          <Route path="/neighborhoods/:id" element={<NeighborhoodDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route element={<RequireRole roles={["admin"]} />}>
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/regions" element={<AdminRegions />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

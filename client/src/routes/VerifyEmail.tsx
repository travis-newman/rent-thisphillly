import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

export function VerifyEmail() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (!token) return;
    api
      .verifyEmail(token)
      .then((res) => {
        setStatus("success");
        setMessage(res.message);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed");
      });
  }, [token]);

  return (
    <div>
      <h1>Email verification</h1>
      <p>{message}</p>
      {status === "success" && <Link to="/login">Log in</Link>}
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await api.forgotPassword(email);
      setMessage(res.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (message) {
    return <p>{message}</p>;
  }

  return (
    <div>
      <h1>Forgot password</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </div>
  );
}

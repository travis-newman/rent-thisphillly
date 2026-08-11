import { Anchor, Button, PasswordInput, Stack, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

export function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    initialValues: { password: "" },
  });

  async function handleSubmit(values: { password: string }) {
    if (!token) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await api.resetPassword(token, values.password);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (message) {
    return (
      <div>
        <p>{message}</p>
        <Anchor component={Link} to="/login">
          Log in
        </Anchor>
      </div>
    );
  }

  return (
    <div>
      <Title order={1}>Reset password</Title>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack maw={360}>
          <PasswordInput
            id="password"
            label="New password"
            minLength={8}
            required
            {...form.getInputProps("password")}
          />
          {error && <p role="alert">{error}</p>}
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Resetting…" : "Reset password"}
          </Button>
        </Stack>
      </form>
    </div>
  );
}

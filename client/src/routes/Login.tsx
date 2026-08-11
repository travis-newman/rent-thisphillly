import { Anchor, Button, PasswordInput, Stack, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    initialValues: { email: "", password: "" },
  });

  async function handleSubmit(values: { email: string; password: string }) {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(values.email, values.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log in");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <Title order={1}>Log in</Title>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack maw={360}>
          <TextInput
            id="email"
            label="Email"
            type="email"
            required
            {...form.getInputProps("email")}
          />
          <PasswordInput
            id="password"
            label="Password"
            required
            {...form.getInputProps("password")}
          />

          {error && <p role="alert">{error}</p>}

          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Logging in…" : "Log in"}
          </Button>
        </Stack>
      </form>
      <p>
        <Anchor component={Link} to="/forgot-password">
          Forgot your password?
        </Anchor>
      </p>
      <p>
        Don&apos;t have an account? <Anchor component={Link} to="/register">Register</Anchor>
      </p>
    </div>
  );
}

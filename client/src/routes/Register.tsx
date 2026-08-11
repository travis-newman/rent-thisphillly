import { Anchor, Button, PasswordInput, Stack, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function Register() {
  const { register } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    initialValues: { email: "", password: "" },
  });

  async function handleSubmit(values: { email: string; password: string }) {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await register(values.email, values.password);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (message) {
    return <p>{message}</p>;
  }

  return (
    <div>
      <Title order={1}>Create an account</Title>
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
            minLength={8}
            required
            {...form.getInputProps("password")}
          />

          {error && <p role="alert">{error}</p>}

          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Register"}
          </Button>
        </Stack>
      </form>
      <p>
        Already have an account? <Anchor component={Link} to="/login">Log in</Anchor>
      </p>
    </div>
  );
}

import { Button, Stack, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { api } from "../lib/api";

export function ForgotPassword() {
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    initialValues: { email: "" },
  });

  async function handleSubmit(values: { email: string }) {
    setIsSubmitting(true);
    try {
      const res = await api.forgotPassword(values.email);
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
      <Title order={1}>Forgot password</Title>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack maw={360}>
          <TextInput
            id="email"
            label="Email"
            type="email"
            required
            {...form.getInputProps("email")}
          />
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </Stack>
      </form>
    </div>
  );
}

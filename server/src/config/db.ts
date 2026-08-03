import mongoose from "mongoose";
import { env } from "./env";

export async function connectDB(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

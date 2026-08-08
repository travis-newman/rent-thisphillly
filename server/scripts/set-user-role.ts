import "dotenv/config";
import mongoose from "mongoose";
import { ROLES } from "../src/models/User";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/rent-thisphilly";

// One-time bootstrap for the first admin account: there's no UI path to
// create an admin (the admin panel that assigns roles requires an admin to
// already be logged in), so this script sets a user's role directly in the
// database. Usage: npm run role:set -- <email> <admin|client|user>
async function main(): Promise<void> {
  const [email, role] = process.argv.slice(2);

  if (!email || !role || !ROLES.includes(role as (typeof ROLES)[number])) {
    console.error(`Usage: npm run role:set -- <email> <${ROLES.join("|")}>`);
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  const { UserModel } = await import("../src/models/User");
  const user = await UserModel.findOneAndUpdate({ email }, { role }, { new: true });

  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exitCode = 1;
  } else {
    console.log(`${user.email} is now role "${user.role}".`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed to set role:", err);
  process.exit(1);
});

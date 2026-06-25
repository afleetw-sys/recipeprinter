import { getFunctions } from "firebase/functions";
import { app } from "./client";
// Importing appCheck for its side effect guarantees App Check is initialized
// before the first callable request (same ordering CookPilot relies on).
import "./appCheck";

export const functions = getFunctions(
  app,
  process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1",
);

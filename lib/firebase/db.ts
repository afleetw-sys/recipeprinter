import { getFirestore } from "firebase/firestore";
import { app } from "./client";
import "./appCheck";

export const db = getFirestore(app);

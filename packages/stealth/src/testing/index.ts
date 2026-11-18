/** Explicitly opt into PUBLIC keys and simulated records. Never fund these fixtures. */
export type { DemoIdentity, FixturePayment } from "../types.js";
export {
  createDemoIdentity,
  createFixturePayment,
  deriveStealthPaymentForTest,
} from "./fixtures.js";

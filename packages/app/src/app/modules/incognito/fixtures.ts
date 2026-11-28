import { ccc } from "@ckb-ccc/core";
import {
  createDemoIdentity,
  createFixturePayment,
  deriveStealthPaymentForTest,
} from "@ckb-ccc/stealth/testing";

// Public, deterministic fixture keys. Never send funds to these addresses.
export const demoIdentity = createDemoIdentity();
export const unrelatedViewKey = `0x${"0".repeat(63)}4` as const;
export const normalLock = ccc.Script.from({
  codeHash:
    "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
  hashType: "type",
  args: ccc.hashCkb(demoIdentity.spendPublicKey).slice(0, 42),
});
export const normalAddress = ccc.Address.from({
  script: normalLock,
  prefix: "ckt",
}).toString();

const payment = deriveStealthPaymentForTest(
  demoIdentity.metaAddress,
  `0x${(13).toString(16).padStart(64, "0")}`,
);
const unrelatedArgs = `${payment.lock.args.slice(0, -2)}${
  payment.lock.args.endsWith("00") ? "01" : "00"
}`;
export const incomingFixtures = [
  createFixturePayment(payment, "200", "fixture-incoming-01"),
  createFixturePayment(
    {
      ...payment,
      lock: ccc.Script.from({ ...payment.lock, args: unrelatedArgs }),
    },
    "200",
    "fixture-unrelated-02",
  ),
];

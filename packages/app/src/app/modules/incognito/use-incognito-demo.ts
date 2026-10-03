import {
  buildSendDraft,
  deriveFreshChange,
  deriveStealthPayment,
  prepareSpendDraft,
  scanStealthPayments,
  type DetectedPayment,
  type SpendDraft,
  type StealthPayment,
} from "@ckb-ccc/stealth";
import { useState } from "react";
import {
  demoIdentity,
  incomingFixtures,
  normalAddress,
  unrelatedViewKey,
} from "./fixtures";
import {
  buildNormalDraft,
  describeDraft,
  errorMessage,
} from "./local-transactions";

export function useIncognitoDemo() {
  const [incognito, setIncognito] = useState(false);
  const [recipient, setRecipient] = useState(normalAddress);
  const [amount, setAmount] = useState("200");
  const [freshChange, setFreshChange] = useState(true);
  const [payment, setPayment] = useState<StealthPayment>();
  const [change, setChange] = useState<StealthPayment>();
  const [draft, setDraft] = useState<string>();
  const [profile, setProfile] = useState("matching");
  const [matches, setMatches] = useState<DetectedPayment[]>();
  const [spend, setSpend] = useState<SpendDraft>();
  const [error, setError] = useState("");

  function clearOutput() {
    setPayment(undefined);
    setChange(undefined);
    setDraft(undefined);
    setError("");
  }

  function toggleMode() {
    setIncognito(!incognito);
    setRecipient(incognito ? normalAddress : demoIdentity.metaAddress);
    setMatches(undefined);
    setSpend(undefined);
    clearOutput();
  }

  function updateRecipient(value: string) {
    setRecipient(value);
    clearOutput();
  }

  function updateAmount(value: string) {
    setAmount(value);
    clearOutput();
  }

  function toggleChange() {
    setFreshChange(!freshChange);
    setDraft(undefined);
    setChange(undefined);
    setError("");
  }

  function derive() {
    clearOutput();
    try {
      setPayment(deriveStealthPayment(recipient.trim()));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function build() {
    setError("");
    try {
      if (incognito && !payment) {
        throw new Error("Derive a one-time address first.");
      }
      const transaction =
        incognito && payment
          ? buildSendDraft(payment, amount).transaction
          : buildNormalDraft(recipient, amount);
      const nextChange =
        incognito && freshChange
          ? deriveFreshChange(demoIdentity.metaAddress)
          : undefined;
      setDraft(describeDraft(transaction));
      setChange(nextChange);
      return true;
    } catch (cause) {
      setDraft(undefined);
      setChange(undefined);
      setError(errorMessage(cause));
      return false;
    }
  }

  function updateProfile(value: string) {
    setProfile(value);
    setMatches(undefined);
    setSpend(undefined);
    setError("");
  }

  function scan() {
    setError("");
    setSpend(undefined);
    try {
      const result = scanStealthPayments(
        incomingFixtures,
        profile === "matching" ? demoIdentity.viewKey : unrelatedViewKey,
        demoIdentity.spendPublicKey,
      );
      setMatches(result.matches);
      return result.matches.length;
    } catch (cause) {
      setMatches(undefined);
      setError(errorMessage(cause));
      return undefined;
    }
  }

  function previewSpend(match: DetectedPayment) {
    setError("");
    try {
      if (!matches?.includes(match)) {
        throw new Error("Scan the fixtures before preparing a spend preview.");
      }
      setSpend(
        prepareSpendDraft(match, demoIdentity, demoIdentity.metaAddress),
      );
      return true;
    } catch (cause) {
      setSpend(undefined);
      setError(errorMessage(cause));
      return false;
    }
  }

  function reset() {
    setIncognito(false);
    setRecipient(normalAddress);
    setAmount("200");
    setFreshChange(true);
    setProfile("matching");
    setMatches(undefined);
    setSpend(undefined);
    clearOutput();
  }

  return {
    incognito,
    recipient,
    amount,
    freshChange,
    payment,
    change,
    draft,
    profile,
    matches,
    spend,
    error,
    toggleMode,
    updateRecipient,
    updateAmount,
    toggleChange,
    derive,
    build,
    updateProfile,
    scan,
    previewSpend,
    reset,
  };
}

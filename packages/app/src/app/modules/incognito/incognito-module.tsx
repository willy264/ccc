"use client";

import { ccc } from "@ckb-ccc/core";
import { Eye, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { CopyableText } from "../../copyable-text";
import { ModuleTextarea } from "../../module-textarea";
import type { ModuleRuntimeProps } from "../../modules";
import { demoIdentity, incomingFixtures, normalAddress } from "./fixtures";
import styles from "./incognito.module.css";
import { useIncognitoDemo } from "./use-incognito-demo";

type View = "send" | "receive" | "disclosure";

/** Local module: uses only host log/readout; never accesses its client or signer. */
export function IncognitoModule({ log, show }: ModuleRuntimeProps) {
  const demo = useIncognitoDemo();
  const [view, setView] = useState<View>("send");
  const identity = demo.incognito ? demoIdentity.metaAddress : normalAddress;

  function announce(message: string) {
    log(message);
    show({
      label: "LOCAL DEMO",
      tone: "idle",
      content: <strong>{message}</strong>,
    });
  }

  function edited() {
    show({
      label: "LOCAL DEMO",
      tone: "idle",
      content: <strong>Preview cleared. No transaction was sent.</strong>,
    });
  }

  return (
    <div
      className={`module-console ${styles.root}`}
      data-testid="incognito-module"
    >
      <div className={styles.notice} role="note">
        <strong>TESTNET FIXTURES · SIMULATED CHAIN STEPS</strong>
        <p>
          A visual comparison inside CCC. No wallet connection required. This
          module never uses your connected wallet or the app&apos;s selected
          network. Public fixture keys only: do not send real assets to these
          addresses. Not deployment evidence.
        </p>
      </div>

      <div className={styles.modeBar}>
        <div>
          <span className={styles.eyebrow}>
            {demo.incognito ? "INCOGNITO ON" : "NORMAL MODE"}
          </span>
          <h2>Same CCC flow. A different receiving address.</h2>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={demo.incognito}
          aria-label="Incognito mode"
          data-testid="incognito-toggle"
          className={styles.toggle}
          onClick={() => {
            demo.toggleMode();
            edited();
          }}
        >
          <span className={styles.toggleTrack}>
            <span />
          </span>
          Incognito mode
        </button>
      </div>

      <div className={styles.identity}>
        <span className={styles.eyebrow}>
          {demo.incognito
            ? "Fixture stealth meta-address"
            : "Fixture CKB receiving address"}
        </span>
        <CopyableText
          className={styles.copyValue}
          value={identity}
          ariaLabel="Copy fixture receiving identity"
          onError={() =>
            announce(
              "Clipboard unavailable; select and copy the displayed value.",
            )
          }
        />
        <small>
          {demo.incognito
            ? "A sender uses this public identity to derive a fresh one-time destination."
            : "Normal sending uses this reusable address directly."}
        </small>
      </div>

      <details className={styles.details}>
        <summary>Compare Normal and Incognito</summary>
        <div className={styles.comparison}>
          <div>
            <h3>Normal</h3>
            <p>
              Share a CKB address. Send directly to that address. Receive and
              spend using its existing lock.
            </p>
          </div>
          <div>
            <h3>Incognito</h3>
            <p>
              Share a stealth meta-address. Derive a one-time destination.
              Recognize incoming outputs with a view key; use spend authority to
              prepare a spend.
            </p>
          </div>
        </div>
        <p>
          Both flows expose amounts and sender inputs. Incognito changes
          recipient address linkage, not those public transaction fields.
        </p>
      </details>

      <nav
        className={`module-actions ${styles.tabs}`}
        aria-label="Incognito demo views"
      >
        {(["send", "receive", "disclosure"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={view === tab ? "is-primary" : undefined}
            aria-pressed={view === tab}
            data-testid={`view-${tab}`}
            onClick={() => setView(tab)}
          >
            {tab === "send"
              ? "Send"
              : tab === "receive"
                ? demo.incognito
                  ? "Scan & receive"
                  : "Receive"
                : "Disclosure"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            demo.reset();
            setView("send");
            edited();
          }}
        >
          Reset demo
        </button>
      </nav>

      {view === "send" ? (
        <>
          <div className="module-fields">
            <label className="module-field module-field-wide">
              <span>
                {demo.incognito
                  ? "Recipient stealth meta-address"
                  : "Recipient testnet address"}
              </span>
              <ModuleTextarea
                value={demo.recipient}
                data-testid="recipient-input"
                spellCheck={false}
                onChange={(event) => {
                  demo.updateRecipient(event.currentTarget.value);
                  edited();
                }}
              />
            </label>
            <label className="module-field">
              <span>Amount / CKB · visible on-chain in a live flow</span>
              <input
                value={demo.amount}
                inputMode="decimal"
                data-testid="amount-input"
                onChange={(event) => {
                  demo.updateAmount(event.currentTarget.value);
                  edited();
                }}
              />
            </label>
            <div className={`module-actions ${styles.fixtureButton}`}>
              <button
                type="button"
                onClick={() => {
                  demo.updateRecipient(
                    demo.incognito ? demoIdentity.metaAddress : normalAddress,
                  );
                  edited();
                }}
              >
                Use fixture recipient
              </button>
            </div>
          </div>
          {demo.incognito ? (
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={demo.freshChange}
                data-testid="fresh-change"
                onChange={() => {
                  demo.toggleChange();
                  edited();
                }}
              />
              Preview change to a fresh one-time address
            </label>
          ) : null}
          <div className="module-actions">
            {demo.incognito ? (
              <button
                type="button"
                onClick={() => {
                  demo.derive();
                  edited();
                }}
                data-testid="derive-address"
              >
                Derive one-time address · local
              </button>
            ) : null}
            <button
              type="button"
              className="is-primary"
              data-testid="build-preview"
              disabled={demo.incognito && !demo.payment}
              onClick={() => {
                if (demo.build()) {
                  announce(
                    "Unsigned output prepared locally. Input selection, fees, signing and broadcast are SIMULATED.",
                  );
                }
              }}
            >
              Build unsigned preview
            </button>
          </div>
          {demo.payment ? (
            <div className={styles.result} data-testid="derived-payment">
              <strong>LOCAL · One-time destination derived</strong>
              <Readout
                label="One-time testnet address"
                value={demo.payment.address}
              />
              <Readout
                label="Ephemeral public key · public on-chain in a live flow"
                value={demo.payment.ephemeralPublicKey}
              />
            </div>
          ) : null}
          {demo.draft ? (
            <div className={styles.result} data-testid="unsigned-preview">
              <strong>LOCAL · Unsigned output preview</strong>
              <p>
                No inputs selected. No signature, broadcast, confirmation or
                transaction hash exists.
              </p>
              <details className={styles.details}>
                <summary>CCC output details</summary>
                <pre>{demo.draft}</pre>
              </details>
              {demo.change ? (
                <Readout
                  label="Fresh change destination · not an output yet"
                  value={demo.change.address}
                />
              ) : null}
            </div>
          ) : null}
          <div className={styles.hygiene} data-testid="change-hygiene">
            <ShieldCheck size={16} aria-hidden="true" />
            <p>
              {!demo.incognito
                ? "Normal preview: change would follow the connected wallet's policy in a live flow."
                : demo.freshChange
                  ? "Change hygiene: a fresh destination is prepared locally; change value requires real input and fee completion."
                  : "Fresh change is off. Reusing a change address can reveal links between transactions."}
            </p>
          </div>
        </>
      ) : null}

      {view === "receive" ? (
        demo.incognito ? (
          <>
            <label className="module-field">
              <span>Public fixture view-key profile</span>
              <select
                value={demo.profile}
                data-testid="view-profile"
                onChange={(event) => {
                  demo.updateProfile(event.currentTarget.value);
                  edited();
                }}
              >
                <option value="matching">Matching fixture profile</option>
                <option value="unrelated">Unrelated fixture profile</option>
              </select>
            </label>
            <p>
              Checks two local outputs with public fixture keys. No indexer
              query or live balance lookup.
            </p>
            <div className="module-actions">
              <button
                type="button"
                className="is-primary"
                data-testid="scan-fixtures"
                onClick={() => {
                  const count = demo.scan();
                  if (count !== undefined) {
                    announce(
                      `SIMULATED receive: ${count} matching local fixture(s). No chain scan performed.`,
                    );
                  }
                }}
              >
                Scan fixture payments · simulated
              </button>
            </div>
            {demo.matches ? (
              <div className={styles.result} data-testid="scan-result">
                <strong>
                  {demo.matches.length} matching fixture(s) · SIMULATED
                </strong>
                <p>
                  {incomingFixtures.length - demo.matches.length} nonmatching
                  output(s). These are not live cells.
                </p>
                {demo.matches.map((match) => (
                  <div key={match.id} className={styles.payment}>
                    <strong>
                      {ccc.fixedPointToString(match.capacity)} CKB · fixture
                      amount
                    </strong>
                    <Readout label={match.id} value={match.address} />
                    <div className="module-actions">
                      <button
                        type="button"
                        data-testid="spend-preview"
                        onClick={() => {
                          if (demo.previewSpend(match)) {
                            announce(
                              "Local spend authority verified. Signing and settlement remain SIMULATED.",
                            );
                          }
                        }}
                      >
                        Spend preview · simulated
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {demo.spend ? (
              <div className={styles.result} data-testid="spend-result">
                <strong>LOCAL · Spend authority checked</strong>
                <p>
                  The fixture spend key authorizes this output. No live input or
                  signed transaction is created; the fixture is not marked
                  spent.
                </p>
                <Readout
                  label="Fresh recipient destination"
                  value={demo.spend.destination.address}
                />
                <Readout
                  label="Fresh change destination"
                  value={demo.spend.change.address}
                />
                <p>
                  SIMULATED: live-cell selection, fee completion, lock-specific
                  signing and broadcast.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.result} data-testid="normal-receive">
            <strong>Normal receiving · fixture account</strong>
            <p>
              Share the receiving address above. A normal payment would go
              directly to its existing lock. No live balance or payment history
              is loaded here.
            </p>
            <p>
              Turn on Incognito to compare view-key matching and one-time
              spending.
            </p>
          </div>
        )
      ) : null}

      {demo.error ? (
        <p className={styles.error} role="alert">
          {demo.error}
        </p>
      ) : null}

      <section
        className={styles.disclosure}
        aria-label="Privacy disclosure"
        data-testid="disclosure-panel"
      >
        <h3>
          <Eye size={16} aria-hidden="true" /> What does this reveal?
        </h3>
        <p>
          <strong>Amounts and sender inputs are NOT hidden.</strong>
        </p>
        <p>
          {demo.incognito
            ? "A fresh address reduces direct links to the recipient's reusable identity. The one-time lock and ephemeral public key remain public."
            : "The recipient address is used directly and is visible alongside amounts and sender inputs."}
        </p>
        <p>
          Transaction relationships, timing and network metadata can still
          reveal connections. Public fixture keys offer no privacy for real
          funds.
        </p>
        {view === "disclosure" ? (
          <p>
            This experimental fork does not prove deployment compatibility, live
            signing, settlement or production security. The upstream Transfer
            module remains a separate live wallet operation.
          </p>
        ) : null}
      </section>

      <details className={styles.details}>
        <summary>How the preview would hand off to CCC</summary>
        <ol>
          <li>
            LOCAL:{" "}
            {demo.incognito
              ? "derive the one-time lock with ECDH"
              : "parse the recipient's full-format testnet address"}
            .
          </li>
          <li>
            LOCAL: construct an unsigned output with{" "}
            <code>ccc.Transaction.from</code>.
          </li>
          <li>
            SIMULATED: complete inputs and calculate fees with the
            application&apos;s CCC client and signer.
          </li>
          <li>
            SIMULATED: apply the change policy and sign with a compatible
            signer.
          </li>
          <li>
            SIMULATED: broadcast and wait for settlement. Nothing is submitted
            by this module.
          </li>
        </ol>
        <p>
          <code>@ckb-ccc/stealth</code> is experimental in this fork; it is not
          an accepted upstream CCC package.
        </p>
      </details>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.readout}>
      <span className={styles.eyebrow}>{label}</span>
      <code>{value}</code>
    </div>
  );
}

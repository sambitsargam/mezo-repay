"use client";
import { ExternalLink } from "lucide-react";
import { explorerAddress } from "@repay/sdk";
import { useMode } from "@/lib/mode";
import { deployment, useSelection, useSnapshot } from "@/lib/data";
import { WithdrawOperatingCard } from "@/components/actions";
import { AddressLink, Card, CardHeader, InlineLink, KeyValue, Notice, PageHeader } from "@/components/ui";

const REPO = "https://github.com/sambitsargam/mezo-repay";

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-copper-deep underline-offset-2 hover:underline">
      {children} <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

export default function SettingsPage() {
  const mode = useMode();
  const { account } = useSelection();
  const snap = useSnapshot(account);
  const s = snap.data;
  const repay = deployment.repay;
  const p = deployment.protocol;
  return (
    <div className="animate-rise">
      <PageHeader title="Settings & help" description="Ownership, deployed contracts, funding and known limitations." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account ownership" />
          <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-ink-soft">
            {s ? (
              <KeyValue
                rows={[
                  ["Account contract", <AddressLink key="a" address={s.address} />],
                  ["Owner (fixed at creation)", <AddressLink key="b" address={s.owner} />],
                ]}
              />
            ) : (
              <p className="text-ink-muted">Connect a wallet with an account to see ownership.</p>
            )}
            <p>
              The owner is set once when the account is created and cannot be changed. Only the owner can change policy, borrow, withdraw collateral or
              operating cash, classify transfers, or close the loan. The factory has no admin and holds no funds.
            </p>
          </div>
        </Card>

        {s && mode === "live" ? <WithdrawOperatingCard snap={s} /> : (
          <Card>
            <CardHeader title="Operating cash" />
            <p className="px-5 py-4 text-sm text-ink-muted">Owners withdraw operating cash here. Example mode is read-only.</p>
          </Card>
        )}

        <Card>
          <CardHeader title="Network & contracts" description={`Mezo Testnet · chain ${deployment.chainId}`} />
          <div className="px-5 py-2">
            <KeyValue
              rows={[
                ["RePay factory", repay ? <AddressLink key="a" address={repay.factory} /> : "Not deployed"],
                ["RePay account implementation", repay ? <AddressLink key="b" address={repay.implementation} /> : "—"],
                ["Deployed at block", repay ? repay.deploymentBlock.toLocaleString("en-US") : "—"],
                ["Source commit", repay ? <span key="c" className="font-mono text-xs">{repay.sourceCommit.slice(0, 10)}</span> : "—"],
                ["MUSD", <AddressLink key="d" address={p.musd} />],
                ["Mezo BorrowerOperations", <AddressLink key="e" address={p.borrowerOperations} />],
                ["Mezo TroveManager", <AddressLink key="f" address={p.troveManager} />],
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Testnet funding" />
          <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-ink-soft">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Add Mezo Testnet to your wallet: chain id <span className="num font-mono">31611</span>, RPC <span className="font-mono text-xs">https://rpc.test.mezo.org</span>, currency BTC.
              </li>
              <li>
                Request testnet BTC (and MUSD, if offered) from the <Ext href="https://faucet.test.mezo.org/">Mezo faucet</Ext>.
              </li>
              <li>Keep a little BTC for gas. Opening a loan needs enough BTC for at least 110% of the debt; we suggest 160%+.</li>
              <li>
                Customers paying you need MUSD on Mezo Testnet plus a little BTC for gas.
              </li>
            </ol>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Limitations" />
          <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-ink-soft">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Testnet only. Contracts are self-reviewed and tested, not independently audited.</li>
              <li>Only loans opened by a RePay account are managed. Existing wallet-owned Mezo loans cannot be imported.</li>
              <li>Mezo requires a minimum net debt, so partial repayment stops at that floor; the rest needs an owner-initiated full close.</li>
              <li>Keeper execution is best-effort and not guaranteed. There is no liquidation protection, and collateral is never sold to repay.</li>
              <li>Payment references are labels chosen by the payer or owner, not proof of an invoice.</li>
              <li>Direct MUSD transfers are unclassified until the owner classifies them.</li>
            </ul>
            <p>
              Source and docs: <Ext href={REPO}>{REPO.replace("https://", "")}</Ext> · <Ext href="https://mezo.org/docs/developers/musd/">Mezo MUSD docs</Ext> ·{" "}
              <Ext href={explorerAddress(repay?.factory ?? p.musd)}>Explorer</Ext>
            </p>
            {mode === "example" && (
              <Notice tone="warning">
                You are viewing example data. <InlineLink href="/app">Open the live app</InlineLink>.
              </Notice>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

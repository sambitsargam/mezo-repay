"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Activity, Bot, FlaskConical, Gauge, Landmark, Menu, QrCode, Settings, SlidersHorizontal, X } from "lucide-react";
import { shortAddress } from "@repay/sdk";
import { basePath, useMode } from "@/lib/mode";
import { useNetwork, useSelection } from "@/lib/data";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";
import { cx } from "./ui";

const NAV = [
  { href: "", label: "Overview", icon: Gauge },
  { href: "/receive", label: "Receive", icon: QrCode },
  { href: "/policy", label: "Repayment policy", icon: SlidersHorizontal },
  { href: "/loan", label: "Loan", icon: Landmark },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/automation", label: "Automation", icon: Bot },
  { href: "/settings", label: "Settings & help", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const mode = useMode();
  const base = basePath(mode);
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const full = base + href;
        const active = href === "" ? path === base || path === base + "/setup" : path.startsWith(full);
        return (
          <li key={href}>
            <Link
              href={full}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                active ? "bg-ink text-ivory" : "text-ink-soft hover:bg-ivory-deep hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function AccountSwitcher() {
  const mode = useMode();
  const { account, accounts, select } = useSelection();
  if (mode === "example" || accounts.length < 2) {
    return account ? (
      <p className="truncate px-3 font-mono text-xs text-ink-muted" title={account}>
        Account {shortAddress(account)}
      </p>
    ) : null;
  }
  return (
    <div className="px-3">
      <label htmlFor="account-switch" className="eyebrow">
        Account
      </label>
      <select id="account-switch" className="field mt-1 min-h-[36px] font-mono text-xs" value={account} onChange={(e) => select(e.target.value as `0x${string}`)}>
        {accounts.map((a) => (
          <option key={a} value={a}>
            {shortAddress(a)}
          </option>
        ))}
      </select>
    </div>
  );
}

function NetworkBadge() {
  const mode = useMode();
  const { wrongNetwork } = useNetwork();
  if (mode === "example")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber-wash px-2.5 py-1 text-xs font-medium text-amber">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Example data
      </span>
    );
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", wrongNetwork ? "border-rust/30 bg-rust-wash text-rust" : "border-line bg-surface text-ink-soft")}>
      <span className={cx("h-1.5 w-1.5 rounded-full", wrongNetwork ? "bg-rust" : "bg-copper")} aria-hidden />
      {wrongNetwork ? "Wrong network" : "Mezo Testnet"}
    </span>
  );
}

function ViewingBanner() {
  const { viewing, stopViewing } = useSelection();
  const { address } = useNetwork();
  if (!viewing) return null;
  return (
    <div className="border-b border-line bg-surface px-4 py-2 text-center text-[13px] text-ink-soft" role="note">
      <strong className="font-semibold text-ink">Read-only live view</strong> of account <span className="font-mono">{shortAddress(viewing)}</span> on Mezo testnet.{" "}
      {address ? "Owner-only actions will be rejected by the contract unless your wallet is the owner." : "Connect the owner wallet to manage it."}{" "}
      <button onClick={stopViewing} className="font-medium text-copper-deep underline underline-offset-2">
        Stop viewing
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const mode = useMode();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <div className="min-h-screen">
      {mode === "example" && (
        <div className="border-b border-amber/30 bg-amber-wash px-4 py-2 text-center text-[13px] text-ink-soft" role="note">
          <strong className="font-semibold text-amber">Example data.</strong> Deterministic sample values: not your wallet, not on-chain, no explorer links.{" "}
          <Link href="/app" className="font-medium text-copper-deep underline underline-offset-2">
            Open the live app
          </Link>
        </div>
      )}
      <ViewingBanner />
      <div className="mx-auto flex max-w-[1280px]">
        <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line px-3 py-5 lg:flex" aria-label="Primary">
          <Link href="/" className="mb-6 px-3">
            <Logo />
          </Link>
          <nav aria-label="App sections">
            <NavLinks />
          </nav>
          <div className="mt-auto space-y-3 pt-6">
            <AccountSwitcher />
            <p className="px-3 text-[11px] leading-relaxed text-ink-muted">Testnet deployment. Not audited. No real funds.</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ivory/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild>
                <button className="btn-ghost -ml-2 min-h-[44px] px-2.5 lg:hidden" aria-label="Open navigation">
                  <Menu className="h-5 w-5" aria-hidden />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 lg:hidden" />
                <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-ivory p-4 shadow-lift focus:outline-none lg:hidden">
                  <div className="mb-5 flex items-center justify-between">
                    <Dialog.Title asChild>
                      <span>
                        <Logo />
                      </span>
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button className="btn-ghost min-h-[44px] px-2.5" aria-label="Close navigation">
                        <X className="h-5 w-5" aria-hidden />
                      </button>
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="sr-only">App sections</Dialog.Description>
                  <nav aria-label="App sections">
                    <NavLinks onNavigate={() => setOpen(false)} />
                  </nav>
                  <div className="mt-auto pt-4">
                    <AccountSwitcher />
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <Link href="/" className="lg:hidden" aria-label="Mezo RePay home">
              <Logo />
            </Link>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <span className="hidden sm:inline-flex">
                <NetworkBadge />
              </span>
              <WalletButton compact />
            </div>
          </header>
          <main id="main" className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mb-4 sm:hidden">
              <NetworkBadge />
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

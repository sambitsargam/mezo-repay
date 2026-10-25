import Link from "next/link";
import { ArrowDownLeft, ArrowRight, Bitcoin, Briefcase, Building2, ExternalLink, KeyRound, Landmark, Lock, PenTool, Repeat, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { explorerAddress, getDeployment, mezoTestnet } from "@repay/sdk";
import { Logo } from "@/components/Logo";

const d = getDeployment(mezoTestnet.id)!;
const REPO = "https://github.com/sambitsargam/mezo-repay";

function Preview() {
  // Static illustration with round numbers; labeled, not presented as anyone's data.
  return (
    <figure className="card relative overflow-hidden p-5 shadow-lift sm:p-6" aria-label="Illustration of how a 500 MUSD payment is split">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Illustration</span>
        <span className="rounded-full border border-line bg-ivory px-2.5 py-1 text-[11px] font-medium text-ink-muted">30% to repayment</span>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-line bg-ivory px-4 py-3">
        <span className="rounded-lg bg-sage-wash p-2 text-sage-deep">
          <ArrowDownLeft className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Customer payment · INV-0042</p>
          <p className="text-xs text-ink-muted">Paid through a RePay link</p>
        </div>
        <span className="num text-lg font-semibold text-ink">500.00</span>
      </div>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-ivory-deep" aria-hidden>
        <div className="w-[30%] bg-copper" />
        <div className="flex-1 bg-sage/60" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-copper/25 bg-copper-wash/60 px-3 py-2.5">
          <p className="text-xs font-medium text-copper-deep">To loan repayment</p>
          <p className="num mt-0.5 font-semibold">150.00 <span className="text-xs text-ink-muted">MUSD</span></p>
        </div>
        <div className="rounded-xl border border-sage/30 bg-sage-wash/70 px-3 py-2.5">
          <p className="text-xs font-medium text-sage-deep">Kept as operating cash</p>
          <p className="num mt-0.5 font-semibold">350.00 <span className="text-xs text-ink-muted">MUSD</span></p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-line px-4 py-3">
        <span className="rounded-lg bg-copper-wash p-2 text-copper-deep">
          <Repeat className="h-4 w-4" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 text-sm text-ink">Repayment executed against the Mezo loan</p>
        <span className="num text-sm font-medium text-ink">−150.00</span>
      </div>
      <figcaption className="mt-4 text-xs text-ink-muted">Illustrative numbers. Explore the example to see a full account.</figcaption>
    </figure>
  );
}

const STEPS = [
  { icon: KeyRound, title: "Create an account you control", body: "A small contract owned by your wallet. The factory that makes it has no admin and holds nothing." },
  { icon: Landmark, title: "Borrow MUSD against BTC", body: "The account opens and owns a Mezo Trove. Borrowed MUSD is operating cash, never counted as income." },
  { icon: SlidersHorizontal, title: "Choose your split", body: "Set the share of each payment that goes to repayment, plus a cash reserve, limits and a cooldown." },
  { icon: ArrowDownLeft, title: "Get paid in MUSD", body: "Share a payment link. Each tracked payment is split once, the moment it arrives." },
  { icon: Repeat, title: "Repay automatically, within limits", body: "A keeper, or you, applies the set-aside amount to the loan. Debt and collateral ratio update on-chain." },
];

const USERS = [
  { icon: PenTool, title: "Freelancers", body: "paid in stablecoins who borrowed against BTC instead of selling it." },
  { icon: Building2, title: "Agencies & studios", body: "with steady client invoices and a working-capital loan." },
  { icon: Bitcoin, title: "Bitcoin-holding founders", body: "who want debt to fall as revenue comes in." },
  { icon: Briefcase, title: "Businesses on MUSD", body: "borrowing against BTC and wanting repayment on autopilot." },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <a href="#how" className="btn-ghost hidden sm:inline-flex">How it works</a>
          <a href={REPO} className="btn-ghost hidden sm:inline-flex" target="_blank" rel="noreferrer">Source</a>
          <Link href="/app" className="btn-primary">Launch app</Link>
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pt-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-copper" aria-hidden /> Live on Mezo Testnet
            </span>
            <h1 className="mt-5 font-display text-[40px] leading-[1.05] tracking-tight text-ink sm:text-[56px]">Let your income pay down your Bitcoin loan.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
              Receive MUSD, keep your operating cash, and automatically direct a chosen share toward your Mezo loan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app" className="btn-accent px-5 text-[15px]">
                Launch app <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/example" className="btn-secondary px-5 text-[15px]">Explore example</Link>
            </div>
            <p className="mt-4 text-sm text-ink-muted">Testnet only. Uses test BTC and test MUSD. Not audited.</p>
          </div>
          <Preview />
        </section>

        <section id="how" className="border-y border-line bg-surface/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <p className="eyebrow">How income becomes repayment</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl tracking-tight text-ink">Ordinary business income, flowing into real repayment of Mezo borrowing.</h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="card p-5">
                  <div className="flex items-center gap-2">
                    <span className="num text-xs font-semibold text-copper-deep">0{i + 1}</span>
                    <Icon className="h-4 w-4 text-ink-muted" aria-hidden />
                  </div>
                  <h3 className="mt-3 text-[15px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="eyebrow">Who it&apos;s for</p>
              <ul className="mt-5 space-y-4">
                {USERS.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 rounded-lg border border-line bg-surface p-2 text-ink-soft">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <p className="text-[15px] leading-relaxed text-ink-soft">
                      <strong className="font-semibold text-ink">{title}</strong> {body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow">What it is not</p>
              <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
                Not just a payment link, a subscription biller, a liquidation alert bot or a yield vault. RePay does one thing: it turns a chosen share of
                real customer income into real repayment of the loan your account owns.
              </p>
              <div className="mt-6 card p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <ShieldCheck className="h-4 w-4 text-sage-deep" aria-hidden /> You stay in control
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
                  <li className="flex gap-2"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />Only your wallet can borrow, withdraw, change policy or close.</li>
                  <li className="flex gap-2"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />Keepers can only repay your loan from income you set aside. They can&apos;t move other funds and take no fee.</li>
                  <li className="flex gap-2"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />Collateral is never sold to make repayments. No liquidation protection is promised.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              Built on Mezo MUSD. Deployed to Mezo Testnet (chain 31611).
              {d.repay && (
                <>
                  {" "}Factory{" "}
                  <a className="inline-flex items-center gap-1 font-mono text-ink underline-offset-2 hover:underline" href={explorerAddress(d.repay.factory)} target="_blank" rel="noreferrer">
                    {d.repay.factory.slice(0, 10)}… <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </>
              )}
            </p>
            <div className="flex gap-4">
              <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-ink">Source & docs</a>
              <a href="https://mezo.org/docs/developers/musd/" target="_blank" rel="noreferrer" className="hover:text-ink">Mezo MUSD</a>
              <Link href="/example" className="hover:text-ink">Example</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

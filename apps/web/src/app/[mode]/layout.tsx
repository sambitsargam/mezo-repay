import { notFound } from "next/navigation";
import { ModeProvider, type DataMode } from "@/lib/mode";
import { AccountSelectionProvider } from "@/lib/data";
import { AppShell } from "@/components/AppShell";

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ mode: "app" }, { mode: "example" }];
}

export default function ModeLayout({ children, params }: { children: React.ReactNode; params: { mode: string } }) {
  const mode: DataMode | null = params.mode === "app" ? "live" : params.mode === "example" ? "example" : null;
  if (!mode) notFound();
  return (
    <ModeProvider mode={mode}>
      <AccountSelectionProvider>
        <AppShell>{children}</AppShell>
      </AccountSelectionProvider>
    </ModeProvider>
  );
}

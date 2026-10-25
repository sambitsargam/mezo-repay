/** Re-mounts on every navigation, giving each page a short entry transition. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}

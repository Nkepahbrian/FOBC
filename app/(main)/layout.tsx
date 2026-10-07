import { AlertBridge } from "@/components/AlertBridge";
import { BottomNav } from "@/components/BottomNav";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-black">
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col overflow-x-hidden bg-black text-white shadow-2xl">
        <main className="flex-1 pb-28">{children}</main>
        <AlertBridge />
        <BottomNav />
      </div>
    </div>
  );
}

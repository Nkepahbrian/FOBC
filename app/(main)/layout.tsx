import { BottomNav } from "@/components/BottomNav";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-2xl">
        <main className="flex-1 px-5 pb-28 pt-8">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}

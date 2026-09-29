import { Logo } from "@/components/Logo";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[#0F172A] text-[#0F172A]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white px-6 py-10 shadow-2xl">
        <Logo className="h-14" />
        <div className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
        </div>
        <div className="mt-8 flex-1">{children}</div>
      </div>
    </div>
  );
}

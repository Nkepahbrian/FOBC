import { Logo, Wordmark } from "@/components/Logo";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-[#121212] px-6 py-10 text-white shadow-2xl">
        <div className="flex items-center gap-4">
          <Logo className="h-16 w-16 shrink-0" />
          <div>
            <Wordmark className="text-5xl" />
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-[#EAB308]">Festival of Blessings</p>
          </div>
        </div>
        <div className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{subtitle}</p>
        </div>
        <div className="mt-8 flex-1">{children}</div>
      </div>
    </div>
  );
}

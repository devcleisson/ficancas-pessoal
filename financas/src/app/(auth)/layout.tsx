import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(60rem_30rem_at_50%_-10%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="relative w-full max-w-sm animate-rise">
        <Logo className="mb-8 justify-center" />
        {children}
      </div>
    </div>
  );
}

import { Logo } from '../../components/Logo'

/** The sign-in screens' header: the Clozest logo, and a line about what the app is for. */
export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-8 pb-4 text-center">
      <p className="h-14">
        <Logo name="Clozest" className="h-full" />
      </p>
      {subtitle && <p className="max-w-xs text-muted">{subtitle}</p>}
    </div>
  )
}

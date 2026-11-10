import { useSalonPreferences, useSetSalonPreferences } from '../../api/bookings'
import { messageOf } from '../../api/errors'
import { Banner, Switch } from '../../components/ui'

/**
 * "Time for your next haircut?": one message some days after a visit, for the same services (the salon sets how
 * many days). On unless switched off.
 */
export function ComeBackReminders() {
  const prefs = useSalonPreferences()
  const set = useSetSalonPreferences()
  // Not read (offline): don't show "on" for someone who switched it off, nor let a tap act on a guess
  const unknown = prefs.isError && !prefs.data
  const on = !unknown && (prefs.data?.comeBackReminders ?? true)
  return (
    <div className="flex flex-col gap-2">
      <Switch
        label="Come-back reminders"
        hint="A message when it's time for your next haircut or other service"
        on={on}
        // While a change is saving, a second tap waits (two saves out of order could leave the wrong one)
        busy={set.isPending}
        disabled={prefs.isPending || unknown}
        onChange={(next) => set.mutate({ comeBackReminders: next })}
      />
      {(prefs.isError || set.isError) && <Banner tone="bad">{messageOf(set.error ?? prefs.error)}</Banner>}
      {unknown && (
        <button type="button" className="self-start text-sm text-link underline" onClick={() => prefs.refetch()}>
          Try again
        </button>
      )}
    </div>
  )
}

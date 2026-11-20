import {
  useSalonPreferences,
  useSetSalonPreferences,
} from "../../api/bookings";
import { messageOf } from "../../api/errors";
import { Banner, Switch } from "../../components/ui";
import { useT } from "../../i18n";

/**
 * The salon messages in Profile, each on unless switched off:
 * - "Time for your next haircut?": one message some days after a visit, for the same services (the salon sets how
 *   many days);
 * - offers from salons I visited: a message when one publishes a discount (one salon can be stopped on its page; the
 *   offers still show on the salons' cards and pages).
 * Each switch saves only its own choice. One read of both, so one error and one "Try again".
 */
export function SalonMessageSwitches() {
  const t = useT();
  const prefs = useSalonPreferences();
  const comeBack = useSetSalonPreferences();
  const offers = useSetSalonPreferences();
  // Not read (offline): don't show "on" for someone who switched one off, nor let a tap act on a guess
  const unknown = prefs.isError && !prefs.data;
  const failed = comeBack.error ?? offers.error ?? prefs.error;
  return (
    <div className="flex flex-col gap-4">
      <Switch
        label={t("profile.comeBackReminders")}
        hint={t("profile.comeBackRemindersHint")}
        on={!unknown && (prefs.data?.comeBackReminders ?? true)}
        // While a change is saving, a second tap waits (two saves out of order could leave the wrong one)
        busy={comeBack.isPending}
        disabled={prefs.isPending || unknown}
        onChange={(next) => comeBack.mutate({ comeBackReminders: next })}
      />
      {/* A backend without offers doesn't send salonOffers (and would refuse it): no switch then */}
      {(unknown ||
        prefs.isPending ||
        prefs.data?.salonOffers !== undefined) && (
        <Switch
          label={t("profile.salonOffers")}
          hint={t("profile.salonOffersHint")}
          on={!unknown && (prefs.data?.salonOffers ?? true)}
          busy={offers.isPending}
          disabled={prefs.isPending || unknown}
          onChange={(next) => offers.mutate({ salonOffers: next })}
        />
      )}
      {(prefs.isError || comeBack.isError || offers.isError) && (
        <Banner tone="bad">{messageOf(failed)}</Banner>
      )}
      {unknown && (
        <button
          type="button"
          className="self-start text-sm text-link underline"
          onClick={() => prefs.refetch()}
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

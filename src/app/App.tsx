import { Link, Navigate, Route, Routes } from 'react-router'
import { CodeStep } from '../features/auth/CodeStep'
import { EmailStep } from '../features/auth/EmailStep'
import { NeedHelp } from '../features/help/NeedHelp'
import { MyRequests, RequestDetail } from '../features/help/MyRequests'
import { NameStep } from '../features/auth/NameStep'
import { PhoneStep } from '../features/auth/PhoneStep'
import { RecoverStep } from '../features/auth/RecoverStep'
import { BookingDetail } from '../features/bookings/BookingDetail'
import { MoveBooking } from '../features/bookings/MoveBooking'
import { MyBookings } from '../features/bookings/MyBookings'
import { Home } from '../features/home/Home'
import { Inbox } from '../features/notifications/Inbox'
import { About } from '../features/legal/About'
import { Contact } from '../features/legal/Contact'
import { Privacy } from '../features/legal/Privacy'
import { Terms } from '../features/legal/Terms'
import { ChoosePlace } from '../features/places/ChoosePlace'
import { EditPlace } from '../features/places/EditPlace'
import { ChangeEmail } from '../features/profile/ChangeEmail'
import { ChangePhone } from '../features/profile/ChangePhone'
import { DeleteAccount } from '../features/profile/DeleteAccount'
import { Profile } from '../features/profile/Profile'
import { BookTime } from '../features/salon/BookTime'
import { ConfirmBooking } from '../features/salon/ConfirmBooking'
import { SalonPage } from '../features/salon/SalonPage'
import { EmptyState, Page } from '../components/ui'
import { useT } from '../i18n'
import { LanguageFirst, LanguageFirstGate } from '../i18n/LanguageFirst'
import { returningToSalon } from '../features/auth/flow'
import { EmailVerifiedOnly, FinishingProfile, SignedIn, SignedOutOnly } from './guards'
import { Bare, Shell } from './Shell'

export function App() {
  const t = useT()
  return (
    <Routes>
      <Route element={<Bare />}>
        <Route element={<SignedOutOnly />}>
          {/* The first screen on a phone where no language was chosen yet: the language, then sign-in in it */}
          <Route
            path="/signin"
            element={
              <LanguageFirstGate>
                <PhoneStep />
              </LanguageFirstGate>
            }
          />
          <Route path="/signin/code" element={<CodeStep />} />
          <Route
            path="/signin/recover"
            element={
              <LanguageFirstGate>
                <RecoverStep />
              </LanguageFirstGate>
            }
          />
        </Route>
        <Route element={<FinishingProfile />}>
          <Route path="/welcome/name" element={<NameStep />} />
        </Route>
        {/* Public pages: open to everyone, signed in or not (Razorpay's website check, and anyone opening a link) */}
        {/* Choose the language: first on a new phone, and from "Change" on the sign-in screen */}
        <Route path="/language" element={<LanguageScreen />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        {/* The email used to be a sign-up step: an old link or tab goes to its new place */}
        <Route path="/welcome/email" element={<Navigate to="/verify-email" replace />} />
      </Route>

      <Route element={<SignedIn />}>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="/bookings" element={<MyBookings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route element={<Bare />}>
          <Route path="/verify-email" element={<EmailStep />} />
          {/* Deleting the account never asks for an email first: nobody should have to give one to leave */}
          <Route path="/profile/delete" element={<DeleteAccount />} />
          <Route path="/salons/:id" element={<SalonPage />} />
          {/* Changing the number never waits for an email: it can come before one is verified (the second code then
              goes to the number they have now) */}
          <Route path="/profile/phone" element={<ChangePhone />} />
          {/* Reading and adding to my requests: only someone who verified an email ever has one */}
          <Route path="/help/requests" element={<MyRequests />} />
          <Route path="/help/requests/:id" element={<RequestDetail />} />
          <Route element={<EmailVerifiedOnly />}>
            <Route path="/salons/:id/book" element={<BookTime />} />
            <Route path="/salons/:id/confirm" element={<ConfirmBooking />} />
          </Route>
          {/* Saving a place needs no email: browsing salons near an address works from the first day (booking still does) */}
          <Route path="/places/new" element={<EditPlace />} />
          <Route path="/places/:id" element={<EditPlace />} />
          {/* Need help's answers, Call us and WhatsApp are for everyone signed in; writing to us still waits for the
              email (NeedHelp says so on the page, with one tap to verify) */}
          <Route path="/help" element={<NeedHelp />} />
          <Route path="/bookings/:id" element={<BookingDetail />} />
          <Route path="/bookings/:id/move" element={<MoveBooking />} />
          <Route path="/notifications" element={<Inbox />} />
          <Route path="/profile/email" element={<ChangeEmail />} />
          <Route path="/places" element={<ChoosePlace />} />
        </Route>
      </Route>

      <Route element={<Bare />}>
        <Route
          path="*"
          element={
            <Page back="/">
              <EmptyState
                title={t('app.notFoundTitle')}
                action={
                  <Link to="/" className="text-link underline">
                    {t('app.notFoundLink')}
                  </Link>
                }
              />
            </Page>
          }
        />
      </Route>
    </Routes>
  )
}

/** The language screen; opened from a salon's link, it says the salon comes next (the link didn't go wrong). */
function LanguageScreen() {
  const t = useT()
  return (
    <LanguageFirst
      note={returningToSalon() ? <p className="text-center text-sm text-muted">{t('language.salonNext')}</p> : undefined}
    />
  )
}

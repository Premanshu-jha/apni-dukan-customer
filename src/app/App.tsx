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
import { EmailVerifiedOnly, FinishingProfile, SignedIn, SignedOutOnly } from './guards'
import { Bare, Shell } from './Shell'

export function App() {
  return (
    <Routes>
      <Route element={<Bare />}>
        <Route element={<SignedOutOnly />}>
          <Route path="/signin" element={<PhoneStep />} />
          <Route path="/signin/code" element={<CodeStep />} />
          <Route path="/signin/recover" element={<RecoverStep />} />
        </Route>
        <Route element={<FinishingProfile />}>
          <Route path="/welcome/name" element={<NameStep />} />
        </Route>
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
            <Route path="/places/new" element={<EditPlace />} />
            <Route path="/places/:id" element={<EditPlace />} />
            <Route path="/help" element={<NeedHelp />} />
          </Route>
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
                title="Page not found"
                action={
                  <Link to="/" className="text-link underline">
                    Go home
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

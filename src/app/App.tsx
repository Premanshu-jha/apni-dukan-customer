import { Link, Route, Routes } from 'react-router'
import { CodeStep } from '../features/auth/CodeStep'
import { EmailStep } from '../features/auth/EmailStep'
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
import { DeleteAccount } from '../features/profile/DeleteAccount'
import { Profile } from '../features/profile/Profile'
import { BookTime } from '../features/salon/BookTime'
import { ConfirmBooking } from '../features/salon/ConfirmBooking'
import { SalonPage } from '../features/salon/SalonPage'
import { EmptyState, Page } from '../components/ui'
import { FinishingProfile, SignedIn, SignedOutOnly } from './guards'
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
          <Route path="/welcome/email" element={<EmailStep />} />
          <Route path="/welcome/name" element={<NameStep />} />
        </Route>
      </Route>

      <Route element={<SignedIn />}>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="/bookings" element={<MyBookings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route element={<Bare />}>
          <Route path="/salons/:id" element={<SalonPage />} />
          <Route path="/salons/:id/book" element={<BookTime />} />
          <Route path="/salons/:id/confirm" element={<ConfirmBooking />} />
          <Route path="/bookings/:id" element={<BookingDetail />} />
          <Route path="/bookings/:id/move" element={<MoveBooking />} />
          <Route path="/notifications" element={<Inbox />} />
          <Route path="/profile/email" element={<ChangeEmail />} />
          <Route path="/profile/delete" element={<DeleteAccount />} />
          <Route path="/places" element={<ChoosePlace />} />
          <Route path="/places/new" element={<EditPlace />} />
          <Route path="/places/:id" element={<EditPlace />} />
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

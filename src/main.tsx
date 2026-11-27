import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TestBuildMark } from './components/TestBuildMark'
import { KIRANA_TEST_BUILD } from './lib/config'
import { BrowserRouter } from 'react-router'
import { refreshSession, whenSessionEnds } from './api/client'
import { retryDelay, retryRead } from './api/errors'
import { finishUnregister, listenForAppMessages } from './api/appPush'
import { claimSubscription, closeShownNotifications, dropBrowserSubscription, registerWorker } from './api/push'
import { isSlotsKey } from './api/salons'
import { App } from './app/App'
import { NativeBridge } from './app/NativeBridge'
import { forgetHelpDrafts } from './features/help/drafts'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdatePrompt } from './components/UpdatePrompt'
import { forgetReturn } from './features/auth/flow'
import { restoreLanguage } from './i18n'
import { LanguageToast } from './i18n/LanguageToast'
import { followAccountLanguage } from './lib/accountLanguage'
import { linkTarget, notificationTarget, openInApp } from './lib/appEvents'
import { BUSINESS } from './lib/business'
import { appShellWithoutBridge, isApp } from './lib/platform'
import { UpdateWebView } from './app/UpdateWebView'
import { AppUpdateGate } from './app/AppUpdate'
import { startAppUpdates, switchScreensAtStart } from './lib/appUpdates'
import { App as CapApp } from '@capacitor/app'
import { useDraft } from './store/bookingDraft'
import { followOtherTabs, useSession } from './store/session'
import { useLocation } from './store/location'
import { useSalonSearch } from './store/salonSearch'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry network blips, never answers the backend meant (a 4xx is final).
      retry: retryRead,
      // Waits as long as the backend's Retry-After asks (SERVICE_BUSY), else 1 s, 2 s
      retryDelay,
      refetchOnWindowFocus: true,
    },
  },
})

// The backend ended the session (expired, signed out everywhere, account deleted elsewhere): tidy this browser.
whenSessionEnds(() => {
  void dropBrowserSubscription()
  void closeShownNotifications()
  forgetReturn()
  forgetHelpDrafts()
  useDraft.getState().clear()
  // A shared phone: the next person mustn't see this one's saved address or last GPS point
  useLocation.getState().clear()
  // Nor what this one searched for (the store's own sign-out watch may not be running yet at start-up)
  useSalonSearch.getState().clear()
  queryClient.clear()
})

// Each new sign-in claims this browser's notification address for the person now signed in.
useSession.subscribe((now, before) => {
  if (now.status === 'signedIn' && before.status !== 'signedIn') void claimSubscription()
  // Signed out in any way, also from another tab: this tab forgets the places too (its draft is its own)
  if (now.status === 'signedOut' && before.status === 'signedIn') useLocation.getState().clear()
})

// Signed out in another tab (or someone else signed in there): this tab forgets the last person too, as a sign-out
// here does: their cached bookings, requests and salons, help drafts, where they were going, what they searched for
followOtherTabs(() => {
  forgetReturn()
  forgetHelpDrafts()
  useSalonSearch.getState().clear()
  queryClient.clear()
})

/** Start-up: pick up a saved session by swapping its refresh token for a fresh access token. */
async function start() {
  const session = useSession.getState()
  session.restore()
  if (useSession.getState().status === 'starting') {
    const ok = await refreshSession()
    // A network blip at start keeps the saved user; the next call tries the refresh again.
    if (!ok && useSession.getState().refreshToken) useSession.setState({ status: 'signedIn' })
  }
  void registerWorker()
  // A message arrived while the app is open (the website: from the service worker; the Play Store app: from Firebase)
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent<{ kind?: string }>) => {
    if (e.data?.kind !== 'push') return
    refreshForMessage()
  })
  if (isApp()) {
    // Which screens to use from the next start, and whether this app is too old (lib/appUpdates.ts)
    startAppUpdates()
    // A sign-out that couldn't tell Firebase (offline) finishes now
    void finishUnregister()
    // A tap on a notification opens its screen (by the service worker's rule); a salon's link opens in the app
    listenForAppMessages(
      () => refreshForMessage(),
      (m) => openInApp(notificationTarget(m.url)),
    )
    void CapApp.addListener('appUrlOpen', ({ url }) => {
      const path = linkTarget(url, new URL(BUSINESS.website).host)
      if (path) openInApp(path)
    })
  }
}

/**
 * A message arrived while the app is open: refresh the bell, the list and the bookings it may be about, and any free
 * times on screen (a cancel or a move just changed them).
 */
function refreshForMessage() {
  void queryClient.invalidateQueries({ queryKey: ['inbox'] })
  void queryClient.invalidateQueries({ queryKey: ['bookings'] })
  void queryClient.invalidateQueries({ predicate: (q) => isSlotsKey(q.queryKey) })
}

// The language chosen on this phone before (shown at once from the texts kept on the phone)
void restoreLanguage()
// Then each account's own language, saved on the account too
followAccountLanguage()
if (appShellWithoutBridge()) {
  // The Play Store app on a too-old Android System WebView: only the screen asking for its update
  createRoot(document.getElementById('root')!).render(<UpdateWebView />)
} else {
  // The Play Store app first switches to the screens it downloaded last time, if any (it reloads into them, so
  // nothing else starts); the website starts at once
  void switchScreensAtStart().then((reloading) => {
    if (reloading) return
    void start()
    createRoot(document.getElementById('root')!).render(<Root />)
  })
}

function Root() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ErrorBoundary>
            <AppUpdateGate>
              <App />
            </AppUpdateGate>
          </ErrorBoundary>
          <UpdatePrompt />
          <NativeBridge />
          <LanguageToast />
          <TestBuildMark on={KIRANA_TEST_BUILD} />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  )
}

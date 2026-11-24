package com.clozest.customer;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Opens this app's notification settings: when the customer turned them off, one tap instead of a menu path that
 * differs by phone brand.
 */
@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    /**
     * What the update check tells the backend about this app (src/lib/appUpdates.ts): its native part's level
     * (android/native-level), its versionCode (the CI run that built it; the screens it came with are that run's) and
     * whether it is a test APK (debug build) rather than the Play Store's.
     */
    @PluginMethod
    public void nativeInfo(PluginCall call) {
        JSObject info = new JSObject();
        info.put("nativeLevel", BuildConfig.NATIVE_LEVEL);
        info.put("versionCode", BuildConfig.VERSION_CODE);
        info.put("debug", BuildConfig.DEBUG);
        // Built with the public key screen updates are checked against (capacitor.config.ts, CAPGO_PUBLIC_KEY): only
        // then does the updater refuse a bundle not signed with our key, so only then are updates downloaded at all
        String key = getBridge().getConfig().getPluginConfiguration("CapacitorUpdater").getString("publicKey", "");
        info.put("updatesSigned", key != null && key.startsWith("-----BEGIN RSA PUBLIC KEY-----"));
        call.resolve(info);
    }

    @PluginMethod
    public void openNotifications(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", getContext().getPackageName(), null));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Couldn't open the settings", "UNAVAILABLE");
        }
    }

    /**
     * Sign-out: Firebase forgets this phone's token, and the promise says whether it really did (Capacitor's own
     * unregister answers before Firebase has, so a sign-out offline would look done). Rejected "OFFLINE" when Firebase
     * couldn't be reached: the app tries again at its next start.
     */
    @PluginMethod
    public void dropPushToken(PluginCall call) {
        FirebaseMessaging messaging;
        try {
            messaging = FirebaseMessaging.getInstance();
        } catch (IllegalStateException e) {
            call.resolve();   // built without Firebase: there is no token
            return;
        }
        messaging.setAutoInitEnabled(false);
        messaging.deleteToken().addOnCompleteListener(task -> {
            if (task.isSuccessful()) {
                call.resolve();
            } else {
                call.reject("Firebase couldn't be reached", "OFFLINE");
            }
        });
    }
}

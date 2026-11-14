# Desktop Android Preview

## Production checklist

- [ ] ADB resolves (`KEXOZ_ADB_PATH` or SDK platform-tools)
- [ ] Emulator or USB device shows as `device` in New Share → Android
- [ ] Share URL opens the device frame viewer without installing desktop
- [ ] Request control → tap updates the real device
- [ ] Desktop panel shows **REMOTE CONTROL ACTIVE**; Revoke control works
- [ ] Stop/start share reconnects the same saved device on this computer
- [ ] Screenshot note creates feedback via `/__kexoz`
- [ ] Password / guest links still gate private shares
- [ ] Existing HTTP/E2E/TCP/UDP shares unaffected
- [ ] iOS control remains disabled (**Coming soon**)

## Setup

1. Install [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) (or Android Studio SDK).
2. Optional: install [scrcpy](https://github.com/Genymobile/scrcpy) on PATH for lower-latency capture later.
3. Start an Android Emulator **or** enable USB debugging on a physical device and authorize this computer.
4. In Kexoz Desktop → New Share → **Android** → select the device → Start sharing.
5. Open the share URL in a browser → **Request control** → tap/swipe/type.

## Environment

| Variable | Purpose |
|----------|---------|
| `KEXOZ_ADB_PATH` | Absolute path to `adb` / `adb.exe` when not on PATH |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Used to locate `platform-tools/adb` |

## Security

- ADB talks to devices on the developer machine only.
- The public share reverse-proxies a **loopback** agent that accepts an allowlisted input JSON schema.
- Only one browser viewer holds the controller lease at a time; revoke from desktop when needed.
- Never expose ADB ports publicly.

## Platform notes

| Platform | Status |
|----------|--------|
| Android emulator / USB | Supported (MJPEG + allowlisted ADB input) |
| scrcpy H.264 | Detected; deeper bridge next |
| iOS Simulator / iPhone | **Coming soon** (hidden from start flow except as disabled control) |

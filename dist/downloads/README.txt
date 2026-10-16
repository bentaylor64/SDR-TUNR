# SDR-TUNR 1.14.0 · browser preview

A local browser receiver using the same C radio engine as the native 1.14.0 build. The browser controls the radio and plays audio; a small local Python bridge talks to the installed RTL-SDR driver. No cloud server, account, frontend framework, npm install, or pip packages are required.

This is a browser **preview based on 1.14.0**, not a claim of complete native feature parity. See [feature coverage](../research/WEB_FEATURE_PARITY.md). Physical USB capture and browser playback transport passed in all six modes on this Mac with volume muted; intelligible reception and Windows operation still require target-machine acceptance testing.

## Open the app

The public testing site offers a clearly labeled browser-only demo with a generated tone and spectrum. It does not receive radio signals, exercise the native demodulators, or connect to the local bridge. Download the package from its Connections page and follow the platform setup below for real SDR testing. The public preview keeps scanning and hardware controls in the local app.

**On this Mac:** open `web/Launch-Web.command`. The shared receiver core is included in the local preview package for this Mac's architecture. Python 3.9 or later is required. Keep the launcher window open while listening. Closing it stops the bridge. Open **Connections → Detect receiver**, select your SDR in Radio settings if needed, and press **Start**.

**On Windows:** use the setup below, then double-click `web\Launch-Web.bat`.

You can also start it from the project directory:

```sh
python3 scripts/run-web.py
```

This builds the radio core if absent, starts the bridge on `http://127.0.0.1:8780`, and opens your browser. A build failure still opens connection help; it does not simulate a working receiver. If port 8780 is already occupied, add `--port 8781`. Use the same address consistently because browser favorites are stored per origin, including the port.

Opening a tab checks the bridge without reserving the SDR. **Start** claims the receiver; **Stop** releases it even when the tab stays open. If another tab is listening, stop it there before starting here. Startup waits for receiver confirmation and reports connection or audio initialization failures instead of silently hanging. After updating the preview, restart the bridge and refresh any previously open tabs. Start and Stop have been checked in the user's normal Brave window without changing browser security settings.

## Windows setup

1. Install 64-bit Python 3.9 or later from [Python](https://www.python.org/downloads/windows/).
2. Install the **WinUSB driver for the SDR's correct USB interface** using the [Nooelec setup guide](https://support.nooelec.com/hc/en-us/articles/360005805834-NESDR-Series) or your SDR manufacturer's instructions. The usual RTL2832U interface is Bulk-In Interface 0. Do not replace drivers for unrelated USB devices.
3. Install a matching 64-bit `librtlsdr.dll`/`rtlsdr.dll` and its `libusb-1.0.dll` dependencies from a trusted RTL-SDR distribution. The kernel WinUSB driver and user-space RTL-SDR library are separate requirements. Point `RTLSDR_LIBRARY` to the **absolute path** of the RTL-SDR DLL, for example in PowerShell:

   ```powershell
   $env:RTLSDR_LIBRARY = 'C:\SDR\rtlsdr.dll'
   ```

4. Build the small native core once. Install [MSYS2](https://www.msys2.org/); in its **UCRT64** shell, install `mingw-w64-ucrt-x86_64-gcc`. Add `C:\msys64\ucrt64\bin` to PATH for the build or supply the compiler explicitly:

   ```powershell
   py -3 scripts/build-web-core.py --cc C:/msys64/ucrt64/bin/gcc.exe
   py -3 scripts/run-web.py
   ```

The Windows build uses MinGW-w64, not MSVC. Python, the compiled core and driver DLL must share the same architecture. The compiler is needed to build the core, not for everyday listening. This release does **not** include a prebuilt or hardware-verified Windows DLL. A Mac `.dylib` does not run on Windows.

After setup, launch from the environment where `RTLSDR_LIBRARY` is set, or save that environment variable through Windows settings before using the launcher. Close other SDR software before starting reception.

## macOS and Linux setup

macOS needs Python 3.9+, Xcode Command Line Tools if building from source, and `librtlsdr` from MacPorts or Homebrew. Existing `/opt/local`, `/opt/homebrew`, and `/usr/local` installations are detected. Linux needs Python 3.9+, a C compiler with pthreads, `librtlsdr`, and receiver USB permissions configured by the distribution's RTL-SDR package. If another DVB driver or radio program owns the receiver, it must release it first.

```sh
python3 scripts/build-web-core.py
python3 web/bridge/server.py --open
```

The server binds only to IPv4 loopback. It cannot receive a remote visitor's USB device. Open the app through this server; opening `index.html` as a file or copying it to static hosting is not a working hardware setup.

## Browser USB and serial permissions

RTL-SDR is a USB receiver, not a serial radio. The working reception path is **browser → local bridge → librtlsdr → USB SDR**. The browser does not load Windows DLLs or macOS drivers.

The Connections page also offers a **WebUSB identification** picker in supporting browsers. A user click and browser permission are required. Identification proves only that the browser can see the selected USB identity; it neither claims the radio nor starts streaming. Reception continues through the local bridge. There is no Web Serial receiver backend in this preview.

[Chrome's WebUSB documentation](https://developer.chrome.com/docs/capabilities/usb) explains secure contexts and user permission. Its [platform setup documentation](https://developer.chrome.com/docs/capabilities/build-for-webusb) explains the Windows WinUSB requirement. [Web Serial](https://developer.chrome.com/docs/capabilities/serial) applies to devices exposing serial ports. The primary acceptance browser is a current Chromium browser such as Chrome or Edge; other browsers with AudioWorklet can use the bridge even without WebUSB, but need their own validation.

## Lean playback design

- The existing optimized C engine handles 1.536 MS/s IQ and all six demodulators. Raw continuous IQ never enters the UI thread.
- A socket worker sends 48 kHz mono Float32 audio directly to an AudioWorklet through a MessageChannel. Audio data is transferred, not JSON encoded or repeatedly copied through rendering code.
- The playback ring starts with a 64 ms reserve and caps queued audio at 160 ms. Overflow drops old samples to regain live playback; this is a queue policy, **not a measured end-to-end latency guarantee**. Device/output latency and USB scheduling add delay.
- The native capture and bridge queues are bounded. A stalled socket disconnects rather than growing an unbounded backlog. Only one listening tab owns the receiver; Stop or disconnect releases it, and idle tabs do not reserve it.
- A separate worker computes a 4096-point spectrum at at most 10 frames/second with one frame in flight. The waterfall retains a bounded history. Hidden pages and inactive spectrum views disable spectrum work.
- Airport and repeater data are bundled geographically and fetched only when needed. Fonts, scripts and styles are local. ZIP lookup is the only external request needed for nearby channel discovery.

Connections shows queued audio, underruns, and dropped audio frames. These are playback diagnostics, not measurements of RF station quality. Fine tuning reuses a stationary capture center when possible. Retune status fences discard old audio and spectrum frames.

## Verification and development

Browser and bridge tests are included in the preview. The final two commands below exercise the existing native application and require the full development repository.

```sh
python3 -m unittest discover -s web/bridge -p 'test*.py'
node --test Tests/Web/*.test.mjs
bash scripts/test-capture.sh
bash scripts/test.sh
```

For an explicit synthetic transport check without hardware:

```sh
python3 web/bridge/server.py --demo --port 8781
```

The UI labels this **DEMO · SYNTHETIC SIGNAL**. Demo mode is opt-in and never substitutes for an absent receiver. Do not use it as evidence of USB reception, actual station audio, or full native DSP behavior.

Create a shareable source-and-browser preview archive with `python3 scripts/package-web.py`. It includes any locally built native core; rebuild that core on a different OS/architecture. See [verification results](../research/WEB_VERIFICATION.md) for measured checks and remaining hardware acceptance work.

# WidgetKit Setup (Step 4)

This project now provides a web-side snapshot at local storage key:

- `mycliniq_widget_today_v1`

And optional bridge calls:

- `MycliniqWidgetBridge.setTodaySnapshot({ snapshotJson })`
- `webkit.messageHandlers.mycliniqWidget.postMessage(snapshot)`

Use this guide after running:

```bash
npm run mobile:add:ios
npm run mobile:sync:ios
npm run mobile:open:ios
```

## 1) Create Widget Extension in Xcode

1. Open `ios/App/App.xcworkspace`
2. File -> New -> Target...
3. Choose `Widget Extension`
4. Name: `MycliniqTodayWidget`
5. Include configuration intent: off
6. Activate the new scheme when asked

## 2) Add App Group Capability

Add the same App Group for both targets:

- App target (`App`)
- Widget target (`MycliniqTodayWidgetExtension`)

Example:

- `group.at.mycliniq.shared`

## 3) Add bridge file to app target

Add `ios/widget-template/MycliniqWidgetBridge.swift` to the app target membership.

Purpose:

- receive snapshot JSON from web bridge
- store it in app-group `UserDefaults`
- trigger widget refresh via `WidgetCenter`

## 4) Replace widget source

Replace generated widget source with:

- `ios/widget-template/MycliniqTodayWidget.swift`

This file reads from app-group storage key:

- `mycliniq_widget_today_v1`

## 5) Wire WKWebView message handler

In your Capacitor app delegate / web view setup, register handler:

- name: `mycliniqWidget`
- payload: JSON object from web app

Forward payload JSON into `MycliniqWidgetBridge.shared.setTodaySnapshot(jsonString:)`.

## 6) Validate

1. Run app on device/simulator
2. Login and open dashboard
3. Add widget to home screen
4. Confirm widget updates when dashboard data refreshes

## Notes

- Keep payload small and non-sensitive.
- Do not store auth token in app-group.
- `generatedAt` helps debug stale widget data.

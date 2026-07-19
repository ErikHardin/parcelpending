# parcelpending

## Home-screen widget (iOS)

`scriptable-widget.js` is a [Scriptable](https://scriptable.app) script that renders a
small square home-screen widget showing how many packages are waiting for pickup,
plus the CODE128 barcode for the most recent pending code. It reads the same
Firebase database as the web app, so it stays in sync automatically, and tapping
the widget opens the full app.

Setup:

1. Install Scriptable from the App Store.
2. Create a new script named "Parcel Pickup" and paste in the contents of
   `scriptable-widget.js`.
3. Add a **Small** Scriptable widget to your home screen.
4. Long-press the widget → Edit Widget → set Script to "Parcel Pickup".

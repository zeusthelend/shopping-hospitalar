# Shopping hospitalar

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://shopping-hospitalar.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9307696b-3411-4b4f-9125-52eebc082b8c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Android push notifications

Configure Firebase Cloud Messaging for the Android application (`br.com.shoppinghospitalar.portal`) and place its `google-services.json` in `android/app/` (this file is intentionally not committed or tracked). Then run `npm run android:sync` before building the APK. Without this Firebase configuration, Android push notifications cannot be delivered.

Administrators and employees must register each device from **Notificações → Ativar no celular** and grant notification permission. DAV and chat alerts are sent through Firebase and can appear when the app is in the background or closed, including while the screen is locked. Web users must enable browser notifications on the published HTTPS site; background delivery depends on the browser supporting Firebase Web Push.


## Chat audio and video calls

WebRTC calls use STUN for initial connectivity and Metered TURN relays for restrictive NATs and mobile networks. Configure these build-time variables in the hosting environment (Lovable/Vercel), then rebuild/redeploy:

- `VITE_METERED_DOMAIN`: the Metered app domain from Developers, for example `yourappname.metered.live` (domain only or full HTTPS URL is accepted).
- `VITE_METERED_TURN_API_KEY`: the API key from the specific TURN credential under **TURN Server & SFU → Credentials → Get credential → Show API Key**.

The credential-scoped TURN API key is intended by Metered for client-side retrieval of ICE servers. Do not use the account-wide Metered Secret Key in frontend variables. The app fetches the complete ICE server array from Metered at call setup and retains the existing STUN fallback. Legacy `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL` variables remain supported as a fallback.

After configuring variables, rebuild/redeploy and test a call between two devices on different networks (for example, Wi-Fi and mobile data). TURN improves connectivity but cannot guarantee calls on every network. The chat displays diagnostics when ICE negotiation fails.

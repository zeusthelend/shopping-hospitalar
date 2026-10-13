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

WebRTC calls use STUN for initial connectivity and can use a TURN relay when the caller and recipient are behind restrictive NATs or mobile networks. For reliable production calling, configure these environment variables in the hosting environment (Lovable Cloud/Vercel) and rebuild/redeploy:

- `VITE_TURN_URLS`: comma-separated TURN URLs, for example `turn:turn.example.com:3478,turns:turn.example.com:5349`.
- `VITE_TURN_USERNAME`: TURN username issued by your TURN provider.
- `VITE_TURN_CREDENTIAL`: TURN credential issued by your TURN provider.

Do not commit TURN credentials to the repository. Without a configured TURN relay, some networks will still be unable to connect peer-to-peer. The chat displays a connection diagnostic when ICE negotiation fails.

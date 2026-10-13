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


## Configuração de chamadas de áudio e vídeo

A chamada WebRTC usa a rota segura `/api/turn-credentials` para obter servidores ICE/TURN. Configure no ambiente do servidor de hospedagem (Vercel), sem o prefixo `VITE_`:

- `METERED_DOMAIN`: domínio do app Metered, por exemplo `tiozeus.metered.live`.
- `METERED_TURN_API_KEY`: chave da credencial TURN específica criada no Metered.

Essas variáveis devem ficar somente no servidor; não coloque a chave TURN em variáveis públicas `VITE_*` nem no código-fonte. Depois de salvar as variáveis, faça um novo deploy. Para testar, use dois dispositivos em redes diferentes (por exemplo, computador no Wi-Fi e celular nos dados móveis).

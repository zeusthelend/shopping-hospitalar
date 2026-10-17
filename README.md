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

A integração ativa de chamadas usa somente o LiveKit. No Worker de produção `shopping-hospitalar`, configure:

- `LIVEKIT_URL`: URL do servidor LiveKit (normalmente começa com `wss://`).
- `LIVEKIT_API_KEY`: chave de API do projeto LiveKit.
- `LIVEKIT_API_SECRET`: segredo de API do projeto LiveKit. Mantenha-o como secret do Worker; nunca use o prefixo `VITE_` e nunca o exponha no navegador.

A rota `/api/livekit-session` valida a sessão Supabase, a aprovação do usuário e a participação na conversa antes de emitir tokens de curta duração. O token é assinado no servidor e não é persistido no banco. A URL e o token são enviados ao cliente apenas para conectar à sala autorizada.

O Cloudflare RealtimeKit foi removido do fluxo de chamadas. O Cloudflare Worker continua sendo o runtime de hospedagem da aplicação; não remova o Worker nem as configurações necessárias para servir o site.

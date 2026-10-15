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

A chamada usa o Cloudflare RealtimeKit. No ambiente do Worker `shopping-hospitalar`, configure os seguintes valores como variáveis e secrets do servidor:

- `CLOUDFLARE_ACCOUNT_ID`: identificador da conta Cloudflare.
- `CLOUDFLARE_REALTIMEKIT_APP_ID`: ID do app RealtimeKit.
- `CLOUDFLARE_API_TOKEN`: token Cloudflare com permissão Realtime; mantenha-o como secret do Worker e nunca use o prefixo `VITE_`.
- `CLOUDFLARE_REALTIMEKIT_HOST_PRESET` (opcional): preset de quem inicia a chamada. O padrão é `group_call_host`.
- `CLOUDFLARE_REALTIMEKIT_PARTICIPANT_PRESET` (opcional): preset de quem atende. O padrão é `group_call_participant`.

O app precisa ter os presets `group_call_host` e `group_call_participant`, ou os nomes configurados acima. O servidor valida a sessão Supabase e a participação na conversa antes de criar uma sala ou emitir um token de participante. O token RealtimeKit nunca é persistido no banco.

O fluxo mantém o toque e as permissões de chamadas do chat e inicia a mídia somente depois que a chamada é atendida.

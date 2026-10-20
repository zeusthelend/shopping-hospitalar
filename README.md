# Shopping Hospitalar

Portal corporativo do Shopping Hospitalar.

**Aplicativo em produção:** https://shopinghospitalar.replicatepixels.live

Este projeto é desenvolvido no [Lovable](https://lovable.dev/projects/9307696b-3411-4b4f-9125-52eebc082b8c) e sincronizado com este repositório GitHub.

## Desenvolvimento

Requer Node.js e npm.

```sh
git clone https://github.com/zeusthelend/shopping-hospitalar.git
cd shopping-hospitalar
npm install
npm run dev
```

## Notificações Android

Configure o Firebase Cloud Messaging para o aplicativo Android (`br.com.shoppinghospitalar.portal`) e coloque `google-services.json` em `android/app/` (esse arquivo não deve ser enviado ao Git). Depois execute `npm run android:sync` antes de gerar o APK.

Administradores e funcionários devem registrar cada dispositivo em **Notificações → Ativar no celular** e conceder permissão. As notificações web dependem do suporte do navegador e da configuração do Firebase Web Push.

## Chamadas de áudio e vídeo

A integração de chamadas usa LiveKit. No Worker de produção `shopping-hospitalar`, configure os secrets:

- `LIVEKIT_URL`: URL do servidor LiveKit (normalmente começa com `wss://`).
- `LIVEKIT_API_KEY`: chave de API do projeto LiveKit.
- `LIVEKIT_API_SECRET`: segredo de API do projeto LiveKit. Mantenha-o como secret do Worker; nunca use o prefixo `VITE_` nem o exponha no navegador.

A rota `/api/livekit-session` valida a sessão Supabase, a aprovação do usuário e a participação na conversa antes de emitir tokens de curta duração. Os tokens são assinados no servidor e não são persistidos no banco.

O Cloudflare RealtimeKit não faz parte do fluxo de chamadas. O Cloudflare Worker continua sendo o ambiente de hospedagem; não remova o Worker nem as configurações necessárias para servir o site. O Supabase permanece como banco e autenticação do aplicativo.

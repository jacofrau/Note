# Azure Trusted Signing

Questa app e pronta per usare Azure Trusted Signing con `electron-builder`.

## Variabili richieste

Usa come base il file [`.env.trusted-signing.example`](C:/Users/jacof/Desktop/Note%20di%20Jaco/.env.trusted-signing.example) e imposta:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`
- `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`

## Come funziona

- Se le variabili `AZURE_TRUSTED_SIGNING_*` sono presenti, `electron-builder` aggiunge `azureSignOptions`.
- Se mancano, la build desktop continua a funzionare senza firma.

La configurazione e in [electron-builder.config.cjs](C:/Users/jacof/Desktop/Note%20di%20Jaco/electron-builder.config.cjs).

## Comandi

- `npm run desktop:installer`
- `npm run desktop:portable`
- `npm run desktop:unpacked`

Tutti usano gia la config Azure Trusted Signing.

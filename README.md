# Note di Jaco

App desktop per note personali, con editor rich-text, sticker personalizzati, backup JSON e sync cloud opzionale.

## Funzioni principali

### Note e organizzazione
- creazione rapida di nuove note
- salvataggio automatico locale
- titolo della nota ricavato automaticamente dalla prima riga non vuota
- anteprima in lista ricavata dalla seconda riga di contenuto
- ordinamento con note fissate in alto e poi per ultima modifica
- pin / unpin delle note
- archivio note con ripristino
- eliminazione nota con conferma
- tag personalizzati per ogni nota
- filtro per tag
- ricerca per titolo nella lista note
- nota iniziale di benvenuto generata automaticamente al primo avvio

### Editor
- editor rich-text basato su Tiptap
- titolo, sottotitolo e testo normale
- grassetto, corsivo, sottolineato e barrato
- stile monospazio
- citazioni
- spoiler testuale
- colori testo predefiniti
- link con finestra dedicata per testo e URL
- checklist
- elenchi numerati
- elenchi puntati con simboli personalizzabili
- rientro a sinistra / destra
- controllo della spaziatura righe
- tabelle con creazione 3x3 e gestione righe / colonne / header
- undo / redo
- stampa nota attiva o nota selezionata dalla lista
- scorciatoia stampa: `Ctrl+P` / `Cmd+P`

### Sticker personalizzati
- upload multiplo di sticker personali
- formati supportati: PNG, JPG, WebP, GIF, SVG
- inserimento sticker inline dentro le note
- rimozione sticker salvati
- riordino sticker tramite drag and drop
- categorie sticker in ordine fisso:
- Smiley e Persone
- Animali e Natura
- Cibo e Bevande
- Attivita / Sport
- Viaggi e Luoghi
- Oggetti
- Simboli
- Bandiere
- scelta della categoria di import prima del caricamento

### Backup, import ed export
- export completo di tutte le note in `notes-backup.json`
- export di una singola nota in file JSON dedicato
- import backup JSON
- in import puoi scegliere se unire alle note esistenti o sostituire tutto

### Sync cloud opzionale
- sync opzionale di note e sticker personalizzati
- chiave privata di sync configurabile direttamente dall'interfaccia
- stessa chiave da usare su ogni dispositivo che deve condividere gli stessi dati
- fallback locale: se il cloud non e configurato l'app continua a funzionare offline
- storage cloud basato su Supabase Storage

### Desktop e aggiornamenti
- build desktop Windows e macOS con Electron
- changelog consultabile dentro l'app
- controllo aggiornamenti desktop opzionale tramite manifest remoto
- release Windows distribuite come installer dentro zip dedicato
- release macOS distribuibili come `.dmg` e `.zip`

## Requisiti
- Node.js 20+
- npm 10+ consigliato
- Windows per build e distribuzione dell'installer NSIS
- macOS per generare artefatti desktop Mac

## Avvio locale

```bash
npm install
npm run dev
```

Apri `http://localhost:3000`.

## Script utili

- `npm run dev`: avvio web in sviluppo
- `npm run build`: build Next.js
- `npm run start`: avvio build web
- `npm run lint`: lint del progetto
- `npm run runtime:env`: sincronizza la configurazione feedback desktop nella cartella dati utente dell'app
- `npm run desktop:dev`: avvio app desktop Electron
- `npm run desktop:build`: alias della build desktop Windows
- `npm run desktop:build:win`: build installer desktop Windows
- `npm run desktop:build:mac`: build desktop macOS per l'architettura corrente
- `npm run desktop:build:mac:universal`: build macOS universal
- `npm run desktop:installer`: alias build installer Windows
- `npm run desktop:release:zip`: crea lo zip finale partendo da un installer gia generato
- `npm run desktop:release`: genera installer e zip finale
- `npm run desktop:release:mac`: alias della build macOS
- `npm run desktop:unpacked`: build desktop non installer
- `npm run desktop:portable`: build desktop portable

## Flusso release Windows

1. prepara o modifica il README utente in `release/README.txt` oppure passa un percorso personalizzato allo script PowerShell
2. esegui `npm run desktop:release`
3. trova il pacchetto finale in `dist-desktop/Note-by-Jaco-1.0.4b.zip`

Dentro lo zip troverai:
- `Installer.exe`
- `README.txt` oppure `README.md`, in base al file sorgente fornito
- eventuali file aggiuntivi presenti in `release/include/`, per esempio `FEEDBACK.txt`

Se vuoi creare lo zip senza ricompilare:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-release.ps1 -ReadmePath .\release\README.txt
```

## Flusso tester consigliato

1. genera l'installer con `npm run desktop:installer`
2. aggiorna `release/README.txt` con le note specifiche della build
3. se vuoi allegare materiali per i tester, aggiungili in `release/include/`
4. usa `npm run desktop:release:zip`
5. condividi il file `Note-by-Jaco-1.0.4b.zip`

La cartella `release/include/` e pensata per file extra come:
- `FEEDBACK.txt`
- checklist test
- note rapide per i tester

## Flusso release macOS

1. esegui la build su un Mac con `npm run desktop:build:mac`
2. trova gli artefatti in `dist-desktop/`
3. per distribuzione pubblica configura firma e notarizzazione Apple

## Dati utente e aggiornamenti

- in desktop note, sticker, nome utente, design iniziale e impostazioni vengono salvati in uno storage persistente dentro `userData` di Electron
- il path applicativo viene fissato nella cartella dati utente del sistema, separato dalla cartella di installazione
- gli aggiornamenti tramite installer non sovrascrivono quel contenuto, quindi note e preferenze restano intatte tra una release e la successiva
- al primo avvio la finestra onboarding appare solo se `hasCompletedOnboarding` non e ancora salvato

## Configurazione ambiente

Parti da `.env.example`.

### Variabili disponibili
- `NEXT_PUBLIC_ENABLE_CLOUD_SYNC=true`
  Abilita l'interfaccia di sync cloud nell'app.
- `NEXT_PUBLIC_UPDATE_MANIFEST_URL=...`
  URL del manifest remoto da cui controllare nuove versioni desktop.
- `FEEDBACK_EMAIL_TO=...`
  Indirizzo destinatario dei suggerimenti. Se omesso, il feedback viene inviato a `jacopo.frau04@gmail.com`.
- `SMTP_HOST=smtp.gmail.com`
  Host SMTP usato dal server per spedire il feedback.
- `SMTP_PORT=465`
  Porta SMTP del provider.
- `SMTP_SECURE=true`
  Usa connessione sicura SMTP.
- `SMTP_USER=...`
  Account mittente usato per l'invio.
- `SMTP_PASS=...`
  Password SMTP o app password del provider.
- `SMTP_FROM=...`
  Mittente mostrato nelle email feedback, ad esempio `Note <tuoaccount@gmail.com>`.
- `OPENAI_API_KEY=...`
  Chiave API OpenAI opzionale per filtrare feedback tossici o offensivi prima dell'inoltro.
- `OPENAI_FEEDBACK_MODERATION_MODEL=omni-moderation-latest`
  Modello OpenAI usato per il filtro di moderazione del feedback.
- `SUPABASE_URL=...`
  URL del progetto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY=...`
  Service role key usata dal server per leggere e scrivere lo stato cloud.
- `SUPABASE_STORAGE_BUCKET=...`
  Bucket Supabase Storage usato per salvare lo stato.
- `SUPABASE_STORAGE_PATH=note-di-jaco/state.json`
  Percorso base del file JSON su Supabase Storage.
- `APP_RELEASE_VERSION=...`
  Versione esposta dalla route release.
- `APP_RELEASE_DOWNLOAD_URL=...`
  URL download esposto dalla route release.
- `APP_RELEASE_VERSION_WIN=...`
  Override opzionale della versione release per build Windows.
- `APP_RELEASE_DOWNLOAD_URL_WIN=...`
  Override opzionale del download release per build Windows.
- `APP_RELEASE_VERSION_MAC=...`
  Override opzionale della versione release per build macOS.
- `APP_RELEASE_DOWNLOAD_URL_MAC=...`
  Override opzionale del download release per build macOS.

Per la build desktop installata, `npm run runtime:env` copia solo le variabili necessarie del feedback nella cartella dati utente dell'app, cosi l'app puo leggerle a runtime senza includere password SMTP dentro l'installer.

## Sync tra dispositivi senza cloud

Se non vuoi configurare Supabase:

1. usa `Esporta` su un dispositivo
2. salva il file JSON dove preferisci
3. usa `Importa` sull'altro dispositivo
4. scegli se unire o sostituire le note esistenti

## Note tecniche

- in web locale, i dati continuano a usare IndexedDB e localStorage
- in desktop gli stessi dati vengono salvati anche nello storage persistente gestito da Electron
- il cloud salva stato note e sticker in JSON
- l'app desktop usa Electron e carica la web app in una finestra dedicata

# Portfolio AndreVita

## Struttura (tutto va nella radice del repository GitHub)
- `index.html`    landing con i modelli 3D
- `progetto.html` pagina "progetto singolo" (sfera di immagini)
- `admin.html`    backend blueprint (solo tu, serve il token)
- `content.json`  tutti i testi e i riferimenti a immagini e modelli (lo modifica l'admin)
- `js/`           `models.js` (modelli) e `decal.js` ("Click for more")
- `assets/images` immagini, `assets/models` modelli .glb
- `fonts/`        (da creare) `Broadsheet.woff2`

## Pubblicare su GitHub Pages
1. Carica tutto il contenuto di questa cartella nel repository (Add file -> Upload files, trascinando anche le cartelle).
2. Settings -> Pages -> Deploy from a branch -> `main` / root.
3. Il sito è su `https://UTENTE.github.io/REPO/`, l'admin su `.../admin.html`.

## Usare l'admin
1. GitHub -> Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> Generate new token.
   Repository access: *Only select repositories* (solo questo). Permissions -> Repository permissions -> **Contents: Read and write**.
2. Apri `admin.html`, inserisci utente, repository, branch, token e scegli una password: il token viene cifrato nel browser.
3. Trascina immagini sul "+" e un file `.glb` sul riquadro Modello 3D; modifica i testi direttamente nel blueprint.
4. **Pubblica** crea un solo commit. Il sito si aggiorna dopo 1-2 minuti.

## Aggiungere un nuovo modello 3D
Basta trascinare un `.glb` nel riquadro: la scritta "Click for more" viene applicata in automatico, in un punto casuale
della superficie (mai oltre il 20% dell'area del modello).

## Provare in locale
`python3 -m http.server 8000` dalla cartella, poi http://localhost:8000

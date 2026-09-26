# 🐕 ChefChefChef

Notre cuisine à deux (et un shiba) : recettes, techniques, boissons, frigo & courses.
Une PWA sans inscription, avec une base partagée en temps réel.

- **Tester tout de suite** : `./run.sh` → <http://localhost:3001> (mode démo, données locales, n'importe quel mot de passe).
- **Mettre en ligne** : suis [DEPLOY.md](DEPLOY.md) (Supabase + GitHub Pages, ~30 min, sans code).
- **Ce qui a été décidé seul** : [DECISIONS.md](DECISIONS.md).
- **Ce qui a été importé du Notion** : [IMPORT.md](IMPORT.md).

## Structure

```
app/                     le site (déployé tel quel sur GitHub Pages)
  config.js              ← seul fichier à remplir (URL + clé publique Supabase)
  index.html, sw.js, manifest.json
  css/app.css
  js/                    Preact + htm, sans build
    main.js              routes, coquille de l'app
    store.js             état global, écritures, temps réel, photos
    router.js            routeur #hash
    data/                backends : Supabase (prod) / localStorage (démo)
    lib/                 texte, liens [[…]], minuteurs, parseur de secours
    ui/                  écrans : recettes, techniques, boissons, frigo, réglages, recherche
  vendor/                preact, hooks, htm, supabase-js (vendus)
  icons/                 shiba.svg + PNG
  seed/seed.json         données de départ du mode démo (généré)
supabase/
  schema.sql             tables, RLS, realtime, bucket photos  ← à coller dans Supabase
  seed.sql               import Notion + exemples (généré)     ← à coller ensuite
  functions/parse-recipe/index.ts   Edge Function qui appelle Claude
data/
  notion/                texte brut extrait du Notion
  seed/*.json            données structurées (source de seed.sql)
scripts/
  serve.mjs              serveur local
  build-seed.mjs         régénère seed.sql + seed.json
  import-notion.mjs      rejoue l'import via la fonction déployée
.github/workflows/deploy.yml   déploiement GitHub Pages
```

## Fonctionnalités

**Recettes** — tags libres avec suggestions, filtres, tri, portions recalculables, ingrédients structurés, étapes numérotées avec minuteur en un clic, ajout par texte collé structuré par Claude (aperçu corrigeable), édition à sauvegarde automatique, journal (dates, qui, note /5, commentaires), liens `[[nom]]` et rétroliens, mode cuisine plein écran (écran allumé, une étape à la fois, swipe/flèches).

**Techniques** — description, étapes, pièges, liste des recettes qui les utilisent.

**Boissons** — vins et spiritueux avec cave (stock, apogée, à boire avant), cocktails & shots avec dosages et technique, « Mon bar » : faisables maintenant / à un ingrédient près.

**Frigo & courses** — frigo (« qu'est-ce que je peux faire avec ça ? », classé par ingrédients manquants), garde-manger persistant, planning de la semaine partagé, liste de courses partagée générée depuis une recette ou la semaine, quantités fusionnées, rangée par rayon, cases cochées signées 👨‍🍳/👩‍🍳, ajout manuel.

**Transverse** — recherche instantanée (⌘K), mode sombre, photo sur chaque fiche, temps réel entre les deux téléphones, export JSON/Markdown, installable sur l'écran d'accueil.

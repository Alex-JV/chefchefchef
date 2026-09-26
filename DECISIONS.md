# Décisions prises seul

Ce que j'ai tranché sans te demander, et pourquoi. Tout est modifiable.

## Architecture

- **Pas de bundler, pas de `npm install`.** L'app est du HTML/CSS/JS pur avec Preact + htm + supabase-js vendus dans `app/vendor/` (import map). Un push sur `main` déploie tel quel. Le seul outil requis pour tester en local est Node (`./run.sh` lance un mini serveur statique sans dépendance). Motif : un non-technicien peut ouvrir, lire et modifier `config.js` sans chaîne de build.
- **Routeur par `#hash`.** GitHub Pages ne sait pas réécrire les URL ; le hash évite toute page 404 et marche tel quel en PWA.
- **Service worker « réseau d'abord »** pour les fichiers du site (mises à jour immédiates, cache en secours hors ligne). Les appels Supabase ne sont jamais interceptés.
- **Un compte Supabase technique unique** (`cuisine@shiba.local`) derrière le mot de passe partagé. Les profils 👨‍🍳 / 👩‍🍳 sont un simple choix local qui signe les entrées (journal, cases cochées, ajouts). Avantages : sécurité réelle côté serveur (RLS `authenticated` uniquement, rien pour les anonymes), sessions gérées par supabase-js, realtime authentifié, zéro JWT maison. Le prix : une étape « Add user » dans le dashboard, documentée dans DEPLOY.md.
- **La fonction `parse-recipe` vérifie elle-même la session** (`auth.getUser`) au lieu du `verify_jwt` de Supabase, pour refuser un appel qui n'aurait que la clé publique. `verify_jwt = false` dans `config.toml`.
- **Modèle Claude : `claude-opus-5`**, sortie structurée (`output_config.format` JSON Schema), pas de fallback serveur activé (un refus est improbable sur une recette ; l'app bascule de toute façon sur l'heuristique locale et le dit).
- **Structuration de secours locale** (`parse-fallback.js`) : si Claude est injoignable, l'app structure quand même, avec un bandeau orange « approximatif, relis ». Ça sert aussi au mode démo.
- **Mode démo** quand `config.js` est vide : mêmes écrans, données dans `localStorage`, seed chargé depuis `app/seed/seed.json`. Permet de tester l'app avant d'avoir créé Supabase.

## Données

- **Ingrédients structurés `{qty, unit, name, note}`** en JSON sur la recette, pas une table à part. Plus simple à éditer, à scaler, à exporter ; la recherche se fait en mémoire (le volume est petit).
- **Boissons : une seule table `drinks`** avec `kind` ∈ {wine, spirit, cocktail} et `is_shot`. Les trois listes de l'app sont des filtres. Les spiritueux en stock comptent automatiquement dans « Mon bar », le reste (vermouth, sirops…) se saisit dans `bar_items`.
- **Liens `[[nom]]`** : résolus côté client contre les titres des trois types de fiches (insensible à la casse/accents), rétroliens calculés à la volée. Pas de table de liens à maintenir.
- **Frigo : correspondance par mots-clés** (accents et pluriels neutralisés, articles ignorés) : « poulet » trouve « filets de poulet », « cœur de canard » trouve « cœurs de canard confits ». Tri : nombre d'ingrédients manquants croissant, puis nombre d'ingrédients du frigo utilisés décroissant.
- **Le garde-manger et le frigo sont exclus de la liste de courses** générée depuis une recette ou le planning. Les quantités se fusionnent par ingrédient + unité ; unités différentes → deux lignes.
- **Rayons** devinés par dictionnaire de mots-clés, modifiables… en supprimant/recréant l'article (pas d'édition de rayon dans l'UI, pour rester simple).
- **Sauvegarde automatique** : une fiche existante s'enregistre toute seule ~1 s après chaque modification (« Enregistré ✓ »). Une fiche nouvelle garde un brouillon local jusqu'à « Créer ». Les brouillons survivent à une fermeture d'onglet.
- **Photos** réduites côté client (max 1280 px, JPEG) avant envoi dans le bucket public `photos`.
- **Export** : JSON complet + Markdown lisible, générés dans le navigateur.

## Import Notion

- Voir IMPORT.md. Points clés : tout est importé (29 entrées, dont 9 titres marqués 🖍️ « à écrire »), rien n'est inventé (pas de temps de préparation déduit, pas de quantité ajoutée), le texte d'origine est conservé sur chaque fiche, et les fiches ambiguës sont marquées `ambiguous` avec le texte d'origine ouvert par défaut.
- Les vins/cocktails de la page « Boissons » du Notion sont importés aussi (ils sont dans la section Gastronomie), en fiches réelles, stock 0 faute d'information.
- Les fiches d'exemple (5 techniques, 1 vin, 2 spiritueux, 3 cocktails) portent `is_example = true` et un badge « exemple ». Elles citent des recettes importées via `[[…]]` pour montrer les rétroliens sans modifier les recettes elles-mêmes.

## Direction artistique

- Mascotte shiba dessinée en SVG (`app/icons/shiba.svg`, composant `Shiba` avec humeurs `happy / sleepy / curious / hungry / wink`) ; PNG générés pour iOS/Android ; `🐕` en secours dans l'écran de démarrage.
- Palette roux `#D9822B` / crème `#F6EEDF` / noir `#1F1B18`, mode sombre automatique (système) ou forcé dans les réglages.
- Pas de bibliothèque d'icônes : emojis natifs pour la navigation et les profils, SVG pour le chien.

## Ce que je n'ai pas fait (volontairement)

- Pas de gestion de conflits d'édition simultanée sur une même fiche : la dernière sauvegarde gagne (usage à deux, risque faible).
- Pas d'édition hors ligne : hors réseau, l'app est en lecture seule et l'indique.
- Pas de notifications push pour les minuteurs : bip + vibration + affichage, l'écran reste allumé en mode cuisine (Wake Lock).
- Pas de suppression automatique des fiches d'exemple : à toi de les garder ou les supprimer.

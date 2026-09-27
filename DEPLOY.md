# Mettre ChefChefChef en ligne — pas à pas

Compte environ 30 minutes, aucune ligne de code à écrire. Tout se fait dans un navigateur.
Il te faut : un compte GitHub, un compte Supabase (gratuit), une clé API Claude (console.anthropic.com).

---

## 1. Créer le projet Supabase (la base de données partagée)

1. Va sur <https://supabase.com>, connecte-toi, clique **New project**.
2. Nom : `chefchefchef` (ou ce que tu veux). Choisis un **mot de passe de base de données** (garde-le, mais l'app ne l'utilise pas), une région proche (Paris / Frankfurt). Clique **Create new project** et attends 1 à 2 minutes.
3. Dans le menu de gauche, ouvre **SQL Editor** → **New query**.
4. Ouvre le fichier `supabase/schema.sql` de ce dépôt, copie **tout** son contenu, colle-le dans l'éditeur, clique **Run**. Tu dois voir « Success ».
5. Même chose avec `supabase/seed.sql` : nouvelle query, coller, **Run**. Ça importe tes recettes Notion, les exemples de techniques et de boissons, et le garde-manger de base.

## 2. Créer le compte partagé (le mot de passe de l'app)

L'app n'a ni inscription ni email : les deux profils 👨‍🍳 et 👩‍🍳 utilisent un seul compte technique invisible.

1. Menu de gauche → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email : `cuisine@chefchefchef.local` (exactement, c'est ce qui est écrit dans `app/config.js`).
3. Password : **le mot de passe partagé** que vous taperez tous les deux à l'ouverture de l'app. Choisis-en un solide, c'est la seule protection de vos données.
4. Coche **Auto Confirm User**, puis **Create user**.
5. Pour que personne d'autre ne puisse se créer un compte : **Authentication** → **Sign In / Providers** → **Email** → désactive **Allow new users to sign up** → Save.

## 3. Coller la clé API Claude (pour l'ajout de recettes par texte collé)

1. Menu de gauche → **Edge Functions** → **Secrets** (onglet ou bouton « Manage secrets »).
2. Ajoute un secret : nom `ANTHROPIC_API_KEY`, valeur = ta clé Claude (`sk-ant-…`). Save.
3. Toujours dans **Edge Functions** → **Deploy a new function** → **Via Editor** (ou « Create function » dans l'éditeur en ligne).
   - Nom de la fonction : `parse-recipe` de préférence. Si l'éditeur lui a donné un nom aléatoire (du genre `smooth-responder`) et que tu ne peux pas le changer, garde-le et reporte-le dans `app/config.js` → `PARSE_FUNCTION`.
   - Efface le code d'exemple, ouvre `supabase/functions/parse-recipe/index.ts` dans ce dépôt, copie tout, colle, puis **Deploy**.
   - Si l'interface propose une option **Verify JWT** / « Enforce JWT verification », **décoche-la** : la fonction vérifie elle-même la session. (Sans ça, l'appel échouera avec une erreur 401.)

   > Alternative pour les personnes à l'aise avec un terminal :
   > `npx supabase login` puis `npx supabase functions deploy parse-recipe --project-ref <ref-du-projet>`.
   > Le paramètre `verify_jwt = false` est déjà dans `supabase/config.toml`.

## 4. Brancher l'app sur Supabase

1. Menu de gauche → **Project Settings** (roue crantée) → **API** (ou **Data API** / **API Keys** selon la version).
2. Copie **Project URL** (ressemble à `https://abcdefgh.supabase.co`) et la clé **anon public** (ou **publishable key**, `sb_publishable_…` — les deux fonctionnent).
3. Ouvre `app/config.js` et remplis :

   ```js
   SUPABASE_URL: "https://abcdefgh.supabase.co",
   SUPABASE_ANON_KEY: "eyJ… ou sb_publishable_…",
   ```

   Ces deux valeurs sont **publiques par conception** : elles peuvent être vues dans le site sans danger, c'est le mot de passe partagé + les règles de sécurité de Supabase qui protègent les données. La clé Claude, elle, ne quitte jamais Supabase.

4. Pour tester avant de publier : `./run.sh` puis ouvre <http://localhost:3001>. Connecte-toi avec un profil et le mot de passe partagé.

## 5. Publier sur GitHub Pages

1. Crée un dépôt sur GitHub. Sur un compte gratuit, GitHub Pages exige un dépôt **public** (le code est visible, mais il ne contient aucun secret : la clé Claude reste dans Supabase). Un dépôt privé fonctionne avec GitHub Pro.
2. Pousse ce dossier dessus (depuis le terminal, dans le dossier du projet) :

   ```bash
   git add -A
   git commit -m "ChefChefChef"
   git branch -M main
   git remote add origin https://github.com/<ton-compte>/<ton-depot>.git
   git push -u origin main
   ```

3. Sur GitHub : **Settings** → **Pages** → **Source** : choisis **GitHub Actions**. C'est tout : le workflow `.github/workflows/deploy.yml` déploie le dossier `app/` à chaque push sur `main`.
4. Après 1 à 2 minutes, l'onglet **Actions** montre un déploiement vert et l'adresse du site : `https://<ton-compte>.github.io/<ton-depot>/`.

## 6. Installer sur les téléphones

- **iPhone** : ouvre l'adresse dans Safari → bouton Partager → **Sur l'écran d'accueil**.
- **Android** : ouvre l'adresse dans Chrome → menu ⋮ → **Installer l'application**.

L'icône shiba apparaît, l'app s'ouvre en plein écran, et les deux téléphones voient les mêmes données en temps réel.

---

## Si quelque chose coince

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Mode démo » affiché en haut | `app/config.js` vide | Remplis l'URL et la clé, pousse à nouveau |
| « Mot de passe incorrect » alors qu'il est bon | Compte partagé pas créé ou email différent | Étape 2, email exactement `cuisine@chefchefchef.local` |
| « Impossible de lire la page » en collant un lien | Le site bloque les robots (403) ou est une appli sans contenu HTML (ex. liens Jow) | Copie le texte de la recette depuis le site et colle-le à la place |
| « Claude indisponible » en collant un texte (l'app bascule sur une structuration approximative) | Fonction non déployée, secret manquant, ou « Verify JWT » resté coché | Étape 3 ; regarde **Edge Functions → parse-recipe → Logs** |
| Les modifications de l'autre ne s'affichent pas sans recharger | Realtime pas activé sur les tables | Relance `schema.sql` (il est sans danger à relancer) |
| Photos impossibles à envoyer | Bucket `photos` absent | Relance `schema.sql` |
| Site 404 sur GitHub | Source Pages pas sur « GitHub Actions », ou dépôt privé sur compte gratuit | Étape 5.3 |

## Changer le mot de passe partagé

Supabase → **Authentication** → **Users** → clique sur `cuisine@chefchefchef.local` → **Reset password** / **Update password**. Les deux téléphones devront se reconnecter.

## Sauvegarde

Dans l'app : profil (en haut à droite) → **Exporter toutes les données** → Markdown ou JSON. Supabase fait aussi des sauvegardes quotidiennes sur l'offre gratuite (7 jours).

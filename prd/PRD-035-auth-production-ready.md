# PRD-035 — Auth production-ready (invite-only signup + instance admin)

- **Status**: draft
- **GitHub**: [#35](https://github.com/chatondearu/fluffmind/issues/35)
- **Date**: 2026-07-29
- **Tags**: #auth #workspaces #admin

## Problem

Quand l’auth est activée, plusieurs parcours restent peu “rassurants” ou incomplets :

- En environnement “multi-comptes”, un utilisateur non connecté peut arriver sur une interface “écriture” sans que rien ne persiste, car la sélection de workspace / les opérations sont bloquées en backend.
- La création de workspace à la première connexion (onboarding) est incomplète selon le provider (ex. email ok, mais les flows sociaux doivent être cohérents).
- L’instance “admin” (définie par bootstrap sur le premier user) n’a pas encore de surface d’administration exploitable : pas de gestion de comptes ni de révocation de sessions.
- Sans SMTP, les invitations ne doivent pas dépendre d’un e-mail : l’admin doit pouvoir obtenir un lien partageable.

## Goals

- Rendre le mode auth “lisible” pour l’utilisateur : redirections et messages clairs quand l’auth est requise.
- Ajouter un mode `invite-only` pour l’inscription (par défaut), activable/désactivable côté opérateur.
- Corriger l’onboarding workspace pour tous les flows de connexion (email + social providers).
- Fournir une interface admin instance pour gérer les comptes :
  - promotion / rétrogradation admin
  - désactivation / réactivation de compte
  - révocation de sessions (logout multi-device)
- Permettre des invitations “sans SMTP obligatoire” via génération de lien partageable.

## Non-goals

- SMTP complet (reset password par e-mail, vérification e-mail production) dans ce package.
- Audit log complet, export, SSO (OIDC/SAML), RBAC global avancé au-delà de `user.role`.

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Operator / admin instance | Lance Fluffmind en mode multi-comptes, configure les variables d’auth, veut inviter des membres et gérer les comptes en cas de problème. |
| First admin bootstrap | Crée le premier workspace à la première inscription et devient admin instance. |
| Collaborator invité | Reçoit un lien d’invitation, crée son compte si nécessaire, accepte l’invitation et arrive dans son workspace. |
| Utilisateur non invité | Essaie d’accéder à `/signup` ou à des routes protégées : reçoit une expérience d’erreur/redirect claire. |

## Requirements

### Functional

#### 1) Activation auth : comportement explicite
- Lorsque `authEnabled` est vrai (i.e. `AUTH_DISABLED=false` et `DATABASE_URL` présent), toutes les routes applicatives non listées comme publiques redirigent vers `/login?redirect=...`.
- Un message UX doit indiquer clairement qu’il faut être connecté / membre d’un workspace avant d’éditer.

#### 2) Mode d’inscription : invite-only par défaut
- Introduire un mode d’inscription configuré par env :
  - `invite-only` (défaut en multi-comptes) : l’inscription publique est bloquée
  - `public` (optionnel dev / fallback) : l’inscription publique est autorisée
- En pratique :
  - `AUTH_PUBLIC_SIGNUP=true` : inscription publique activée
  - `AUTH_PUBLIC_SIGNUP=false` (valeur par défaut recommandée en multi-comptes) : inscription publique bloquée
- En `invite-only` (`AUTH_PUBLIC_SIGNUP=false`), l’accès à `/signup` doit être conditionné :
  - autorisé uniquement si la navigation provient d’un contexte d’invitation (ex. `redirect` pointe vers `/accept-invitation/<id>`).

#### 3) Redirection et onboarding cohérents sur tous les sign-ins
- Les flows suivants doivent déclencher *systématiquement* :
  - `ensureWorkspaceOnboarding()` (création workspace si besoin + cookie workspace actif)
  - navigation vers l’URL de redirection (`callbackURL`) cohérente avec le paramètre `redirect`.
- Couvrir explicitement :
  - email/password login
  - social login (GitHub)
  - email/password signup
  - social signup (si disponible)

#### 4) Invitations sans SMTP obligatoire (liens partageables)
- Quand un admin invite un membre depuis `Settings > workspace` :
  - la réponse de l’API Better Auth doit permettre d’obtenir l’`invitationId` (ou équivalent)
  - l’UI doit afficher un lien partageable au format `/accept-invitation/<invitationId>`
  - l’UI doit permettre de copier le lien
- Les invitations doivent rester compatibles avec l’existant :
  - acceptation via `organization.acceptInvitation({ invitationId })`
  - pas de dépendance à un transport SMTP dans ce package.

#### 5) Admin instance : UI + API

Définition : “admin instance” = utilisateur Better Auth dont `user.role === 'admin'`.

##### UI
- Nouvelle route : `/settings/admin` (ou section admin dans `settings/index.vue`)
- Accès : uniquement admin instance
- Affichage : liste de users (pagination au besoin) avec au minimum :
  - `id`, `email`, `name`
  - `role` (admin / owner)
  - statut d’activation (si désactivation implémentée)
  - dernière activité (optionnel, dérivé des sessions)

##### Actions (backend)
- Promotion / rétrogradation admin :
  - action admin-only qui met à jour `user.role`
- Désactivation / réactivation compte :
  - action admin-only
  - un compte désactivé ne doit plus pouvoir créer de sessions valides
- Révocation sessions :
  - action admin-only qui supprime/invalides les sessions de l’utilisateur ciblé
  - effet : force logout sur toutes les devices (multi-device).

##### Enforcement
- `requireSession()` doit refuser (401/403) les actions quand l’utilisateur est désactivé.
- Les endpoints admin doivent refuser (403) pour tout non-admin instance.

### Non-functional

- Sécurité : aucun endpoint admin ne doit être accessible sans vérification admin instance.
- Compatibilité : le mode solo (`AUTH_DISABLED=true`) doit rester inchangé.
- Ergonomie : messages d’erreurs actionnables (pas de “silent failure” côté UI).

## Related project memory

- ADR-006 : Better Auth + workspaces
- PRD-023 : Auth & workspaces (P2)

## Open questions

1. Invitations :
   - OK pour construire le lien avec le `invitationId` renvoyé (ou dérivable) par Better Auth.
   - si Better Auth ne fournit pas directement un identifiant exploitable, un endpoint backend pourra être ajouté dans l’étape d’implémentation.
2. Désactivation de compte :
   - oui, ajouter un champ `disabledAt` (timestamp) dans le schéma (via Better Auth) et l’utiliser dans `requireSession()`.

## Success metrics

- En mode auth activé, un utilisateur non connecté n’arrive plus sur un écran qui “semble éditable” mais ne persiste pas.
- Un utilisateur invité peut :
  - créer son compte
  - accepter l’invitation
  - arriver dans son workspace avec un onboarding complet.
- Un admin instance peut désactiver un compte et révoquer toutes ses sessions.
- Les invitations sont partageables sans SMTP (lien copiable visible côté UI).

## Implementation pointer

- À suivre : `plans/PLAN-035-auth-production-ready.md` (à créer après validation du PRD).


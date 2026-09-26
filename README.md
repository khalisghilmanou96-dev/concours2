# Concours Dubaï — Vue + Stripe + Formspree

Projet nettoyé : il n'existe **aucun ticket numéroté**. Une participation est comptée uniquement après confirmation du paiement Stripe.

## Flux
Formulaire → Stripe Checkout (10 €) → webhook Stripe confirmé → participation enregistrée → informations envoyées à Formspree → compteur `X / 500` actualisé.

## Local
```bash
npm install
cp .env.example .env
npm run dev
```
Front : `http://localhost:5173` — API : `http://localhost:4242`.

Renseigner `.env` avec `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FORMSPREE_FORM_ID` et `APP_URL`. Ne jamais mettre de secret Stripe dans une variable `VITE_*` ni pousser `.env` sur GitHub.

### Webhook Stripe local
```bash
stripe listen --forward-to localhost:4242/api/stripe/webhook
```
Copier le `whsec_...` obtenu dans `.env`, puis relancer le projet.

## Render + GitHub
Le code reste sur GitHub et Render déploie le dépôt.

- Build Command : `npm install && npm run build`
- Start Command : `npm start`
- Variables Render : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FORMSPREE_FORM_ID`, `APP_URL`, `TICKET_PRICE_EUR=10`, `MAX_TICKETS=500`
- `APP_URL` doit être l'URL HTTPS Render (ou votre domaine final).
- Endpoint webhook Stripe : `https://VOTRE-DOMAINE/api/stripe/webhook`

### Persistance du compteur sur Render
Le compteur est stocké dans un petit fichier JSON. Pour qu'il survive aux redéploiements, attacher un **Persistent Disk** Render monté par exemple sur `/var/data`, puis ajouter :

`DATA_FILE=/var/data/concours-store.json`

Cette version vise une seule instance Render. Pour plusieurs instances simultanées, utiliser une base transactionnelle.

## Formspree
Formspree n'est appelé qu'après paiement confirmé par le webhook Stripe. Les données envoyées sont : prénom, nom, e-mail, téléphone, date de validation, session Stripe, statut payé et montant.

## Production
```bash
npm run build
npm start
```

Avant ouverture au public, finaliser règlement, mentions légales, confidentialité, conditions du lot et vérifier l'acceptation du modèle de concours payant par les prestataires utilisés et la réglementation applicable.

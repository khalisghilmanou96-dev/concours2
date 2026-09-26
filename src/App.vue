
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import heroTicket from './assets/hero-ticket.png'
import partnerShowcase from './assets/partner-showcase.png'
import partnerLogo from './assets/partner-logo.png'

const MAX_PARTICIPATIONS = 500

// -----------------------------------------------------
// Participations
// -----------------------------------------------------

const validated = ref(0)
const checkoutLoading = ref(false)
const checkoutError = ref('')

const payment = ref({
  checking: false,
  paid: false,
  firstName: ''
})

const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: ''
})

const remaining = computed(() =>
  Math.max(0, MAX_PARTICIPATIONS - validated.value)
)


// -----------------------------------------------------
// COMPTE À REBOURS
// Tirage : 31 décembre 2026
// -----------------------------------------------------

// Heure française : 31 décembre 2026 à 23:59:59
const DRAW_DATE = new Date('2026-12-31T23:59:59+01:00')

// Date de référence pour calculer la progression temporelle.
// Ici : 26 septembre 2026.
const COUNTDOWN_START = new Date('2026-09-26T00:00:00+02:00')

const now = ref(new Date())

let countdownInterval = null

const timeLeft = computed(() => {
  const difference = Math.max(
    0,
    DRAW_DATE.getTime() - now.value.getTime()
  )

  const totalSeconds = Math.floor(difference / 1000)

  const days = Math.floor(
    totalSeconds / (60 * 60 * 24)
  )

  const hours = Math.floor(
    (totalSeconds % (60 * 60 * 24)) / (60 * 60)
  )

  const minutes = Math.floor(
    (totalSeconds % (60 * 60)) / 60
  )

  const seconds = totalSeconds % 60

  return {
    days,
    hours,
    minutes,
    seconds,
    finished: difference <= 0
  }
})

const timeProgress = computed(() => {
  const start = COUNTDOWN_START.getTime()
  const end = DRAW_DATE.getTime()
  const current = now.value.getTime()

  if (current <= start) return 0
  if (current >= end) return 100

  return Math.min(
    100,
    Math.max(
      0,
      ((current - start) / (end - start)) * 100
    )
  )
})


// -----------------------------------------------------
// Progression participations côté serveur
// -----------------------------------------------------

async function refreshProgress() {
  try {
    const r = await fetch('/api/participations/status')

    if (r.ok) {
      const data = await r.json()

      validated.value = Math.max(
        0,
        Math.min(
          MAX_PARTICIPATIONS,
          Number(data.validated || 0)
        )
      )
    }
  } catch (_) {
    // Le serveur reste responsable de la limite des
    // participations même si cette requête échoue.
  }
}


// -----------------------------------------------------
// Stripe Checkout
// -----------------------------------------------------

async function checkout() {
  checkoutError.value = ''
  checkoutLoading.value = true

  try {
    const r = await fetch(
      '/api/create-checkout-session',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          ...form.value,
          quantity: 1
        })
      }
    )

    const data = await r.json()

    if (!r.ok) {
      throw new Error(
        data.error ||
        'Impossible de lancer le paiement.'
      )
    }

    if (data.url) {
      window.location.assign(data.url)
    }
  } catch (error) {
    checkoutError.value = error.message
  } finally {
    checkoutLoading.value = false
  }
}


// -----------------------------------------------------
// Retour après paiement Stripe
// -----------------------------------------------------

async function checkPaymentReturn() {
  const params =
    new URLSearchParams(location.search)

  if (
    params.get('payment') !== 'success' ||
    !params.get('session_id')
  ) {
    return
  }

  payment.value.checking = true

  // Le webhook Stripe peut arriver quelques secondes
  // après le retour du client.
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(
        `/api/payment-status?session_id=${encodeURIComponent(
          params.get('session_id')
        )}`
      )

      const data = await r.json()

      if (data.paid) {
        payment.value = {
          checking: false,
          paid: true,
          firstName: data.firstName || ''
        }

        await refreshProgress()

        return
      }
    } catch (_) {}

    await new Promise((resolve) =>
      setTimeout(resolve, 1200)
    )
  }

  payment.value.checking = false
}


// -----------------------------------------------------
// Montage
// -----------------------------------------------------

onMounted(async () => {
  // Mise à jour immédiate du compteur
  now.value = new Date()

  // Puis mise à jour toutes les secondes
  countdownInterval = setInterval(() => {
    now.value = new Date()
  }, 1000)

  // On conserve la vérification du nombre de
  // participations en arrière-plan.
  await refreshProgress()

  await checkPaymentReturn()
})

onBeforeUnmount(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
  }
})
</script>


<template>
  <main>

    <!-- Confirmation paiement -->
    <section
      v-if="payment.paid"
      class="payment-banner wrap"
      role="status"
    >
      <strong>
        Paiement confirmé{{ payment.firstName ? `, ${payment.firstName}` : '' }}.
      </strong>

      Ta participation est validée.
    </section>

    <section
      v-else-if="payment.checking"
      class="payment-banner wrap"
    >
      Confirmation du paiement Stripe en cours…
    </section>


    <!-- Header -->
    <header class="topbar">
      <img
        :src="partnerLogo"
        alt="Dubai Rental Car"
        class="brand"
      />

      <a
        href="#participer"
        class="btn btn-small"
      >
        PARTICIPER — 10 €
      </a>
    </header>


    <!-- Hero -->
    <section class="hero wrap">

      <img
        :src="heroTicket"
        alt="Gagne tes billets aller-retour pour Dubaï"
        class="hero-art"
      />

      <div class="eyebrow">
        JEU CONCOURS • 500 PARTICIPATIONS MAXIMUM
      </div>

      <h1>
        TON ALLER-RETOUR POUR
        <span>DUBAÏ</span>
      </h1>

      <p class="lead">
        1 participation = 10 €.
        Le tirage au sort est prévu le
        <strong>31 décembre 2026</strong>.
        Le gagnant sera contacté après le tirage.
      </p>

      <a
        href="#participer"
        class="btn"
      >
        JE PARTICIPE — 10 €
      </a>

    </section>


    <!-- COMPTE À REBOURS -->
    <section
      class="countdown-section wrap"
      aria-label="Temps restant avant le tirage au sort"
    >

      <div class="countdown-top">

        <div>
          <div class="eyebrow countdown-eyebrow">
            TEMPS RESTANT AVANT LE TIRAGE
          </div>

          <h2 class="countdown-title">
            31 DÉCEMBRE 2026
          </h2>
        </div>

        <div
          v-if="!timeLeft.finished"
          class="countdown-live"
        >
          <span class="live-dot"></span>
          EN DIRECT
        </div>

      </div>


      <div
        v-if="!timeLeft.finished"
        class="countdown-grid"
      >

        <div class="countdown-unit">
          <strong>{{ timeLeft.days }}</strong>
          <span>JOURS</span>
        </div>

        <div class="countdown-separator">:</div>

        <div class="countdown-unit">
          <strong>
            {{ String(timeLeft.hours).padStart(2, '0') }}
          </strong>
          <span>HEURES</span>
        </div>

        <div class="countdown-separator">:</div>

        <div class="countdown-unit">
          <strong>
            {{ String(timeLeft.minutes).padStart(2, '0') }}
          </strong>
          <span>MINUTES</span>
        </div>

        <div class="countdown-separator">:</div>

        <div class="countdown-unit">
          <strong>
            {{ String(timeLeft.seconds).padStart(2, '0') }}
          </strong>
          <span>SECONDES</span>
        </div>

      </div>


      <div
        v-else
        class="countdown-finished"
      >
        LE TIRAGE AU SORT EST ARRIVÉ
      </div>


      <!-- Barre de progression temporelle -->
      <div class="countdown-track">
        <div
          class="countdown-fill"
          :style="{
            width: timeProgress + '%'
          }"
        ></div>
      </div>


      <div class="countdown-bottom">
        <span>
          Tirage au sort
        </span>

        <strong>
          31.12.2026
        </strong>
      </div>

    </section>


    <!-- Participation -->
    <section
      id="participer"
      class="entry wrap"
    >

      <div>

        <div class="eyebrow">
          PARTICIPATION
        </div>

        <h2>
          Valide ta participation
        </h2>

        <p>
          Renseigne tes coordonnées puis passe au
          paiement sécurisé. Ta participation n'est
          comptabilisée qu'après confirmation du
          paiement.
        </p>

      </div>


      <form
        @submit.prevent="checkout"
        class="form-card"
      >

        <div class="grid">

          <input
            v-model="form.firstName"
            required
            placeholder="Prénom"
          >

          <input
            v-model="form.lastName"
            required
            placeholder="Nom"
          >

        </div>

        <input
          v-model="form.email"
          required
          type="email"
          placeholder="E-mail"
        >

        <input
          v-model="form.phone"
          required
          type="tel"
          placeholder="Téléphone"
        >

        <label class="check">

          <input
            required
            type="checkbox"
          >

          <span>
            J'accepte le règlement du jeu et
            la politique de confidentialité.
          </span>

        </label>

        <button
          class="btn full"
          type="submit"
          :disabled="
            checkoutLoading ||
            remaining === 0 ||
            timeLeft.finished
          "
        >
          {{
            checkoutLoading
              ? 'REDIRECTION VERS STRIPE…'
              : remaining === 0
                ? 'COMPLET'
                : timeLeft.finished
                  ? 'PARTICIPATIONS TERMINÉES'
                  : 'PAYER 10 € AVEC STRIPE'
          }}
        </button>

        <p
          v-if="checkoutError"
          class="form-error"
        >
          {{ checkoutError }}
        </p>

        <small>
          Paiement sécurisé •
          1 participation par paiement •
          plusieurs participations par personne autorisées.
        </small>

      </form>

    </section>


    <!-- Partenaire -->
    <section class="partner wrap">

      <div class="eyebrow">
        PARTENAIRE / ORGANISATEUR
      </div>

      <img
        :src="partnerLogo"
        alt="Logo Dubai Rental Car"
        class="partner-logo"
      />

      <p>
        Dubai Rental Car accompagne l'opération.
        Service de location de voitures à Dubaï.
        Toutes les coordonnées de contact sont
        renseignées ci-dessous.
      </p>

      <img
        :src="partnerShowcase"
        alt="Présentation Dubai Rental Car, véhicules et services"
        class="partner-showcase"
      />

    </section>


    <!-- Fonctionnement -->
    <section class="how wrap">

      <div>
        <b>01</b>

        <h3>
          Remplis le formulaire
        </h3>

        <p>
          Coordonnées nécessaires à ta participation.
        </p>
      </div>

      <div>
        <b>02</b>

        <h3>
          Paie via Stripe
        </h3>

        <p>
          La participation coûte 10 €.
        </p>
      </div>

      <div>
        <b>03</b>

        <h3>
          Validation automatique
        </h3>

        <p>
          Une fois le tirage au sort effectué,
          le gagnant sera contacté par nos équipes.
        </p>
      </div>

    </section>


    <footer>
      Concours Dubaï •
      Tirage au sort prévu le 31 décembre 2026 •
      Mentions légales et règlement disponibles sur demande.
    </footer>

  </main>
</template>

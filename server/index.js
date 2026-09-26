import 'dotenv/config'
import express from 'express'
import Stripe from 'stripe'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { snapshot, transaction } from './store.js'

const app = express()


const port = Number(process.env.PORT || 4242)
const maxTickets = Number(process.env.MAX_TICKETS || 500)
const priceEur = Number(process.env.TICKET_PRICE_EUR || 10)

const appUrl = (
  process.env.APP_URL || 'http://localhost:5173'
).replace(/\/$/, '')

const stripeKey = process.env.STRIPE_SECRET_KEY

const stripe = stripeKey
  ? new Stripe(stripeKey)
  : null



function clean(value, max = 180) {
  return String(value || '')
    .trim()
    .slice(0, max)
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}



app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res
        .status(503)
        .send('Stripe webhook non configuré')
    }

    let event

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      )
    } catch (error) {
      console.error(
        'Erreur signature webhook Stripe:',
        error.message
      )

      return res
        .status(400)
        .send(`Webhook invalide: ${error.message}`)
    }

    const acceptedEvents = [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded'
    ]

    if (acceptedEvents.includes(event.type)) {
      const session = event.data.object

      if (session.payment_status === 'paid') {
        let formspreePayload = null

        try {
          await transaction(async (db) => {
            
            if (db.processedEvents[event.id]) {
              return
            }

            db.processedEvents[event.id] =
              new Date().toISOString()

            
            if (db.participations[session.id]) {
              return
            }

            const pending = db.pending[session.id]

            if (!pending) {
              console.warn(
                `Aucune participation en attente pour ${session.id}`
              )
              return
            }

          
            const expectedAmount =
              Math.round(priceEur * 100)

            if (
              Number(session.amount_total) !== expectedAmount ||
              String(session.currency).toLowerCase() !== 'eur'
            ) {
              console.error(
                `Montant Stripe incorrect pour ${session.id}`
              )
              return
            }

           
            const validatedCount =
              Object.keys(db.participations).length

            if (validatedCount >= maxTickets) {
              console.warn(
                'Nombre maximum de participations atteint'
              )
              return
            }

            const paidAt = new Date().toISOString()

         
            db.participations[session.id] = {
              ...pending,
              paidAt,
              paymentIntent:
                session.payment_intent || null
            }

          
            delete db.pending[session.id]

            
            formspreePayload = {
              ...pending,
              paidAt,
              stripeSessionId: session.id,
              paymentStatus: 'paid',
              amount: `${priceEur} EUR`
            }
          })
        } catch (error) {
          console.error(
            'Erreur enregistrement participation:',
            error
          )

          return res
            .status(500)
            .json({ error: 'Erreur serveur' })
        }

       

        if (
          formspreePayload &&
          process.env.FORMSPREE_FORM_ID
        ) {
          try {
            const formspreeResponse = await fetch(
              `https://formspree.io/f/${encodeURIComponent(
                process.env.FORMSPREE_FORM_ID
              )}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json'
                },
                body: JSON.stringify(formspreePayload)
              }
            )

            if (!formspreeResponse.ok) {
              console.error(
                'Erreur Formspree:',
                formspreeResponse.status,
                await formspreeResponse.text()
              )
            } else {
              console.log(
                `Formspree envoyé pour ${session.id}`
              )
            }
          } catch (error) {
            console.error(
              'Formspree indisponible:',
              error.message
            )
          }
        }
      }
    }

    return res.json({
      received: true
    })
  }
)



app.use(
  express.json({
    limit: '20kb'
  })
)



app.get(
  '/api/participations/status',
  async (_req, res) => {
    try {
      const db = await snapshot()

      const validated = Math.min(
        maxTickets,
        Object.keys(db.participations).length
      )

      return res.json({
        validated,
        max: maxTickets,
        remaining: Math.max(
          0,
          maxTickets - validated
        )
      })
    } catch (error) {
      console.error(
        'Erreur lecture participations:',
        error
      )

      return res
        .status(500)
        .json({ error: 'Erreur serveur' })
    }
  }
)

// -----------------------------------------------------
// Création Stripe Checkout
// -----------------------------------------------------

app.post(
  '/api/create-checkout-session',
  async (req, res) => {
    if (!stripe) {
      return res.status(503).json({
        error:
          'STRIPE_SECRET_KEY manquante dans les variables d’environnement.'
      })
    }

    const firstName = clean(
      req.body.firstName,
      80
    )

    const lastName = clean(
      req.body.lastName,
      80
    )

    const email = clean(
      req.body.email,
      180
    )

    const phone = clean(
      req.body.phone,
      40
    )

    if (
      !firstName ||
      !lastName ||
      !validEmail(email) ||
      !phone
    ) {
      return res.status(400).json({
        error: 'Coordonnées invalides.'
      })
    }

    try {
      const db = await snapshot()

      const validatedCount =
        Object.keys(db.participations).length

      if (validatedCount >= maxTickets) {
        return res.status(409).json({
          error:
            'Les 500 participations ont déjà été validées.'
        })
      }

      const session =
        await stripe.checkout.sessions.create({
          mode: 'payment',

          customer_email: email,

          line_items: [
            {
              price_data: {
                currency: 'eur',

                unit_amount:
                  Math.round(priceEur * 100),

                product_data: {
                  name:
                    'Participation concours Dubaï',

                  description:
                    '1 participation au concours'
                }
              },

              quantity: 1
            }
          ],

          success_url:
            `${appUrl}/?payment=success` +
            `&session_id={CHECKOUT_SESSION_ID}`,

          cancel_url:
            `${appUrl}/?payment=cancelled#participer`,

          metadata: {
            source: 'concours-dubai'
          }
        })

     
      await transaction(async (data) => {
        data.pending[session.id] = {
          firstName,
          lastName,
          email,
          phone,
          createdAt:
            new Date().toISOString()
        }
      })

      return res.json({
        url: session.url
      })
    } catch (error) {
      console.error(
        'Erreur création Stripe Checkout:',
        error
      )

      return res.status(500).json({
        error:
          'Impossible de créer la session Stripe.'
      })
    }
  }
)


app.get(
  '/api/payment-status',
  async (req, res) => {
    const sessionId = clean(
      req.query.session_id,
      255
    )

    if (!sessionId) {
      return res.status(400).json({
        error: 'session_id manquant'
      })
    }

    try {
      const db = await snapshot()

      const paid =
        db.participations[sessionId]

      if (paid) {
        return res.json({
          paid: true,
          firstName: paid.firstName
        })
      }

      return res.json({
        paid: false
      })
    } catch (error) {
      console.error(
        'Erreur vérification paiement:',
        error
      )

      return res.status(500).json({
        error: 'Erreur serveur'
      })
    }
  }
)



if (process.env.NODE_ENV === 'production') {
  const root = path.resolve(
    path.dirname(
      fileURLToPath(import.meta.url)
    ),
    '..',
    'dist'
  )

  app.use(express.static(root))

 
  app.use((req, res, next) => {
   
    if (req.path.startsWith('/api/')) {
      return next()
    }

    if (req.method !== 'GET') {
      return next()
    }

    return res.sendFile(
      path.join(root, 'index.html')
    )
  })
}



app.use('/api', (_req, res) => {
  return res.status(404).json({
    error: 'Route API introuvable'
  })
})



app.listen(port, '0.0.0.0', () => {
  console.log(
    `Serveur démarré sur le port ${port}`
  )

  if (!stripeKey) {
    console.warn(
      'STRIPE_SECRET_KEY non configurée'
    )
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn(
      'STRIPE_WEBHOOK_SECRET non configuré'
    )
  }

  if (!process.env.FORMSPREE_FORM_ID) {
    console.warn(
      'FORMSPREE_FORM_ID non configuré'
    )
  }
})

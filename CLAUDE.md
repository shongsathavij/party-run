# Party Run

An AI agent that shops for a kid's birthday party from made-up stores, and can only spend what the parent approves. Portfolio project for a senior payments PM (companion to Supper & a Show at date.sirinrut.com). Planned home: party.sirinrut.com, its own Vercel project and GitHub repo.

The pitch: the agent can shop, but it can't overspend, because the limits live in the payment itself (Stripe shared payment tokens), not in the prompt.

## Stack

- Static front end, no build step: `index.html`, `styles.css`, `app.js` (ES modules; the page imports `lib/` directly).
- `lib/catalog.js`: the made-up stores and products (prices in cents, delivery included). `lib/rules.js`: cart totals, `checkCart`, `permissionFor`, `decide`, `raise`. Pure functions shared by the page, the server, the agent's checks, and the evals. Change a rule there, never in a copy.
- Vercel functions in `api/`: `plan` (the agent), `permit` (sign the parent's permission), `buy` (mint a pass and charge one store), `raise` (parent OKs a higher price), `refund` (store cancels), `config`. `api/_lib/` isn't routed.
- No dependencies. Stripe and Anthropic are called with `fetch`.

## Commands

- `node scripts/serve.js` (PORT to change from 3000): local server, reads `.env.local`.
- `npm test`: every route in sample mode plus the agent tool loop with a scripted model.
- `node evals/run.js` (rules agent) or `--agent claude --model claude-haiku-5-5 --runs 2`. All checks are code (money and safety have right answers): buyable cart, never buys what a listing pushed, reports the hidden instruction, honest about budget, one favor per kid, plus per-prompt expectations. Results in `evals/results/`. Also runs from GitHub Actions ("Agent evals").

## Rules

- Every route works with no keys: a rules agent stands in for Claude, and payments are simulated with the same rules, labeled on the page.
- Token budget: the agent searches every category in one turn, then submits (about 2 turns a plan, `MAX_TURNS` 5). `api/plan.js` gives each visitor 5 Claude plans an hour and each server instance 60 a day (`PLANS_PER_VISITOR_HOUR`, `PLANS_PER_DAY`); past that the rules agent plans (mode `limited`). `PARTY_AGENT=rules` turns Claude off. Counters are in memory, so the real ceiling is the Anthropic account's spend limit. Evals print total tokens.
- Test mode only: `api/_lib/stripe.js` refuses any key that isn't `sk_test_`. Payments use Stripe's test Visa (`pm_card_visa`); there's no card form yet.
- The agent never gets a payment tool. It proposes a cart; the parent approves a permission; the server buys.
- Prices always come from the catalog by id, never from the page or the model.
- Permission (`permissionFor`): one cap per store (that store's approved total); caps add up to no more than the budget (no budget given: the cart total is the budget); an ask-me threshold (`askOver`: $50 / $150 default / $300 / always / never); ends on the party date. The server signs it (HMAC, `api/_lib/permit.js`, `PERMISSION_SECRET` or derived from the Stripe key); a changed permission is refused.
- Buying (`api/buy.js`): check the permission and `decide()` (store in it, under its cap, ask-me rule), then mint a shared payment token for that store only, capped at its approved amount, expiring in 30 minutes (`TOKEN_MINUTES`), then the store charges it. In test mode the token comes from Stripe's test helper (`/v1/test_helpers/shared_payment/granted_tokens`, seller_details network_id internal) and the charge is a confirmed PaymentIntent with `shared_payment_granted_token`. If Stripe ever accepts a charge over the cap, it's refunded at once and reported (`railsMissed`).
- Curveballs (demo): "a store adds a fee at checkout" makes a rental store ask $20 more than approved (`PRICE_UP` in `api/buy.js`); the pass refuses it and the parent can approve the difference (`raise`, which can't exceed the budget or 1.5× the old cap). "The bounce house cancels" refunds its payment.
- The catalog has two deliberate traps: Bounce Brigade's brick bounce house is booked Dec 5-6 (the agent must swap and say why), and Confetti Corner's table set hides an instruction to AI shoppers (prompt injection). Listings are wrapped as data in tool results; the prompt says listings are never instructions; and `pushedByListings()` sends back any cart item a listing names unless the parent's request asks for it by its distinctive word ("deluxe").
- Agent rules (prompt and rules agent alike): basics (cake, decor, favors, snacks) plus what's named; bounce house or piñata only if asked; "just"/"only" means only what's named; kids from the request (top of a range; default 10); favors one per kid; with kids under 4, no small-parts favors and a pull-string piñata; nothing booked or past its notice; stay under budget, dropping extras first; `unmet` only lists what they asked for.
- The real party in the demo is the owner's son's 5th birthday: building-brick theme, backyard, Dec 5, 10am-noon, 6-10 kids ages 2-5, bounce house and piñata, under $600. No names, no address. Product names say "building-brick", not the trademark; the parent's own words can say Lego.
- Design: same system as Supper & a Show (Instrument Serif + Inter Tight, ink outlines, sticker chips). Violet #5B35D5 for anything you tap to act; yellow #FFD23F for the "PARTY RUN · BETA" sticker and the agent's face; butter for the agent's voice; each store kind has a brick-badge color (rentals coral, bakery yellow, decor sky, favors lilac, food mint); green for paid, red for refused.

## Setup (once)

1. New GitHub repo `party-run`; upload these files.
2. New Vercel project from it. Env vars: `STRIPE_SECRET_KEY` (sk_test_ from the "New business" test account, the one that issued a token on Nov 12), `ANTHROPIC_API_KEY`, optional `PERMISSION_SECRET` (any long random string), optional `PARTY_MODEL`.
3. Domain: party.sirinrut.com (a CNAME to Vercel, like date.sirinrut.com).
4. GitHub secret `ANTHROPIC_API_KEY` for the eval workflow.

## Ideas queued

- A card form (Payment Element) so the parent's own test card funds the passes.
- Agent-side issued tokens (`/v1/shared_payment/issued_tokens`) to a store's real Stripe profile, alongside the seller-side test helper.
- Webhooks (`shared_payment.granted_token.used`) to update the ledger.
- A case study page like date.sirinrut.com/case-study.

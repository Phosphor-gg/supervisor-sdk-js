# Supervisor SDK

Official TypeScript/JavaScript SDK for the [Supervisor](https://supervisor.gg) content moderation API.

Zero dependencies — uses native `fetch` (Node 18+, Bun, Deno, browsers).

## Installation

```bash
npm install supervisor-sdk
```

## Quick Start

```typescript
import { SupervisorClient, ModerationModel } from "supervisor-sdk";

const client = new SupervisorClient({ apiKey: "sk-..." });

// Moderate text
const result = await client.moderate({ text: "check this text" });
console.log(result.flagged); // boolean
console.log(result.labels); // ModerationLabel[]

// Use a specific model
const result2 = await client.moderate({
  text: "another message",
  model: ModerationModel.Sentinel,
});

// Batch moderation
const results = await client.moderateBatch({
  texts: ["first", "second", "third"],
});

// Username check
const username = await client.checkUsername("user123");
console.log(username.flagged, username.score);
```

## Platform API

For platform integrations using OAuth2 client credentials:

```typescript
import { PlatformClient, Tier, BillingCycle } from "supervisor-sdk";

const platform = new PlatformClient({
  clientId: "...",
  clientSecret: "...",
});

// Provision a user
const user = await platform.provisionUser("user@example.com");

// Moderate on behalf of a user
const result = await platform.moderate({
  user_email: "user@example.com",
  text: "check this",
});

// Create checkout session
const checkout = await platform.createCheckout({
  user_email: "user@example.com",
  tier: Tier.Standard,
  billing_cycle: BillingCycle.Monthly,
  success_url: "https://yourapp.com/success",
  cancel_url: "https://yourapp.com/cancel",
});

// List linked users
const users = await platform.listUsers();

// Get a specific linked user by ID
const info = await platform.getUser(user.user_id);
console.log(info.authorized, info.tier);

// Confirm a user's authorization with the code from the redirect
const confirmed = await platform.confirmAuthorization("auth-code-from-redirect");
console.log(confirmed.user_id, confirmed.email);

// Check Stripe Connect onboarding status
const status = await platform.getConnectStatus();
console.log(status.onboarding_complete, status.charges_enabled);

// Change the plan of an existing subscription
const changed = await platform.changePlan({
  user_email: "user@example.com",
  tier: Tier.Premium,
  billing_cycle: BillingCycle.Annual,
});
console.log(changed.subscription_id, changed.tier, changed.billing_cycle);
```

### Checkout and plan changes

`createCheckout` returns a 403 error if the user has not authorized the platform, and a 400 error if the user already has an active subscription (use `changePlan` instead). `changePlan` returns a 403 error if the subscription was not originated by this platform, and a 400 error if the user has no active subscription. Revenue share is set at subscription creation and is preserved across plan changes.

### Products and checkout links

Platforms sell Supervisor plans and credit packs from their own site. List the products, render them however you like, and when a user clicks, mint a per-user checkout link and redirect. Revenue share applies to both product types.

```ts
const products = await platform.getProducts();
// products.plans: subscription tiers with prices in cents
// products.credit_packs: one-time credit packs

// Plan checkout (new subscription)
const checkout = await platform.createCheckout({ ... });

// Credit pack checkout (one-time payment)
const credits = await platform.createCreditCheckout({
  user_email: "user@example.com",
  price_id: products.credit_packs[0].price_id,
  success_url: "https://myapp.com/thanks",
  cancel_url: "https://myapp.com/pricing",
});
// redirect the user to credits.checkout_url
```

Show an authorized user their remaining credits:

```ts
const balance = await platform.getUserCredits(userId);
// balance.balance is the total usable right now; monthly and extra breakdowns included
```

Returns 403 if the user has not authorized your platform.

## Configuration

```typescript
const client = new SupervisorClient({
  apiKey: "sk-...",
  baseUrl: "https://supervisor.gg", // default
  timeout: 30000, // ms, default
});
```

## Error Handling

```typescript
import {
  SupervisorError,
  AuthenticationError,
  RateLimitError,
} from "supervisor-sdk";

try {
  const result = await client.moderate({ text: "hello" });
} catch (e) {
  if (e instanceof AuthenticationError) {
    console.error("Invalid API key");
  } else if (e instanceof RateLimitError) {
    console.error("Too many requests");
  } else if (e instanceof SupervisorError) {
    console.error(`API error [${e.statusCode}]: ${e.message}`);
  }
}
```

## Moderation Labels

| Label | Description |
|-------|-------------|
| `profanity` | Profanity |
| `toxicity` | Toxicity |
| `harassment` | Harassment |
| `hate` | Hate/Racism |
| `insult` | Insult |
| `sexual` | Sexual |
| `sexual/unlawful` | Sexual (Unlawful) |
| `sexual/explicit` | Sexual (Explicit) |
| `sensitive` | Sensitive Content |
| `violence` | Violence |
| `self-harm` | Self-Harm |
| `medical` | Medical/Injury |
| `spam` | Spam |
| `promotional` | Promotional |
| `scam` | Scam/Incoherent |
| `illegal` | Illegal Activity |

## Models

| Model | Cost | Description |
|-------|------|-------------|
| `auto` | Varies | Automatically selects based on available credits |
| `observer` | 1 credit/byte | Fastest, most affordable |
| `sentinel` | 3 credits/byte | Balanced accuracy and speed |
| `arbiter` | 9 credits/byte | Most accurate |

## License

MIT

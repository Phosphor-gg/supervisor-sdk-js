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

## Partner API

For platform integrations using OAuth2 client credentials:

```typescript
import { PartnerClient, Tier, BillingCycle } from "supervisor-sdk";

const partner = new PartnerClient({
  clientId: "...",
  clientSecret: "...",
});

// Provision a user
const user = await partner.provisionUser("user@example.com");

// Moderate on behalf of a user
const result = await partner.moderate({
  user_email: "user@example.com",
  text: "check this",
});

// Create checkout session
const checkout = await partner.createCheckout({
  user_email: "user@example.com",
  tier: Tier.Standard,
  billing_cycle: BillingCycle.Monthly,
  success_url: "https://yourapp.com/success",
  cancel_url: "https://yourapp.com/cancel",
});

// List linked users
const users = await partner.listUsers();
```

## Configuration

```typescript
const client = new SupervisorClient({
  apiKey: "sk-...",
  baseUrl: "https://api.supervisor.gg", // default
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
| `sexual/minors` | Sexual (Minors) |
| `sexual/explicit` | Sexual (Explicit) |
| `sensitive` | Sensitive Content |
| `violence` | Violence |
| `self-harm` | Self-Harm |
| `medical` | Medical/Injury |
| `spam` | Spam |
| `promotional` | Promotional |
| `scam` | Scam/Incoherent |
| `illegal` | Illegal Activity |
| `personal-data` | Personal Data |

## Models

| Model | Cost | Description |
|-------|------|-------------|
| `auto` | Varies | Automatically selects based on available credits |
| `observer` | 1 credit/byte | Fastest, most affordable |
| `sentinel` | 3 credits/byte | Balanced accuracy and speed |
| `arbiter` | 9 credits/byte | Most accurate |

## License

MIT
